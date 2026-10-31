import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLocalClientSetup } from "../../src/server/setup/index.ts";

test("Generated wizard launch command starts MCP from an unrelated working directory", { timeout: 30000 }, async () => {
  const root = process.cwd();
  const info = await getLocalClientSetup({ projectDirectory: root });
  assert.equal(info.dependenciesReady, true, "Run npm install before this test: " + info.missing.join(", "));
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-setup-launch-"));
  const child = spawn(info.nodeCommand, info.args, {
    cwd: os.tmpdir(),
    env: { ...process.env, LOCAL_MCP_STATE_DIR: state },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let stderr = "";
  let complete = false;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  child.on("error", error => { stderr += "Spawn error: " + error.message; });
  child.stderr.on("data", data => { stderr += String(data); });
  try {
    const response = new Promise<unknown>((resolve, reject) => {
      child.stdout.on("data", data => {
        buffer += String(data);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line) as { id?: number; result?: { protocolVersion?: string } };
            if (msg.id === 1) {
              complete = true;
              resolve(msg);
            }
          } catch {
            reject(new Error("Non-MCP output on stdout: " + line.slice(0, 200)));
          }
        }
      });
      child.once("exit", code => {
        if (!complete) reject(new Error("MCP wizard process exited " + code + ": " + stderr));
      });
    });

    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lmm-wizard-smoke", version: "0.1.0" } },
    }) + "\n");

    const initialized = await Promise.race([
      response,
      new Promise((_, reject) => { waitTimer = setTimeout(() => reject(new Error("MCP wizard launch timed out: " + stderr)), 10000); }),
    ]) as { result?: { protocolVersion?: string } };
    assert.ok(initialized.result?.protocolVersion, "Expected MCP initialize response: " + stderr);
  } finally {
    if (waitTimer) clearTimeout(waitTimer);
    child.stdin.end();
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 1000);
    });
    await fs.rm(state, { force: true, recursive: true });
  }
});
