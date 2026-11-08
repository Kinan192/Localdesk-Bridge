// Windows-only filesystem mutation worker. No shell, no network, no arbitrary commands.
// Each mutation is scoped to the folder explicitly approved by the owner.
import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";

const MAX_BYTES = 64 * 1024;
const MAX_PAYLOAD_BYTES = 70 * 1024;
const EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx",
  ".html", ".css", ".py", ".php", ".sql", ".yml", ".yaml", ".xml", ".sh", ".toml",
  ".ini", ".log", ".astro", ".vue", ".svelte", ".go", ".rs", ".java", ".kt", ".swift",
  ".cs", ".cpp", ".c", ".h", ".hpp", ".rb", ".dart", ".svg",
]);

function deny() { throw new Error("Operation denied"); }
function same(a, b) { return path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase(); }
function inside(parent, candidate) {
  const diff = path.win32.relative(parent, candidate);
  return diff === "" || (diff !== ".." && !diff.startsWith("..\\") && !path.win32.isAbsolute(diff));
}
function segmentsOf(name) {
  if (typeof name !== "string" || name.length < 1 || name.length > 500 || name.includes("\0") ||
      name.startsWith("/") || name.startsWith("\\") || name.startsWith("~") || /^[a-z]:/i.test(name)) deny();
  const parts = name.split(/[\\/]/);
  if (parts.some((p,i) => !p || p === "." || p === ".." ||
      (p.startsWith(".") && !(p === ".gitignore" && i === parts.length - 1)) ||
      /[. ]$/.test(p) || /[:<>|?*\x00-\x1f]/.test(p) ||
      /^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[1-9]|lpt[1-9])(\..*)?$/i.test(p))) deny();
  return parts;
}
function textOnly(filename) {
  if (path.win32.basename(filename).toLowerCase() === ".gitignore") return;
  if (!EXTENSIONS.has(path.win32.extname(filename).toLowerCase())) deny();
}
function bufferOf(value) {
  if (typeof value !== "string" || Buffer.from(value, "utf8").toString("utf8") !== value) deny();
  const data = Buffer.from(value, "utf8");
  if (data.length > MAX_BYTES) deny();
  return data;
}
function fingerprint(stat) { return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.nlink].join(":"); }
async function validateRoot(root) {
  if (typeof root !== "string" || !path.win32.isAbsolute(root)) deny();
  const normalized = path.win32.resolve(root);
  // Only normal local drive paths are supported. Reject UNC and device paths.
  if (!/^[a-z]:\\/i.test(normalized) || same(normalized, path.win32.parse(normalized).root)) deny();
  const info = await fs.lstat(normalized);
  if (!info.isDirectory() || info.isSymbolicLink() || !Number.isSafeInteger(info.ino) || info.ino === 0) deny();
  const real = await fs.realpath(normalized);
  if (!same(real, normalized)) deny();
  return { root: normalized, info };
}
async function locate(root, relative, allowMissing = false) {
  const parts = segmentsOf(relative);
  let here = root;
  for (let i = 0; i < parts.length; i++) {
    here = path.win32.join(here, parts[i]);
    if (!inside(root, here)) deny();
    const last = i === parts.length - 1;
    let st;
    try { st = await fs.lstat(here); }
    catch (error) {
      if (last && allowMissing && error?.code === "ENOENT") {
        const parentReal = await fs.realpath(path.win32.dirname(here));
        if (!inside(root, parentReal)) deny();
        return { file: here, exists: false };
      }
      throw error;
    }
    if (st.isSymbolicLink() || (!last && !st.isDirectory()) || (st.isFile() && st.nlink !== 1)) deny();
    if (!Number.isSafeInteger(st.ino) || st.ino === 0) deny();
    const real = await fs.realpath(here);
    if (!inside(root, real) || !same(real, here)) deny();
  }
  return { file: here, exists: true };
}
async function checkedRoot(original, info) {
  const again = await validateRoot(original);
  if (again.info.ino !== info.ino || again.info.dev !== info.dev) deny();
}
async function regularFile(root, name, withContent = false) {
  const { file, exists } = await locate(root, name);
  if (!exists) deny();
  textOnly(file);
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = await handle.stat();
    const named = await fs.lstat(file);
    // Detect a substituted junction/link between path validation and open.
    if (!st.isFile() || st.nlink !== 1 || st.size > MAX_BYTES ||
        named.isSymbolicLink() || st.ino !== named.ino || st.dev !== named.dev ||
        !Number.isSafeInteger(st.ino) || st.ino === 0) deny();
    const content = withContent ? await handle.readFile() : null;
    const after = await handle.stat();
    if (fingerprint(after) !== fingerprint(st) || (content && content.length > MAX_BYTES)) deny();
    return { file, stat: st, content };
  } finally { await handle.close(); }
}
async function operate(root, originalStat, request) {
  if (!request || typeof request !== "object") deny();
  const tool = request.tool;
  await checkedRoot(root, originalStat);
  if (tool === "create_directory") {
    const candidate = await locate(root, request.path, true);
    if (candidate.exists) deny();
    await fs.mkdir(candidate.file);
    await checkedRoot(root, originalStat);
    await locate(root, request.path);
    return { ok: true, created: true };
  }
  if (tool === "write_file") {
    const candidate = await locate(root, request.path, true);
    if (candidate.exists) deny();
    textOnly(candidate.file);
    const data = bufferOf(request.content);
    const handle = await fs.open(candidate.file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await handle.writeFile(data); await handle.sync(); }
    finally { await handle.close(); }
    await checkedRoot(root, originalStat);
    await locate(root, request.path);
    return { ok: true, created: true, bytes: data.length };
  }
  if (tool === "edit_file") {
    const target = await regularFile(root, request.path, true);
    if (!/^[a-f0-9]{64}$/.test(request.expectedSha256) || !target.content) deny();
    if (createHash("sha256").update(target.content).digest("hex") !== request.expectedSha256) deny();
    const replacement = bufferOf(request.content);
    const temp = path.win32.join(path.win32.dirname(target.file),
      "localdesk-tmp-" + randomUUID() + path.win32.extname(target.file));
    const handle = await fs.open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await handle.writeFile(replacement); await handle.sync(); }
    finally { await handle.close(); }
    try {
      await checkedRoot(root, originalStat);
      const latest = await regularFile(root, request.path);
      if (fingerprint(latest.stat) !== fingerprint(target.stat)) deny();
      await fs.rename(temp, target.file);
      return { ok: true, updated: true, sha256: createHash("sha256").update(replacement).digest("hex") };
    } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
  }
  if (tool === "rename_file") {
    const source = await regularFile(root, request.path);
    const destination = await locate(root, request.destination, true);
    if (destination.exists || same(source.file, destination.file)) deny();
    textOnly(destination.file);
    await checkedRoot(root, originalStat);
    await regularFile(root, request.path);
    await fs.link(source.file, destination.file);
    await fs.unlink(source.file);
    return { ok: true, renamed: true };
  }
  if (tool === "delete_file") {
    // The trusted parent process has already consumed an exact owner approval.
    const source = await regularFile(root, request.path);
    await checkedRoot(root, originalStat);
    const latest = await regularFile(root, request.path);
    if (fingerprint(source.stat) !== fingerprint(latest.stat)) deny();
    await fs.unlink(source.file);
    return { ok: true, deleted: true };
  }
  deny();
}

