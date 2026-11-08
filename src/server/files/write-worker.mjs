// Runs ONLY inside the bubblewrap filesystem namespace. No network or command APIs.
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const LIMIT = 64 * 1024;
const EXTENSIONS = new Set([".txt",".md",".csv",".json",".js",".jsx",".mjs",
  ".cjs",".ts",".tsx",".html",".css",".py",".php",".sql",".yml",".yaml",
  ".xml",".sh",".toml",".ini",".log",".astro",".vue",".svelte",".go",".rs",
  ".java",".kt",".swift",".cs",".cpp",".c",".h",".hpp",".rb",".dart",".svg"]);
const ROOT = "/tmp/localdesk-root";
function reject(message = "denied") { throw Error(message); }
function parts(value) {
  if (typeof value !== "string" || !value || value.length > 500 ||
      value.startsWith("/") || value.startsWith("\\") || value.startsWith("~") ||
      /^[a-z]:/i.test(value) || value.includes("\0")) reject();
  const segments = value.split(/[\\/]/);
  if (!segments.length || segments.some((p,i)=>!p || p==="." || p===".." ||
      (p.startsWith(".") && !(p===".gitignore" && i===segments.length-1)) ||
      /[. :]$/.test(p) || /[:<>|?*]/.test(p) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(p))) reject();
  return segments;
}
async function target(value, allowMissing = false) {
  const segments = parts(value);
  let current = ROOT;
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    const last = i === segments.length - 1;
    try {
      const st = await fs.lstat(current);
      if (st.isSymbolicLink() || (st.isFile() && st.nlink !== 1) ||
          (!last && !st.isDirectory())) reject();
    } catch (error) {
      if (last && allowMissing && error?.code === "ENOENT") break;
      throw error;
    }
  }
  return current;
}
function textFile(name) {
  if (path.basename(name).toLowerCase() === ".gitignore") return;
  if (!EXTENSIONS.has(path.extname(name).toLowerCase())) reject();
}
function contentData(value) {
  if (typeof value !== "string" ||
      Buffer.from(value, "utf8").toString("utf8") !== value) reject();
  const data = Buffer.from(value,"utf8");
  if (data.length > LIMIT) reject();
  return data;
}
async function oldFile(name) {
  const file = await target(name);
  textFile(file);
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const info = await handle.stat();
  if (!info.isFile() || info.nlink !== 1 || info.size > LIMIT) {
    await handle.close(); reject();
  }
  return { file, handle, info };
}
async function writeAll(handle, data) {
  await handle.writeFile(data);
  await handle.sync();
}
async function syncParent(file) {
  const handle = await fs.open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function operate(request) {
  if (!request || typeof request !== "object") reject();
  const { tool } = request;
  if (tool === "create_directory") {
    const dir = await target(request.path, true);
    await fs.mkdir(dir, { mode: 0o700 });
    await syncParent(dir);
    return { ok:true, created:true };
  }
  if (tool === "write_file") {
    const file = await target(request.path,true);
    textFile(file);
    const data = contentData(request.content);
    const handle = await fs.open(file, constants.O_CREAT | constants.O_EXCL |
      constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await writeAll(handle,data); }
    finally { await handle.close(); }
    await syncParent(file);
    return { ok:true, created:true, bytes:data.length };
  }
  if (tool === "edit_file") {
    const input = await oldFile(request.path);
    let replacement;
    try {
      const original = await input.handle.readFile();
      const digest = createHash("sha256").update(original).digest("hex");
      if (!/^[0-9a-f]{64}$/.test(request.expectedSha256) ||
          digest !== request.expectedSha256) reject();
      replacement = contentData(request.content);
    } finally { await input.handle.close(); }
    const temp = path.join(path.dirname(input.file),
      "localdesk-tmp-" + randomUUID() + path.extname(input.file));
    const handle = await fs.open(temp, constants.O_CREAT | constants.O_EXCL |
      constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await writeAll(handle,replacement);
    } finally { await handle.close(); }
    try {
      const beforeCommit = await fs.lstat(input.file);
      if (beforeCommit.dev !== input.info.dev || beforeCommit.ino !== input.info.ino ||
          beforeCommit.size !== input.info.size || beforeCommit.mtimeMs !== input.info.mtimeMs ||
          beforeCommit.nlink !== 1 || !beforeCommit.isFile()) reject();
      // Serialized by the LocalDesk process; racing other local processes are
      // outside this lock. Files outside approved root remain read-only in bwrap.
      await fs.rename(temp, input.file);
      await syncParent(input.file);
      return { ok:true, updated:true, sha256:createHash("sha256").update(replacement).digest("hex") };
    } finally { await fs.rm(temp, { force:true }).catch(()=>{}); }
  }
  if (tool === "delete_file") {
    const input = await oldFile(request.path);
    await input.handle.close();
    // Local owner approval was consumed by the parent before launching this worker.
    await fs.unlink(input.file);
    await syncParent(input.file);
    return { ok:true, deleted:true };
  }
  if (tool === "rename_file") {
    const input = await oldFile(request.path);
    await input.handle.close();
    const destination = await target(request.destination,true);
    if (input.file === destination) reject();
    textFile(destination);
    await fs.link(input.file,destination); // fails if destination already exists
    await fs.unlink(input.file);
    await syncParent(destination);
    if (path.dirname(input.file) !== path.dirname(destination)) await syncParent(input.file);
    return { ok:true, renamed:true };
  }
  reject();
}
let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk.toString("utf8");
  if (Buffer.byteLength(raw,"utf8")>70*1024) process.exit(1);
}
try {
  const result = await operate(JSON.parse(raw));
  process.stdout.write(JSON.stringify(result));
} catch {
  process.exitCode = 1;
}
