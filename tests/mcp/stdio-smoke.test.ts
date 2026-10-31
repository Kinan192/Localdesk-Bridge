import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type RpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

function waitForMessage(
  messages: RpcMessage[],
  id: number,
  timeoutMs = 8000,
): Promise<RpcMessage> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const index = messages.findIndex(item => item.id === id && ("result" in item || "error" in item));
      if (index !== -1) {
        resolve(messages.splice(index, 1)[0]);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for MCP response " + id));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

function send(child: ChildProcessWithoutNullStreams, message: RpcMessage) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

test("MCP stdio boots with zero approved roots and exposes read tools only", { timeout: 30000 }, async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "lmm-mcp-smoke-"));
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/mcp/stdio.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, LOCAL_MCP_STATE_DIR: state },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messages: RpcMessage[] = [];
  let stdoutBuffer = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line) {
        try { messages.push(JSON.parse(line) as RpcMessage); }
        catch { messages.push({ jsonrpc: "2.0", error: { code: -1, message: "Invalid JSON from stdout" } }); }
      }
      newline = stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  child.on("error", error => { stderr += "\\nSpawn error: " + error.message; });
  child.stdin.on("error", () => { /* Child may close stdin on startup failure. */ });

  try {
    send(child, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "lmm-stdio-smoke", version: "0.1.0" },
      },
    });
    const initialized = await waitForMessage(messages, 1);
    assert.ok(initialized.result, "Initialization failed: " + JSON.stringify(initialized) + " " + stderr);
    send(child, { jsonrpc: "2.0", method: "notifications/initialized" });

    send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const listed = await waitForMessage(messages, 2);
    assert.ok(listed.result, "tools/list failed: " + JSON.stringify(listed));
    const tools = listed.result.tools as Array<{ name: string }>;
    assert.deepEqual(tools.map(tool => tool.name).sort(), [
      "file_info", "list_files", "list_roots", "read_file", "search_files",
    ]);

    send(child, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_roots", arguments: {} } });
    const roots = await waitForMessage(messages, 3);
    assert.ok(roots.result, "list_roots failed: " + JSON.stringify(roots));
    assert.match(JSON.stringify(roots.result), /\[\]/, "Default allowlist must be empty");

    send(child, { jsonrpc: "2.0", id: 4, method: "tools/call", params: {
      name: "read_file", arguments: { rootId: "missing", file: "secret.txt" },
    } });
    const denied = await waitForMessage(messages, 4);
    assert.ok(denied.result && denied.result.isError === true, "Unknown root must fail");

    // Audit events are written locally and contain metadata only.
    const audit = await readFile(path.join(state, "audit.jsonl"), "utf8");
    const logged = audit.trim().split("\n").map(line => JSON.parse(line) as {
      tool: string; result: string; rootId?: string;
    });
    assert.equal(logged.some(event => event.tool === "list_roots" && event.result === "allowed"), true);
    assert.equal(logged.some(event => event.tool === "read_file" && event.result === "denied"), true);
  } finally {
    const exited = child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>(resolve => { child.once("exit", () => resolve()); });
    child.stdin.end();
    const timeout = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000);
    try { await exited; } finally { clearTimeout(timeout); }
    await rm(state, { recursive: true, force: true });
  }
});
