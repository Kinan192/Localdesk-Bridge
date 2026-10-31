import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAuditEvent, readAuditEvents } from "../../src/server/audit/index.ts";

test("Local MCP audit stores only minimal metadata and filters by result", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-audit-test-"));
  const previous = process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR = directory;
  try {
    assert.deepEqual(await readAuditEvents(), []);
    await appendAuditEvent({ tool: "list_roots", result: "allowed" });
    await appendAuditEvent({ tool: "read_file", rootId: "workspace_1", result: "denied" });
    const events = await readAuditEvents();
    assert.equal(events.length, 2);
    assert.equal(events[0].tool, "read_file");
    assert.equal(events[0].rootId, "workspace_1");
    assert.equal(events[1].tool, "list_roots");
    assert.equal((await readAuditEvents({ result: "allowed" })).length, 1);
    assert.equal((await readAuditEvents({ limit: 1 })).length, 1);
    await assert.rejects(() => readAuditEvents({ limit: 300 }));
    const content = await fs.readFile(path.join(directory, "audit.jsonl"), "utf8");
    assert.equal(content.includes("filePath"), false);
    assert.equal(content.includes("fileContent"), false);
    const info = await fs.stat(path.join(directory, "audit.jsonl"));
    if (process.platform !== "win32") assert.equal(info.mode & 0o077, 0);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = previous;
    await fs.rm(directory, { force: true, recursive: true });
  }
});

test("Audit log rejects symbolic links instead of reading external files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-audit-symlink-"));
  const previous = process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR = directory;
  try {
    const external = path.join(directory, "external.jsonl");
    await fs.writeFile(external, JSON.stringify({ private: "not-an-event" }) + "\n");
    await fs.symlink(external, path.join(directory, "audit.jsonl"));
    await assert.rejects(appendAuditEvent({ tool: "read_file", result: "allowed" }));
    await assert.rejects(readAuditEvents());
    assert.equal((await fs.readFile(external, "utf8")).includes("not-an-event"), true);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = previous;
    await fs.rm(directory, { force: true, recursive: true });
  }
});
