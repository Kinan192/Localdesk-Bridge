import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ProtectedCloudflareProvisioner, DeploymentStageError } from "../../src/server/cloudflare/protected-provisioner.ts";
import { CloudflareApiError, ProvisioningError, type CloudflareRequester } from "../../src/server/cloudflare/provisioning-api.ts";
import type { DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";
import type { SavedCloudflarePreflight } from "../../src/server/cloudflare/saved-preflight.ts";

const accountId = "a".repeat(32);
const zoneId = "b".repeat(32);
const appId = "11111111-1111-4111-8111-111111111111";
const tunnelId = "22222222-2222-4222-8222-222222222222";
const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const hostname = "mcp.example.com";
const email = "owner@example.com";
const redirects = ["https://client.example.org/oauth/callback"];
const base = { accountId, domain: "example.com", subdomain: "mcp",
  allowedEmail: email, confirmHostname: hostname, confirmed: true };
const prepare = { ...base, action: "prepare" as const, redirectUris: redirects };
const check = { ...base, action: "check" as const, redirectUris: redirects };
delete (check as Record<string, unknown>).confirmed;
const publish = { ...base, action: "publish" as const };

function fixture(opts: { collide?: boolean; pending?: boolean; corruptOauth?: boolean; failAt?: string;
  existingTunnel?: boolean; denyTunnelRead?: boolean } = {}) {
  let current: DeploymentRecord | null = null;
  let locked = false;
  const calls: { method: string; path: string; body?: object }[] = [];
  let appCreated = false;
  let tunnelCreated = false;
  const app = () => ({
    id: appId, aud: "audience_tag_01234567", domain: hostname, type: "self_hosted",
    oauth_configuration: {
      enabled: !opts.corruptOauth,
      dynamic_client_registration: {
        enabled: true, allow_any_on_localhost: false, allow_any_on_loopback: false,
        allowed_uris: redirects,
      },
    },
    policies: [{ decision: "allow", include: [{ email: { email } }] }],
  });
  const api: CloudflareRequester = async (method, route, value, body) => {
    assert.equal(value, token);
    assert.ok(route.startsWith("/accounts/" + accountId + "/") ||
      route.startsWith("/zones/" + zoneId + "/"));
    calls.push({ method, path: route, body });
    if (opts.failAt && route.includes(opts.failAt)) throw new CloudflareApiError(403);
    if (method === "GET" && route.includes("/access/apps?")) return opts.collide ? [{ domain: hostname }] : [];
    if (method === "GET" && route.includes("/cfd_tunnel?")) {
      if (opts.denyTunnelRead) throw new ProvisioningError("Missing tunnel permission.");
      return opts.existingTunnel ? [{
        name: "local-mcp-manager-mcp-example-com", id: tunnelId, deleted_at: null,
      }] : [];
    }
    if (method === "POST" && route.endsWith("/access/apps")) {
      appCreated = true;
      return { id: appId };
    }
    if (method === "GET" && route.endsWith("/access/apps/" + appId + "/policies")) return app().policies;
    if (method === "GET" && route.endsWith("/access/apps/" + appId)) {
      assert.ok(appCreated);
      return app();
    }
    if (method === "POST" && route.endsWith("/cfd_tunnel")) {
      assert.ok(appCreated); tunnelCreated = true; return { id: tunnelId };
    }
    if (method === "PUT" && route.endsWith("/configurations")) {
      assert.ok(tunnelCreated);
      return { version: 1 };
    }
    if (method === "POST" && route.endsWith("/dns_records")) {
      assert.ok(tunnelCreated);
      return { id: "created-dns", name: hostname, type: "CNAME" };
    }
    throw new Error("Unexpected API call " + method + " " + route);
  };
  const state = {
    async load() { return current ? structuredClone(current) : null; },
    async save(value: DeploymentRecord) { current = structuredClone(value); },
    async exclusive<T>(fn: () => Promise<T>): Promise<T> {
      if (locked) throw new ProvisioningError("Locked");
      locked = true;
      try { const result = await fn(); locked = false; return result; }
      catch (err) { throw err; }
    },
  };
  const read = { read(ref: { accountId: string }) {
    assert.equal(ref.accountId, accountId);
    return token;
  } };
  let preflightCount = 0;
  const preflight = { async check(input: { accountId: string }) {
    assert.equal(input.accountId, accountId);
    preflightCount++;
    return { preflight: { status: opts.pending ? "blocked" : "candidate",
      zoneActive: true, dnsScanTruncated: false, accountId, zoneId } };
  } } as unknown as Pick<SavedCloudflarePreflight, "check">;
  const p = new ProtectedCloudflareProvisioner(state, read, preflight, api);
  return { p, calls, get state() { return current; }, get checks() { return preflightCount; } };
}

test("dashboard readiness check performs GET-only Cloudflare calls without changing deployment", async () => {
  const f = fixture();
  const result = await f.p.checkSetup(check);
  assert.equal(result.ready, true);
  assert.equal(result.hostname, hostname);
  assert.equal(result.cloudflareMutated, false);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.checks.tokenFromKeychain, true);
  assert.equal(result.checks.dnsHostnameAvailable, true);
  assert.equal(result.checks.accessApplicationAvailable, true);
  assert.equal(f.state, null);
  assert.equal(f.checks, 1);
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls.every(c => c.method === "GET"));
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("readiness check refuses unsafe input and Access collisions without writes", async () => {
  for (const invalid of [
    { ...check, accountId: "broken" },
    { ...check, confirmHostname: "other.example.com" },
    { ...check, redirectUris: ["http://evil.example.org/callback"] },
    { ...check, redirectUris: ["https://client.example.org/callback?secret=bad"] },
    { ...check, token: "should-not-be-accepted" },
  ]) {
    const f = fixture();
    await assert.rejects(() => f.p.checkSetup(invalid));
    assert.ok(f.calls.every(c => c.method === "GET"));
    assert.equal(f.state, null);
  }
  const collision = fixture({ collide: true });
  await assert.rejects(() => collision.p.checkSetup(check), /Hostname sudah/);
  assert.ok(collision.calls.every(c => c.method === "GET"));
  assert.equal(collision.state, null);
  const blocked = fixture({ pending: true });
  await assert.rejects(() => blocked.p.checkSetup(check), /occupied/);
  assert.equal(blocked.calls.length, 0);
});

test("protected-first flow: Access policy and Managed OAuth verified BEFORE tunnel; DNS last", async () => {
  const f = fixture();
  const access = await f.p.execute(prepare);
  assert.equal(access.phase, "access-ready");
  assert.equal(access.managedOAuthEnabled, true);
  assert.equal(access.connectorRunning, false);
  assert.equal(access.clientConnected, false);
  assert.equal(f.state?.phase, "access-ready");
  assert.deepEqual(f.calls.map(c => c.method + " " + c.path.split("/").slice(-2).join("/")), [
    "GET access/apps?per_page=100&page=1", "POST access/apps", "GET apps/" + appId,
    "GET " + appId + "/policies",
  ]);
  const createAccess = f.calls[1].body as Record<string, unknown>;
  const oauth = createAccess.oauth_configuration as Record<string, unknown>;
  assert.equal(oauth.enabled, true);
  assert.deepEqual((createAccess.policies as object[]).length, 1);
  assert.equal(JSON.stringify(createAccess).includes(token), false);

  const published = await f.p.execute(publish);
  assert.equal(published.phase, "published");
  assert.equal(published.accessAudience, "audience_tag_01234567");
  assert.equal(f.state?.dnsRecordId, "created-dns");
  assert.equal(f.checks, 2);
  const writes = f.calls.filter(c => c.method !== "GET");
  assert.deepEqual(writes.map(c => c.path.split("/").at(-1)), [
    "apps", "cfd_tunnel", "configurations", "dns_records",
  ]);
  const ingress = (writes[2].body as { config: { ingress: object[] } }).config.ingress;
  assert.deepEqual(ingress, [
    { hostname, service: "http://127.0.0.1:8401", originRequest: {} },
    { service: "http_status:404" },
  ]);
  assert.equal((writes[3].body as { proxied: boolean }).proxied, true);
  assert.ok(f.calls.findIndex(c => c.path.endsWith("/access/apps/" + appId)) <
    f.calls.findIndex(c => c.path.endsWith("/dns_records")));
  assert.equal(JSON.stringify(published).includes(token), false);
  await assert.rejects(() => f.p.execute(publish), /Access preparation/);
});

test("read-only deployment diagnostics verify Access/DNS/tunnel without writing or revealing token", async () => {
  const f = fixture({ existingTunnel: true });
  await f.p.execute(prepare);
  const previous = structuredClone(f.state);
  const countBefore = f.calls.length;
  const info = await f.p.diagnose();
  assert.equal(info.phase, "access-ready");
  assert.equal(info.access, "verified");
  assert.equal(info.dns, "available");
  assert.equal(info.tunnel, "present");
  assert.equal(info.tunnelId, tunnelId);
  assert.equal(info.canRetry, false);
  assert.deepEqual(f.state, previous);
  assert.ok(f.calls.slice(countBefore).every(call => call.method === "GET"));
  assert.equal(JSON.stringify(info).includes(token), false);
});

test("read-only diagnostics fail closed when Tunnel permissions are unavailable", async () => {
  const f = fixture({ denyTunnelRead: true });
  await f.p.execute(prepare);
  const countBefore = f.calls.length;
  const info = await f.p.diagnose();
  assert.equal(info.phase, "access-ready");
  assert.equal(info.tunnel, "unverified");
  assert.ok(info.notes?.some(note => note.includes("Tunnel Read/Write")));
  assert.equal(info.canRetry, false);
  assert.ok(f.calls.slice(countBefore).every(call => call.method === "GET"));
});

test("publish failure identifies exact Cloudflare stage and status without exposing token", async () => {
  const f = fixture({ failAt: "/cfd_tunnel" });
  await f.p.execute(prepare);
  await assert.rejects(() => f.p.execute(publish), (error: unknown) => {
    assert.ok(error instanceof DeploymentStageError);
    assert.equal(error.stage, "tunnel-create");
    assert.equal(error.providerStatus, 403);
    assert.match(error.message, /Cloudflare HTTP 403/);
    assert.equal(error.message.includes(token), false);
    return true;
  });
  assert.equal(f.state?.phase, "access-ready");
  assert.equal(f.state?.tunnelId, null);
  assert.equal(f.calls.some(c => c.method === "POST" && c.path.endsWith("/dns_records")), false);
});

test("failed tunnel configuration is distinct from tunnel creation; DNS stays untouched", async () => {
  const f = fixture({ failAt: "/configurations" });
  await f.p.execute(prepare);
  await assert.rejects(() => f.p.execute(publish), (error: unknown) => {
    assert.ok(error instanceof DeploymentStageError);
    assert.equal(error.stage, "tunnel-configure");
    assert.equal(error.providerStatus, 403);
    assert.equal(error.message.includes(token), false);
    return true;
  });
  assert.equal(f.state?.phase, "tunnel-ready");
  assert.equal(f.state?.tunnelId, tunnelId);
  assert.equal(f.calls.some(c => c.path.endsWith("/dns_records")), false);
});

test("Cloudflare preview receives only the strict preview fields, not deployment approval metadata", async () => {
  const source = await fs.readFile(path.resolve("src/server/cloudflare/protected-provisioner.ts"), "utf8");
  assert.match(source, /createProvisioningPreview\(\{\s*domain: input\.domain,\s*subdomain: input\.subdomain,\s*allowedEmail: input\.allowedEmail,\s*\}\)/);
  assert.doesNotMatch(source, /createProvisioningPreview\(input\)/);
});

test("strict hostname confirmation and callbacks reject risky input without any remote calls", async () => {
  for (const invalid of [
    { ...prepare, confirmed: false },
    { ...prepare, confirmHostname: "other.example.com" },
    { ...prepare, redirectUris: ["http://client.example.org/callback"] },
    { ...prepare, redirectUris: ["https://client.example.org/?token=something"] },
    { ...prepare, redirectUris: ["https://client.example.org/abc*"] },
    { ...prepare, redirectUris: [] },
    { ...prepare, token },
  ]) {
    const f = fixture();
    await assert.rejects(() => f.p.execute(invalid));
    assert.equal(f.calls.length, 0);
  }
});

test("DNS collision and Access app collision fail before remote writes", async () => {
  const blocked = fixture({ pending: true });
  await assert.rejects(() => blocked.p.execute(prepare), /occupied/);
  assert.equal(blocked.calls.length, 0);
  const appExists = fixture({ collide: true });
  await assert.rejects(() => appExists.p.execute(prepare), /collision/);
  assert.equal(appExists.calls.every(c => c.method === "GET"), true);
});

test("failed Access OAuth verification blocks tunnel and all publishing", async () => {
  const f = fixture({ corruptOauth: true });
  await assert.rejects(() => f.p.execute(prepare), /Managed OAuth/);
  assert.equal(f.state?.phase, "preparing");
  assert.equal(f.state?.accessAppId, appId);
  assert.equal(f.calls.every(c => !c.path.includes("dns_records") &&
    !c.path.includes("cfd_tunnel")), true);
  await assert.rejects(() => f.p.execute(prepare), /Locked/);
});

test("owner-guarded deployment route requires explicit confirmation and hides tokens", async () => {
  const source = await fs.readFile(path.resolve("src/app/api/local/cloudflare/deployment/route.ts"), "utf8");
  assert.match(source, /await ensureOwnerRequest\(request, true\)/);
  assert.match(source, /await ensureOwnerRequest\(request\)/);
  assert.match(source, /readJsonSmall\(request\)/);
  assert.match(source, /provisioner\.checkSetup\(body\)/);
  assert.match(source, /provisioner\.diagnose\(\)/);
  assert.match(source, /error instanceof DeploymentStageError/);
  assert.match(source, /cloudflareHttpStatus: error\.providerStatus/);
  assert.doesNotMatch(source, /LOCAL_MCP_ENABLE_CLOUDFLARE_WRITES/);
  assert.doesNotMatch(source, /Authorization: Bearer/);
});
