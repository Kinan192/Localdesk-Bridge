import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PolicyEngine } from "../../src/server/access/index.ts";
import { FileEngine, MAX_TEXT_BYTES } from "../../src/server/files/index.ts";
import { defaultPolicy } from "../../src/server/contracts/index.ts";

test("Safe file engine reads, searches, lists, and creates authorized text files", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-engine-"));
  try {
    const docs = path.join(temp, "docs");
    await fs.mkdir(docs);
    await fs.writeFile(path.join(docs, "readme.md"), "# sample\n");
    const p = defaultPolicy();
    p.roots = [{ id: "docs", label: "Documents", absolutePath: docs, enabled: true, access: "read" }];
    const policy = await PolicyEngine.create(p);
    const files = new FileEngine(policy);
    assert.deepEqual(files.listRoots().map(v => v.id), ["docs"]);
    assert.equal((await files.listFiles("docs")).total, 1);
    assert.equal((await files.searchFiles("docs", "read")).results.length, 1);
    const read = await files.readFile("docs", "readme.md");
    assert.equal(read.content, "# sample\n");
    assert.equal(read.sha256.length, 64);
    assert.equal((await files.fileInfo("docs", "readme.md")).type, "file");
    await assert.rejects(files.writeFile("docs", "new.txt", "created"), /not enabled/i);

    const updated = policy.snapshot();
    updated.tools.create_directory = true;
    updated.tools.write_file = true;
    await policy.update(updated);
    await assert.rejects(files.createDirectory("docs", "newdir"), /read-only/i);
    updated.roots[0].access = "write";
    await policy.update(updated);
    assert.equal((await files.createDirectory("docs", "newdir")).created, true);
    assert.equal((await files.writeFile("docs", "newdir/test.txt", "hello")).bytes, 5);
    assert.equal((await files.readFile("docs", "newdir/test.txt")).content, "hello");
    await assert.rejects(files.writeFile("docs", "newdir/test.txt", "overwrite"));
    await assert.rejects(files.writeFile("docs", "newdir/big.md", "x".repeat(MAX_TEXT_BYTES + 1)), /exceeds/i);
    await assert.rejects(files.editFile("docs", "readme.md", "a", "b"), /not implemented|planned/i);
    await assert.rejects(files.renameFile("docs", "readme.md", "next.md"), /planned/i);
    await assert.rejects(files.deleteFile("docs", "readme.md"), /not implemented/i);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test("Traversal, dot files, absolute paths, hardlinks and symlinks are blocked", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-boundary-"));
  try {
    const allowed = path.join(temp, "allowed");
    const outside = path.join(temp, "outside");
    await fs.mkdir(allowed); await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "secret.md"), "do-not-read");
    await fs.writeFile(path.join(allowed, ".env"), "SECRET=something");
    await fs.symlink(outside, path.join(allowed, "jump"), process.platform === "win32" ? "junction" : "dir");
    const p = defaultPolicy();
    p.roots = [{ id: "r", label: "Allowed", absolutePath: allowed, enabled: true, access: "write" }];
    p.tools.write_file = true;
    const engine = new FileEngine(await PolicyEngine.create(p));

    await assert.rejects(engine.readFile("r", "../outside/secret.md"));
    await assert.rejects(engine.readFile("r", "/etc/passwd"));
    await assert.rejects(engine.readFile("r", "C:\\Windows\\test.txt"));
    await assert.rejects(engine.readFile("r", ".env"));
    await assert.rejects(engine.readFile("r", "jump/secret.md"));
    await assert.rejects(engine.writeFile("r", "evil.bin", "unsafe"));
    await assert.rejects(engine.readFile("r", "missing.md"));
    assert.equal((await engine.listFiles("r")).entries.some(item => item.name === "jump"), false);
    assert.equal((await engine.searchFiles("r", "secret")).results.length, 0);
    const hard = path.join(allowed, "hard.md");
    await fs.link(path.join(outside, "secret.md"), hard);
    await assert.rejects(engine.readFile("r", "hard.md"), /hard-linked|single-linked/i);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test("Windows approved Read Only folder supports nested directory browsing", {
  skip: process.platform !== "win32",
}, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-win-read-"));
  try {
    const root = path.join(temp, "Approved Documents");
    const nested = path.join(root, "Monthly Reports");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, "summary.md"), "# Windows read smoke\n", "utf8");
    await fs.writeFile(path.join(temp, "outside.md"), "outside", "utf8");

    const config = defaultPolicy();
    config.roots = [{
      id: "windows_docs", label: "Windows Documents",
      absolutePath: root.toUpperCase(), enabled: true, access: "read",
    }];
    const files = new FileEngine(await PolicyEngine.create(config));
    assert.deepEqual(files.listRoots().map(item => item.id), ["windows_docs"]);
    assert.ok((await files.listFiles("windows_docs")).entries.some(item =>
      item.name === "Monthly Reports" && item.type === "folder"));
    assert.ok((await files.listFiles("windows_docs", "Monthly Reports")).entries.some(item =>
      item.name === "summary.md" && item.type === "file"));
    assert.equal((await files.readFile("windows_docs", "Monthly Reports\\summary.md")).content,
      "# Windows read smoke\n");
    assert.equal((await files.fileInfo("windows_docs", "Monthly Reports")).type, "folder");
    assert.ok((await files.searchFiles("windows_docs", "summary")).results.some(item =>
      item.path.toLowerCase().endsWith("summary.md")));
    await assert.rejects(files.listFiles("windows_docs", ".."));
    await assert.rejects(files.listFiles("windows_docs", "C:\\Windows"));
    await assert.rejects(files.readFile("windows_docs", "..\\outside.md"));
    await assert.rejects(files.writeFile("windows_docs", "blocked.md", "denied"));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
