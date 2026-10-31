import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureOwnerRequest } from "../../src/server/http/local-only.ts";
import { OwnerPairingRepository, OWNER_COOKIE } from "../../src/server/owner/index.ts";

function request(cookie?: string, origin = "http://127.0.0.1:3100") {
  return new Request("http://127.0.0.1:3100/api/local/policy", {
    method: "PATCH",
    headers: {
      host: "127.0.0.1:3100",
      origin,
      "content-type": "application/json",
      "x-local-mcp-action": "dashboard",
      ...(cookie ? { cookie: OWNER_COOKIE + "=" + cookie } : {}),
    },
    body: JSON.stringify({ type: "tool", tool: "read_file", enabled: true }),
  });
}

test("localhost by itself cannot authorize state modifications", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-guard-"));
  const before = process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR = folder;
  try {
    assert.equal((await ensureOwnerRequest(request(), true))?.status, 401);
    const metadataGet = (session?: string) => new Request("http://127.0.0.1:3100/api/local/policy", {
      headers: { host: "127.0.0.1:3100", ...(session ? { cookie: OWNER_COOKIE + "=" + session } : {}) },
    });
    assert.equal((await ensureOwnerRequest(metadataGet()))?.status, 401);
    const owner = new OwnerPairingRepository(folder);
    const ticket = await owner.createTicket();
    const session = await owner.redeemTicket(ticket);
    assert.ok(session);
    assert.equal(await ensureOwnerRequest(request(session), true), null);
    assert.equal(await ensureOwnerRequest(metadataGet(session)), null);
    assert.equal((await ensureOwnerRequest(request(session, "http://evil.example"), true))?.status, 403);
    const forged = session.slice(0, -1) + (session.endsWith("A") ? "B" : "A");
    assert.equal((await ensureOwnerRequest(request(forged), true))?.status, 401);
    const duplicates = request(session);
    duplicates.headers.set("cookie", OWNER_COOKIE + "=" + session + "; " + OWNER_COOKIE + "=" + forged);
    assert.equal((await ensureOwnerRequest(duplicates, true))?.status, 401);
  } finally {
    if (before === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = before;
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("root dashboard mounts the browser pairing handler", async () => {
  const layout = await fs.readFile(path.resolve("src/app/layout.tsx"), "utf8");
  assert.match(layout, /import OwnerPairingBanner from ["']@\/features\/onboarding\/owner-pairing-banner["']/);
  assert.match(layout, /<OwnerPairingBanner\s*\/>/);
  const component = await fs.readFile(path.resolve("src/features/onboarding/owner-pairing-banner.tsx"), "utf8");
  assert.match(component, /window\.location\.hash/);
  assert.match(component, /params\.get\(["']owner-pair["']\)/);
  assert.match(component, /\/api\/local\/owner\/pair/);
});

test("sensitive metadata GET routes enforce owner pairing", async () => {
  const root = path.resolve("src/app/api/local");
  for (const relative of [
    "policy/route.ts", "cloudflare/route.ts", "setup/route.ts", "activity/route.ts",
    "onboarding/route.ts", "service/route.ts", "status/route.ts",
    "cloudflare/deployment/route.ts", "cloudflare/setup-draft/route.ts",
    "cloudflare/dns-finalize/route.ts",
  ]) {
    const content = await fs.readFile(path.join(root, relative), "utf8");
    const start = content.indexOf("export async function GET(request:");
    assert.notEqual(start, -1, relative + " missing GET");
    const end = content.indexOf("\nexport async function ", start + 1);
    const handler = content.slice(start, end === -1 ? undefined : end);
    assert.match(handler, /await ensureOwnerRequest\(request\)/, relative + " GET must require owner session");
  }
});

test("public owner pairing bootstrap stays reachable", async () => {
  const root = path.resolve("src/app/api/local");
  const status = await fs.readFile(path.join(root, "owner/route.ts"), "utf8");
  const pair = await fs.readFile(path.join(root, "owner/pair/route.ts"), "utf8");
  assert.match(status, /ensureLocalRequest/);
  assert.match(pair, /ensureLocalRequest/);
  assert.doesNotMatch(status, /ensureOwnerRequest/);
  assert.doesNotMatch(pair, /ensureOwnerRequest/);
});

test("all privileged local API mutation handlers enforce owner pairing", async () => {
  const root = path.resolve("src/app/api/local");
  const protectedRoutes = [
    ["policy/route.ts", ["POST", "PATCH", "DELETE"]],
    ["service/route.ts", ["POST"]],
    ["cloudflare/route.ts", ["PUT", "DELETE"]],
    ["cloudflare/verify/route.ts", ["POST"]],
    ["cloudflare/credentials/route.ts", ["POST", "PUT", "DELETE"]],
    ["cloudflare/preflight/route.ts", ["POST"]],
    ["cloudflare/preflight/saved/route.ts", ["POST"]],
    ["cloudflare/deployment/route.ts", ["POST"]],
    ["cloudflare/dns-finalize/route.ts", ["POST"]],
    ["onboarding/route.ts", ["PATCH"]],
  ] as const;
  for (const [relative, methods] of protectedRoutes) {
    const content = await fs.readFile(path.join(root, relative), "utf8");
    assert.match(content, /ensureOwnerRequest/);
    for (const method of methods) {
      const start = content.indexOf("export async function " + method);
      assert.notEqual(start, -1, relative + " missing " + method);
      const handler = content.slice(start, content.indexOf("\nexport async function ", start + 1) === -1
        ? undefined : content.indexOf("\nexport async function ", start + 1));
      if (relative === "cloudflare/credentials/route.ts") {
        // Credential handlers delegate to the shared owner-guarded executor.
        assert.match(content, /async function perform[\s\S]*?await ensureOwnerRequest\(request, true\)/);
        assert.match(handler, /return perform\(request, "(?:save|rotate|revoke)"\)/);
      } else {
        assert.match(handler, /await ensureOwnerRequest\(request, true\)/,
          relative + " " + method + " must enforce owner pairing");
      }
    }
  }
});
