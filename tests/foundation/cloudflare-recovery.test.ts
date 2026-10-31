import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeploymentRepository, type DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";
import { ProtectedCloudflareProvisioner } from "../../src/server/cloudflare/protected-provisioner.ts";
import { ProvisioningError, type CloudflareRequester } from "../../src/server/cloudflare/provisioning-api.ts";
import type { SavedCloudflarePreflight } from "../../src/server/cloudflare/saved-preflight.ts";

const account = "a".repeat(32);
const zoneId = "b".repeat(32);
const appId = "11111111-1111-4111-8111-111111111111";
const hostname = "mcptest.example.com";
const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const redirects = ["https://client.example.org/oauth/callback"];
const record: DeploymentRecord = {
  version: 1, accountId: account, zoneId,
  domain: "example.com", hostname, allowedEmail: "owner@example.com",
  redirectUris: redirects, phase: "access-ready",
  accessAppId: appId, aud: "audience_tag_01234567",
  tunnelId: null, dnsRecordId: null,
};

async function fixture(flags: { tunnelPresent?: boolean; blockedDns?: boolean; accessInvalid?: boolean; failTunnelRead?: boolean } = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-recovery-"));
  const repository = new DeploymentRepository(folder);
  await repository.save(record);
  await assert.rejects(() => repository.exclusive(async () => { throw new Error("uncertain write"); }));
  assert.equal(await repository.lockStatus(), "held");

  const calls: string[] = [];
  const api: CloudflareRequester = async (method, url, received) => {
    assert.equal(received, token);
    assert.equal(method, "GET", "recovery must never create Cloudflare resources");
    calls.push(url);
    if (url.endsWith("/access/apps/" + appId)) return {
      id: appId, aud: record.aud, domain: hostname, type: "self_hosted",
      oauth_configuration: {
        enabled: !flags.accessInvalid,
        dynamic_client_registration: {
          enabled: true, allow_any_on_localhost: false,
          allow_any_on_loopback: false, allowed_uris: redirects,
        },
      },
    };
    if (url.endsWith("/access/apps/" + appId + "/policies")) return [
      { decision: "allow", include: [{ email: { email: "owner@example.com" } }] },
    ];
    if (url.includes("/cfd_tunnel?")) {
      if (flags.failTunnelRead) throw new ProvisioningError("Permissions unavailable");
      return flags.tunnelPresent ? [{
        id: "22222222-2222-4222-8222-222222222222",
        name: "local-mcp-manager-mcptest-example-com", deleted_at: null,
      }] : [];
    }
    throw new Error("Unexpected request");
  };
  const vault = { read() { return token; } };
  const preflight = { async check() {
    return { preflight: {
      accountId: account, zoneId,
      dnsScanTruncated: false,
      status: flags.blockedDns ? "blocked" as const : "candidate" as const,
    } };
  } } as unknown as Pick<SavedCloudflarePreflight, "check">;
  const provisioner = new ProtectedCloudflareProvisioner(repository, vault, preflight, api);
  return {
    folder, repository, provisioner, calls,
    async ageLock() {
      const old = new Date(Date.now() - 240_000);
      await fs.utimes(path.join(folder, "cloudflare-deployment.lock"), old, old);
    },
    async cleanup() { await fs.rm(folder, { recursive: true, force: true }); },
  };
}

test("safe recovery only after 3 minutes, exact hostname, double GET and explicit approval", async () => {
  const f = await fixture();
  try {
    await assert.rejects(() => f.provisioner.recover({
      action: "recover", confirmed: true, confirmHostname: hostname,
    }), /three minutes/);
    assert.equal(await f.repository.lockStatus(), "held");
    await f.ageLock();
    for (const bad of [
      { action: "recover", confirmed: false, confirmHostname: hostname },
      { action: "recover", confirmed: true, confirmHostname: "other.example.com" },
      { action: "recover", confirmed: true, confirmHostname: hostname, token },
    ]) {
      await assert.rejects(() => f.provisioner.recover(bad));
      assert.equal(await f.repository.lockStatus(), "held");
    }
    const result = await f.provisioner.recover({
      action: "recover", confirmed: true, confirmHostname: hostname,
    });
    assert.equal(result.recovered, true);
    assert.equal(result.cloudflareMutated, false);
    assert.equal(await f.repository.lockStatus(), "clear");
    assert.equal((await f.repository.load())?.phase, "access-ready");
    assert.ok(f.calls.length >= 3);
    assert.equal(await f.repository.exclusive(async () => "unlocked"), "unlocked");
    assert.equal(JSON.stringify(result).includes(token), false);
  } finally { await f.cleanup(); }
});

test("recovery refused when tunnel exists, DNS occupied, Access unverified, or tunnel list unreadable", async () => {
  for (const flags of [
    { tunnelPresent: true }, { blockedDns: true }, { accessInvalid: true }, { failTunnelRead: true },
  ]) {
    const f = await fixture(flags);
    try {
      await f.ageLock();
      await assert.rejects(() => f.provisioner.recover({
        action: "recover", confirmed: true, confirmHostname: hostname,
      }), /cannot be proven safe/);
      assert.equal(await f.repository.lockStatus(), "held");
      assert.equal((await f.repository.load())?.phase, "access-ready");
      assert.ok(f.calls.every(c => c.startsWith("/accounts/" + account)));
    } finally { await f.cleanup(); }
  }
});

test("recovery refuses non-access-ready or recorded tunnel/DNS, even if lock is old", async () => {
  const f = await fixture();
  try {
    await f.ageLock();
    await f.repository.save({ ...record, phase: "tunnel-ready",
      tunnelId: "22222222-2222-4222-8222-222222222222" });
    await assert.rejects(() => f.provisioner.recover({
      action: "recover", confirmed: true, confirmHostname: hostname,
    }), /not eligible/);
    assert.equal(await f.repository.lockStatus(), "held");
  } finally { await f.cleanup(); }
});

test("UI and privileged route expose recover only after explicit owner request and consent", async () => {
  const route = await fs.readFile(path.resolve("src/app/api/local/cloudflare/deployment/route.ts"), "utf8");
  const page = await fs.readFile(path.resolve("src/features/setup-center/cloudflare-deployment-panel.js"), "utf8");
  assert.match(route, /await ensureOwnerRequest\(request, true\)/);
  assert.match(route, /provisioner\.recover\(body\)/);
  assert.match(page, /action: "recover", confirmed: true/);
  assert.match(page, /recoveryApproved/);
  assert.match(page, /recoverableState/);
  assert.match(page, /Periksa ulang & pulihkan lock lokal/);
  assert.doesNotMatch(page, /unlink\(|rm -f|LOCAL_MCP_ENABLE_CLOUDFLARE_WRITES/);
});
