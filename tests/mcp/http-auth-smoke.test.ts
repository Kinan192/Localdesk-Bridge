import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      const port = typeof address === "object" && address ? address.port : 0;
      s.close(() => resolve(port));
    });
  });
}

/**
 * Node fetch may normalize or override Host. For an actual HTTP Host-header
 * security check, send the Host through node:http directly to the listener.
 */
function requestWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1", port, path: "/mcp", method: "GET",
      headers: { Host: host, Connection: "close" },
      agent: false,
    }, response => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
      response.once("error", reject);
    });
    request.once("error", reject);
    request.end();
  });
}

test("Remote HTTP MCP refuses unauthorized requests; dashboard is not exposed", { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-http-smoke-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/mcp/http.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
      CF_ACCESS_AUD: "example-audience-tag-0123456789",
      MCP_PUBLIC_HOSTNAME: "mcp.example.com",
      MCP_HTTP_PORT: String(port),
      LOCAL_MCP_STATE_DIR: directory,
    },
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  try {
    const base = "http://127.0.0.1:" + port;
    let ready = false;
    for (let tries = 0; tries < 80; tries++) {
      if (child.exitCode !== null) throw new Error("HTTP server exited: " + stderr);
      try {
        const response = await fetch(base + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        assert.equal(response.status, 401, "Missing Cloudflare Access identity must fail");
        ready = true;
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.equal(ready, true, "HTTP MCP never became ready: " + stderr);

    const fake = await fetch(base + "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cf-Access-Jwt-Assertion": "forged" },
      body: "{}",
    });
    assert.equal(fake.status, 401);
    const app = await fetch(base + "/api/local/policy");
    assert.equal(app.status, 404);
    // Node fetch does not reliably transmit a custom Host header.
    // Use node:http so the security assertion checks the actual header on the wire.
    assert.equal(await requestWithHost(port, "evil.example.com"), 403);
    assert.equal(await requestWithHost(port, "127.0.0.1:" + port), 401);
    const origin = await fetch(base + "/mcp", {
      headers: { Origin: "http://evil.example.com" },
    });
    assert.equal(origin.status, 403);
    assert.equal(await fs.readdir(directory).then(names => names.includes("audit.jsonl")), false);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 1200);
    });
    await fs.rm(directory, { recursive: true, force: true });
  }
});
