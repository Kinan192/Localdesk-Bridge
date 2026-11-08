import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { FoundationError, type ToolName } from "../contracts/index.ts";
import { PolicyEngine } from "../access/index.ts";

export const MAX_TEXT_BYTES = 64 * 1024;
export const MAX_LIST_ENTRIES = 100;
export const MAX_SCANNED = 3000;
const EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".js", ".jsx", ".mjs", ".cjs",
  ".ts", ".tsx", ".html", ".css", ".py", ".php", ".sql",
  ".yml", ".yaml", ".xml", ".sh", ".toml", ".ini", ".log",
  ".astro", ".vue", ".svelte", ".go", ".rs", ".java", ".kt", ".swift",
  ".cs", ".cpp", ".c", ".h", ".hpp", ".rb", ".dart", ".svg",
]);

function partsOf(relative: string, allowRoot = false): string[] {
  if (typeof relative !== "string" || relative.length > 500 || !relative || relative.includes("\0")) {
    throw new FoundationError("INVALID_INPUT", "A non-empty relative path is required.");
  }
  if (relative === "." && allowRoot) return [];
  if (relative.startsWith("/") || relative.startsWith("\\") ||
      relative.startsWith("~") || /^[a-z]:/i.test(relative)) {
    throw new FoundationError("INVALID_INPUT", "Absolute paths are not accepted.");
  }
  const parts = relative.split(/[\\/]+/).filter(part => part.length && part !== ".");
  if (!parts.length && !allowRoot) {
    throw new FoundationError("INVALID_INPUT", "A file/folder name is required.");
  }
  for (const [i, part] of parts.entries()) {
    if (part === ".." || (part.startsWith(".") && !(part === ".gitignore" && i === parts.length - 1)) ||
        part.includes(":") || /[<>|?*]/.test(part) ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(part)) {
      throw new FoundationError("ACCESS_DENIED", "Unsafe path segment was rejected.");
    }
  }
  return parts;
}

function ensureTextExtension(filePath: string) {
  // A project may need .gitignore; other dotfiles remain blocked.
  if (path.basename(filePath).toLowerCase() === ".gitignore") return;
  if (!EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new FoundationError("ACCESS_DENIED", "File extension is not allowed for text operations.");
  }
}

async function statNoLink(filePath: string) {
  let info;
  try { info = await fs.lstat(filePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FoundationError("NOT_FOUND", "Path not found.", error);
    }
    throw error;
  }
  if (info.isSymbolicLink()) throw new FoundationError("ACCESS_DENIED", "Symbolic links are forbidden.");
  if (info.isFile() && info.nlink > 1) {
    throw new FoundationError("ACCESS_DENIED", "Hard-linked files are not supported.");
  }
  return info;
}

type ResolvedPath = {
  target: string;
  base: string;
  segments: string[];
};

/**
 * Filesystem operations are always authorized by PolicyEngine.
 *
 * Security note: JS path validation + O_NOFOLLOW on final file protects against
 * obvious traversal/symlink escapes but is not a complete defense against a
 * hostile local process swapping parent directories during a syscall (TOCTOU).
 * Remote write support MUST NOT ship until descriptor-relative containment,
 * dedicated-process isolation or equivalent hardening is implemented and tested.
 */
export class FileEngine {
  private readonly policy: PolicyEngine;
  constructor(policy: PolicyEngine) { this.policy = policy; }

  private async resolve(
    tool: ToolName,
    rootId: string,
    relative: string,
    options: { allowRoot?: boolean; missingLeaf?: boolean } = {},
  ): Promise<ResolvedPath> {
    const root = this.policy.authorize(tool, rootId);
    if (!root) throw new FoundationError("ACCESS_DENIED", "A root is required.");
    const base = path.resolve(root.absolutePath);
    const baseInfo = await statNoLink(base);
    if (!baseInfo.isDirectory()) throw new FoundationError("UNAVAILABLE", "Configured root is not a directory.");
    const actualBase = await fs.realpath(base);
    const sameBase = process.platform === "win32"
      ? actualBase.toLowerCase() === base.toLowerCase()
      : actualBase === base;
    if (!sameBase) {
      throw new FoundationError("ACCESS_DENIED", "Configured root changed or contains a symbolic link.");
    }
    const segments = partsOf(relative, options.allowRoot);
    let current = base;
    for (let i = 0; i < segments.length; i++) {
      current = path.join(current, segments[i]);
      const isLeaf = i === segments.length - 1;
      try {
        const info = await statNoLink(current);
        if (!isLeaf && !info.isDirectory()) {
          throw new FoundationError("INVALID_INPUT", "Parent path must be a directory.");
        }
      } catch (error) {
        if (isLeaf && options.missingLeaf && error instanceof FoundationError &&
            error.code === "NOT_FOUND") continue;
        throw error;
      }
    }
    const target = path.join(base, ...segments);
    const diff = path.relative(base, target);
    if (diff === ".." || diff.startsWith(".." + path.sep) || path.isAbsolute(diff)) {
      throw new FoundationError("ACCESS_DENIED", "Path escaped its approved root.");
    }
    return { target, base, segments };
  }

  listRoots() {
    return this.policy.enabledRoots().map(root => ({
      id: root.id, label: root.label, path: root.absolutePath, access: root.access,
    }));
  }

