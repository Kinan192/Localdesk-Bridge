import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { GET as ownerStatus } from "../../src/app/api/local/owner/route.ts";
import { POST as redeemOwner } from "../../src/app/api/local/owner/pair/route.ts";
import { OwnerPairingRepository, OWNER_COOKIE } from "../../src/server/owner/index.ts";
import { launcherReadyProof, LAUNCH_SECRET_ENV } from "../../src/server/owner/dashboard-launch.ts";

function req(
  route: string,
  method: "GET" | "POST" = "GET",
  options: { cookie?: string; origin?: string; host?: string; challenge?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {
    host: options.host ?? "127.0.0.1:3100",
  };
  if (options.cookie) headers.cookie = OWNER_COOKIE + "=" + options.cookie;
  if (options.challenge) headers["x-local-mcp-launch-challenge"] = options.challenge;
  if (method === "POST") {
    headers.origin = options.origin ?? "http://127.0.0.1:3100";
    headers["content-type"] = "application/json";
    headers["x-local-mcp-action"] = "dashboard";
  }
  return new NextRequest("http://127.0.0.1:3100" + route, {
    method, headers,
    ...(method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
}

test("owner HTTP bootstrap is fail-closed, authenticates its own launch challenge and redeems once", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-owner-http-"));
  const oldDir = process.env.LOCAL_MCP_STATE_DIR;
  const oldSecret = process.env[LAUNCH_SECRET_ENV];
  const secret = randomBytes(32).toString("base64url");
  const challenge = randomBytes(32).toString("base64url");
  process.env.LOCAL_MCP_STATE_DIR = dir;
  process.env[LAUNCH_SECRET_ENV] = secret;
  try {
    const unauthenticated = await ownerStatus(req("/api/local/owner"));
    assert.equal(unauthenticated.status, 200);
    assert.equal((await unauthenticated.json()).paired, false);
    assert.equal(unauthenticated.headers.get("x-local-mcp-launch-proof"), null);

    const ready = await ownerStatus(req("/api/local/owner", "GET", { challenge }));
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get("x-local-mcp-launch-proof"), launcherReadyProof(secret, challenge));
    assert.equal(ready.headers.get("cache-control"), "no-store");

    const invalid = await ownerStatus(req("/api/local/owner", "GET", {
      host: "malicious.example:3100", challenge,
    }));
    assert.equal(invalid.status, 403);
    assert.equal(invalid.headers.get("x-local-mcp-launch-proof"), null);

    const owner = new OwnerPairingRepository(dir);
    const ticket = await owner.createTicket();
    const crossOrigin = await redeemOwner(req("/api/local/owner/pair", "POST", {
      body: { ticket }, origin: "http://malicious.example",
    }));
    assert.equal(crossOrigin.status, 403);
    assert.equal(crossOrigin.headers.get("set-cookie"), null);

    const paired = await redeemOwner(req("/api/local/owner/pair", "POST", { body: { ticket } }));
    assert.equal(paired.status, 200);
    const cookie = paired.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(OWNER_COOKIE + "=v1\\."));
    assert.match(cookie.toLowerCase(), /httponly/);
    assert.match(cookie.toLowerCase(), /samesite=strict/);
    const value = decodeURIComponent(cookie.split(";")[0]!.slice(OWNER_COOKIE.length + 1));

    const verified = await ownerStatus(req("/api/local/owner", "GET", { cookie: value }));
    assert.equal((await verified.json()).paired, true);

    // The status endpoint must apply the same duplicate-cookie rejection
    // as privileged mutation routes, not trust NextRequest.cookies.get().
    const duplicates = req("/api/local/owner", "GET", { cookie: value });
    duplicates.headers.set("cookie", OWNER_COOKIE + "=" + value + "; " + OWNER_COOKIE + "=" + value);
    assert.equal((await (await ownerStatus(duplicates)).json()).paired, false);

    const missingAction = req("/api/local/owner/pair", "POST", { body: { ticket } });
    missingAction.headers.delete("x-local-mcp-action");
    const rejectedAction = await redeemOwner(missingAction);
    assert.equal(rejectedAction.status, 403);
    assert.equal(rejectedAction.headers.get("set-cookie"), null);

    const replay = await redeemOwner(req("/api/local/owner/pair", "POST", { body: { ticket } }));
    assert.equal(replay.status, 401);
    assert.equal(replay.headers.get("set-cookie"), null);
    assert.equal((await replay.json()).paired, undefined);

    const forgedCookie = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
    const forged = await ownerStatus(req("/api/local/owner", "GET", { cookie: forgedCookie }));
    assert.equal((await forged.json()).paired, false);
  } finally {
    if (oldDir === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = oldDir;
    if (oldSecret === undefined) delete process.env[LAUNCH_SECRET_ENV];
    else process.env[LAUNCH_SECRET_ENV] = oldSecret;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