// Capability probe exercises real file operations inside a disposable folder.
// It is not enough for the worker to merely report its operating system.
async function probe() {
  if (process.platform !== "win32") deny();
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "localdesk-write-probe-"));
  try {
    const rootDir = path.join(base, "Approved Test Folder");
    const outside = path.join(base, "outside.md");
    await fs.mkdir(rootDir);
    await fs.writeFile(outside, "untouched");
    const { root, info } = await validateRoot(rootDir);
    await operate(root, info, { tool: "create_directory", path: "nested" });
    await operate(root, info, { tool: "write_file", path: "nested\\sample.txt", content: "original" });
    const before = createHash("sha256").update("original").digest("hex");
    await operate(root, info, {
      tool: "edit_file", path: "nested\\sample.txt",
      content: "updated", expectedSha256: before,
    });
    await operate(root, info, {
      tool: "rename_file", path: "nested\\sample.txt",
      destination: "nested\\renamed.txt",
    });
    if ((await fs.readFile(path.join(rootDir, "nested", "renamed.txt"), "utf8")) !== "updated") deny();
    let traversalRejected = false;
    try {
      await operate(root, info, {
        tool: "write_file", path: "..\\outside.md", content: "overwritten",
      });
    } catch { traversalRejected = true; }
    if (!traversalRejected) deny();
    let overwriteRejected = false;
    try {
      await operate(root, info, {
        tool: "write_file", path: "nested\\renamed.txt", content: "overwritten",
      });
    } catch { overwriteRejected = true; }
    if (!overwriteRejected) deny();
    await operate(root, info, { tool: "delete_file", path: "nested\\renamed.txt" });
    if ((await fs.readFile(outside, "utf8")) !== "untouched") deny();
    return true;
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--probe") {
  try {
    await probe();
    process.stdout.write(JSON.stringify({ ok: true }));
  } catch (error) {
    // Local preview diagnostics; remote operation errors stay generic.
    if (process.env.LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL === "1") {
      process.stderr.write("[Localdesk] Windows probe error: " +
        (error instanceof Error ? error.stack : String(error)) + "\n");
    }
    process.exitCode = 1;
  }
} else {
  try {
    if (process.platform !== "win32") deny();
    const baseline = await validateRoot(process.argv[2]);
    let payload = "";
    for await (const chunk of process.stdin) {
      payload += chunk.toString("utf8");
      if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) deny();
    }
    const result = await operate(baseline.root, baseline.info, JSON.parse(payload));
    process.stdout.write(JSON.stringify(result));
  } catch {
    process.exitCode = 1;
  }
}