  async listFiles(rootId: string, folder = ".") {
    const { target } = await this.resolve("list_files", rootId, folder, { allowRoot: true });
    const info = await statNoLink(target);
    if (!info.isDirectory()) throw new FoundationError("INVALID_INPUT", "Expected a folder.");
    const entries = await fs.readdir(target, { withFileTypes: true });
    const clean = entries.filter(e => !e.name.startsWith(".") &&
      !e.isSymbolicLink() && (e.isDirectory() || e.isFile()));
    return {
      entries: clean.slice(0, MAX_LIST_ENTRIES).map(e => ({
        name: e.name, type: e.isDirectory() ? "folder" : "file",
      })),
      total: clean.length,
      truncated: clean.length > MAX_LIST_ENTRIES,
    };
  }

  async readFile(rootId: string, file: string) {
    const { target } = await this.resolve("read_file", rootId, file);
    ensureTextExtension(target);
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const handle = await fs.open(target, flags);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink > 1) {
        throw new FoundationError("ACCESS_DENIED", "Expected a single-linked regular file.");
      }
      if (before.size > MAX_TEXT_BYTES) {
        throw new FoundationError("TOO_LARGE", "Text file exceeds 64 KiB.");
      }
      const data = await handle.readFile();
      if (data.length > MAX_TEXT_BYTES) {
        throw new FoundationError("TOO_LARGE", "Text file exceeds 64 KiB.");
      }
      const after = await handle.stat();
      if (after.mtimeMs !== before.mtimeMs || after.size !== before.size) {
        throw new FoundationError("CONFLICT", "File changed while being read.");
      }
      let content: string;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(data); }
      catch { throw new FoundationError("INVALID_INPUT", "File is not valid UTF-8 text."); }
      return {
        content,
        bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
    } finally { await handle.close(); }
  }

  async fileInfo(rootId: string, item: string) {
    const { target } = await this.resolve("file_info", rootId, item, { allowRoot: true });
    const info = await statNoLink(target);
    return {
      type: info.isDirectory() ? "folder" : info.isFile() ? "file" : "other",
      sizeBytes: info.size,
      modifiedAt: info.mtime.toISOString(),
    };
  }

  async searchFiles(rootId: string, query: string, folder = ".", depth = 3) {
    if (typeof query !== "string" || query.trim().length === 0 || query.length > 100) {
      throw new FoundationError("INVALID_INPUT", "Search query must be 1-100 characters.");
    }
    if (!Number.isInteger(depth) || depth < 0 || depth > 5) {
      throw new FoundationError("INVALID_INPUT", "Depth must be 0-5.");
    }
    const { target, base } = await this.resolve("search_files", rootId, folder, { allowRoot: true });
    if (!(await statNoLink(target)).isDirectory()) {
      throw new FoundationError("INVALID_INPUT", "Search start must be a directory.");
    }
    const results: Array<{ path: string; type: string }> = [];
    const queue = [{ dir: target, depth: 0 }];
    let scanned = 0;
    while (queue.length && results.length < MAX_LIST_ENTRIES && scanned < MAX_SCANNED) {
      const item = queue.shift();
      if (!item) break;
      const entries = await fs.readdir(item.dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink() ||
            (!entry.isDirectory() && !entry.isFile())) continue;
        scanned++;
        const full = path.join(item.dir, entry.name);
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            path: path.relative(base, full),
            type: entry.isDirectory() ? "folder" : "file",
          });
        }
        if (entry.isDirectory() && item.depth < depth) {
          queue.push({ dir: full, depth: item.depth + 1 });
        }
        if (scanned >= MAX_SCANNED || results.length >= MAX_LIST_ENTRIES) break;
      }
    }
    return {
      results,
      scanned,
      truncated: queue.length > 0 || scanned >= MAX_SCANNED ||
        results.length >= MAX_LIST_ENTRIES,
    };
  }

  async createDirectory(rootId: string, folder: string) {
    const { target } = await this.resolve("create_directory", rootId, folder, { missingLeaf: true });
    await fs.mkdir(target, { mode: 0o700 }); // only one missing final component
    return { created: true };
  }

  async writeFile(rootId: string, file: string, content: string) {
    if (typeof content !== "string") {
      throw new FoundationError("INVALID_INPUT", "File content must be text.");
    }
    const { target } = await this.resolve("write_file", rootId, file, { missingLeaf: true });
    ensureTextExtension(target);
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_TEXT_BYTES) throw new FoundationError("TOO_LARGE", "Content exceeds 64 KiB.");
    const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
      (constants.O_NOFOLLOW ?? 0);
    const handle = await fs.open(target, flags, 0o600);
    try {
      await handle.writeFile(content, { encoding: "utf8" });
      await handle.sync();
      return { created: true, bytes };
    } catch (error) {
      await handle.close();
      await fs.unlink(target).catch(() => {});
      throw error;
    } finally {
      await handle.close().catch(() => {});
    }
  }

  // These tool IDs remain in the registry, but their execution is deliberately
  // unavailable until atomic edits, rename safety, and real local human approvals exist.
  async editFile(_rootId: string, _file: string, _old: string, _replacement: string): Promise<never> {
    throw new FoundationError("NOT_IMPLEMENTED", "Safe edit with version checks is planned for the next phase.");
  }
  async renameFile(_rootId: string, _from: string, _to: string): Promise<never> {
    throw new FoundationError("NOT_IMPLEMENTED", "Safe no-overwrite rename is planned for the next phase.");
  }
  async deleteFile(_rootId: string, _file: string): Promise<never> {
    throw new FoundationError("NOT_IMPLEMENTED", "Deletion requires independent local approval; not implemented.");
  }
}
