import test from "node:test";
import assert from "node:assert/strict";
import { OAuthRedirectManager } from "../../src/server/cloudflare/oauth-redirect-manager.ts";
import { CloudflareApiError, ProvisioningError, type CloudflareRequester } from "../../src/server/cloudflare/provisioning-api.ts";
import type { DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";

const accountId = "a".repeat(32);
const appId = "11111111-1111-4111-8111-111111111111";
const oldUri = "https://old.example.org/oauth/callback";
const addedUri = "https://chatgpt.com/connector/oauth/*";
const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const email = "owner@example.com";
const hostname = "mcp.example.com";

function fixture(options: { unsafe?: boolean; putError?: boolean; drift?: boolean } = {}) {
  let record: DeploymentRecord = {
    version: 1, accountId, zoneId: "b".repeat(32),
    domain: "example.com", hostname, allowedEmail: email,
    redirectUris: [oldUri], phase: "published",
    accessAppId: appId, aud: "audience_tag_01234567",
    tunnelId: "22222222-2222-4222-8222-222222222222",
    dnsRecordId: "dns-id",
  };
  let redirects = options.drift ? [oldUri, "https://another.example.org/callback"] : [oldUri];
  let locked = false;
  const calls: { method: string; route: string; body?: object }[] = [];
  const policies = [{
    id: "p1", name: "Only owner", decision: "allow",
    include: [{ email: { email } }],
  }];
  const app = () => ({
    id: appId, aud: "audience_tag_01234567", type: "self_hosted",
    domain: hostname, name: "Existing Protected MCP",
    session_duration: "24h", app_launcher_visible: false,
    policies,
    oauth_configuration: {
      enabled: true,
      dynamic_client_registration: {
        enabled: true, allow_any_on_localhost: options.unsafe === true,
        allow_any_on_loopback: false, allowed_uris: redirects,
      },
      grant: { access_token_lifetime: "15m", session_duration: "168h" },
    },
  });
  const api: CloudflareRequester = async (method, route, credential, body) => {
    assert.equal(credential, token);
    assert.ok(route.startsWith("/accounts/" + accountId + "/access/apps/" + appId));
    calls.push({ method, route, body });
    if (method === "GET" && route.endsWith("/policies")) return structuredClone(policies);
    if (method === "GET") return structuredClone(app());
    if (method === "PUT") {
      if (options.putError) throw new CloudflareApiError(403);
      const next = body as ReturnType<typeof app>;
      assert.equal(next.type, "self_hosted");
      assert.equal(next.name, "Existing Protected MCP");
      assert.equal(next.session_duration, "24h");
      assert.equal(next.domain, hostname);
      assert.equal(next.aud, undefined);
      assert.equal(next.id, undefined);
      assert.deepEqual(next.policies, policies);
      assert.deepEqual(next.oauth_configuration.grant, {
        access_token_lifetime: "15m", session_duration: "168h",
      });
      redirects = next.oauth_configuration.dynamic_client_registration.allowed_uris;
      return app();
    }
    throw new Error("Unexpected API method");
  };
  const store = {
    async load() { return structuredClone(record); },
    async save(next: DeploymentRecord) { record = structuredClone(next); },
    async exclusive<T>(work: () => Promise<T>): Promise<T> {
      if (locked) throw new ProvisioningError("Locked");
      locked = true;
      try {
        const result = await work();
        locked = false;
        return result;
      } catch (error) { throw error; }
    },
  };
  const vault = { read(ref: { kind: string; accountId: string }) {
    assert.equal(ref.accountId, accountId);
    assert.equal(ref.kind, "cloudflare-api-token");
    return token;
  } };
  return {
    manager: new OAuthRedirectManager(store, vault, api),
    calls,
    get state() { return record; },
    get remote() { return redirects; },
    get locked() { return locked; },
  };
}

const approved = {
  confirmed: true, confirmHostname: hostname,
  expectedUris: [oldUri], redirectUris: [oldUri, addedUri],
};

test("read-only OAuth manager lists real Cloudflare callbacks without mutation", async () => {
  const f = fixture();
  const result = await f.manager.read();
  assert.deepEqual(result.redirectUris, [oldUri]);
  assert.equal(result.inSyncWithLocalState, true);
  assert.equal(result.cloudflareMutated, false);
  assert.deepEqual(f.calls.map(x => x.method), ["GET", "GET"]);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("confirmed update preserves all existing Access settings and syncs local state", async () => {
  const f = fixture();
  const result = await f.manager.save(approved);
  assert.equal(result.verified, true);
  assert.equal(result.updated, true);
  assert.equal(f.locked, false);
  assert.deepEqual(f.remote, [oldUri, addedUri]);
  assert.deepEqual(f.state.redirectUris, [oldUri, addedUri]);
  assert.equal(f.state.phase, "published");
  assert.equal(f.state.dnsRecordId, "dns-id");
  assert.deepEqual(f.calls.map(x => x.method), ["GET", "GET", "PUT", "GET", "GET"]);
  assert.equal(f.calls.some(x => x.route.includes("cfd_tunnel") || x.route.includes("dns_records")), false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("invalid and duplicate callback updates fail without any Cloudflare calls", async () => {
  for (const value of [
    { ...approved, confirmed: false },
    { ...approved, confirmHostname: "different.example.com" },
    { ...approved, redirectUris: [] },
    { ...approved, redirectUris: [oldUri, oldUri] },
    { ...approved, redirectUris: ["http://unsafe.example.org/callback"] },
    { ...approved, redirectUris: ["https://unsafe.example.org/callback?secret=x"] },
    { ...approved, redirectUris: ["https://unsafe.example.org/anything*"] },
  ]) {
    const f = fixture();
    await assert.rejects(() => f.manager.save(value));
    assert.equal(f.calls.some(x => x.method === "PUT"), false);
    assert.equal(f.locked, false);
    assert.deepEqual(f.state.redirectUris, [oldUri]);
  }
});

test("stale snapshot blocks overwrite and leaves deployment unlocked", async () => {
  const f = fixture({ drift: true });
  await assert.rejects(() => f.manager.save(approved), /refresh before editing/);
  assert.equal(f.locked, false);
  assert.equal(f.calls.some(x => x.method === "PUT"), false);
});

test("unsafe remote Managed OAuth is read-only rejected, not silently fixed", async () => {
  const f = fixture({ unsafe: true });
  await assert.rejects(() => f.manager.read(), /unsafe/);
  await assert.rejects(() => f.manager.save(approved), /unsafe/);
  assert.equal(f.locked, false);
  assert.equal(f.calls.some(x => x.method === "PUT"), false);
});

test("a failed PUT is treated as uncertain and preserves deployment lock", async () => {
  const f = fixture({ putError: true });
  await assert.rejects(() => f.manager.save(approved), /Cloudflare API denied/);
  assert.equal(f.locked, true);
  assert.deepEqual(f.state.redirectUris, [oldUri]);
  assert.deepEqual(f.remote, [oldUri]);
});

test("no-op update only repairs local metadata and makes no remote writes", async () => {
  const f = fixture({ drift: true });
  const result = await f.manager.save({
    confirmed: true, confirmHostname: hostname,
    expectedUris: [oldUri, "https://another.example.org/callback"],
    redirectUris: [oldUri, "https://another.example.org/callback"],
  });
  assert.equal(result.updated, false);
  assert.equal(result.verified, true);
  assert.equal(f.locked, false);
  assert.deepEqual(f.state.redirectUris, f.remote);
  assert.equal(f.calls.some(x => x.method === "PUT"), false);
});

test("dashboard route retains owner + CSRF guards for OAuth write", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("src/app/api/local/cloudflare/oauth-redirects/route.ts", "utf8");
  assert.match(source, /ensureOwnerRequest\(request, true\)/);
  assert.match(source, /ensureOwnerRequest\(request\)/);
  assert.match(source, /readJsonSmall\(request\)/);
  assert.doesNotMatch(source, /process\.env\.CLOUDFLARE_API_TOKEN/);
});
