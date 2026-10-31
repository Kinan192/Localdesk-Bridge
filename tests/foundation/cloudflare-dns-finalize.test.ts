import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeploymentRepository, type DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";
import { ProtectedCloudflareProvisioner, DeploymentStageError, DnsCompletionStageError } from "../../src/server/cloudflare/protected-provisioner.ts";
import { CloudflareApiError, type CloudflareRequester } from "../../src/server/cloudflare/provisioning-api.ts";
import type { SavedCloudflarePreflight } from "../../src/server/cloudflare/saved-preflight.ts";

const accountId = "a".repeat(32);
const zoneId = "b".repeat(32);
const tunnelId = "11111111-1111-4111-8111-111111111111";
const accessAppId = "22222222-2222-4222-8222-222222222222";
const dnsId = "c".repeat(32);
const hostname = "mcptest.example.com";
const apiToken = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const email = "owner@example.com";
const redirects = ["https://client.example.org/oauth/callback"];
const record: DeploymentRecord = {
  version: 1, accountId, zoneId, domain: "example.com", hostname,
  allowedEmail: email, redirectUris: redirects, phase: "tunnel-ready",
  accessAppId, aud: "audience_tag_01234567", tunnelId, dnsRecordId: null,
};

async function fixture(options: {
  collision?: boolean; mismatchedIngress?: boolean; denyDns?: boolean;
} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-dns-completion-"));
  const repo = new DeploymentRepository(directory);
  await repo.save(structuredClone(record));
  const calls: { method: string; route: string }[] = [];
  const api: CloudflareRequester = async (method, route, actualToken) => {
    assert.equal(actualToken, apiToken);
    calls.push({ method, route });
    if (method === "GET" && route.endsWith("/access/apps/" + accessAppId)) {
      return {
        id: accessAppId, aud: record.aud, domain: hostname, type: "self_hosted",
        oauth_configuration: {
          enabled: true, dynamic_client_registration: {
            enabled: true, allow_any_on_localhost: false,
            allow_any_on_loopback: false, allowed_uris: redirects,
          },
        },
      };
    }
    if (method === "GET" && route.endsWith("/access/apps/" + accessAppId + "/policies")) {
      return [{ decision: "allow", include: [{ email: { email } }] }];
    }
    if (method === "GET" && route.endsWith("/cfd_tunnel/" + tunnelId)) {
      return { id: tunnelId, account_tag: accountId, config_src: "cloudflare", deleted_at: null };
    }
    if (method === "GET" && route.endsWith("/cfd_tunnel/" + tunnelId + "/configurations")) {
      return { config: { ingress: [
        { hostname, service: options.mismatchedIngress ? "http://127.0.0.1:3100" : "http://127.0.0.1:8401" },
        { service: "http_status:404" },
      ] } };
    }
    if (route === "/zones/" + zoneId + "/dns_records") {
      assert.equal(method, "POST");
      if (options.denyDns) throw new CloudflareApiError(403);
      return { id: dnsId, type: "CNAME", name: hostname,
        content: tunnelId + ".cfargotunnel.com", proxied: true };
    }
    if (method === "GET" && route === "/zones/" + zoneId + "/dns_records/" + dnsId) {
      return { id: dnsId, type: "CNAME", name: hostname,
        content: tunnelId + ".cfargotunnel.com", proxied: true };
    }
    throw new Error("Unexpected Cloudflare call: " + method + " " + route);
  };
  const preflight = { async check() {
    return { preflight: {
      zoneId, accountId, hostname, zoneActive: true,
      dnsScanTruncated: false, status: options.collision ? "blocked" as const : "candidate" as const,
    } };
  } } as unknown as Pick<SavedCloudflarePreflight, "check">;
  const provisioner = new ProtectedCloudflareProvisioner(
    repo, { read() { return apiToken; } }, preflight, api,
  );
  return {
    repo, provisioner, calls, directory,
    async leaveStalePublicationLock() {
      await assert.rejects(() => repo.exclusive(async () => { throw new Error("prior failure"); }));
      const timestamp = new Date(Date.now() - 240_000);
      await fs.utimes(path.join(directory, "cloudflare-deployment.lock"), timestamp, timestamp);
    },
    async close() { await fs.rm(directory, { recursive: true, force: true }); },
  };
}

test("incomplete Tunnel DNS readiness is read-only and anchored to exact stored IDs", async () => {
  const f = await fixture();
  try {
    const readiness = await f.provisioner.checkDnsCompletion();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.cloudflareMutated, false);
    assert.equal(readiness.hostname, hostname);
    assert.equal(readiness.target, tunnelId + ".cfargotunnel.com");
    assert.equal(f.calls.filter(v => v.method !== "GET").length, 0);
    assert.equal((await f.repo.load())?.phase, "tunnel-ready");
    assert.equal(JSON.stringify(readiness).includes(apiToken), false);
  } finally { await f.close(); }
});

test("owner-approved DNS completion uses existing Tunnel and creates exactly one verified CNAME", async () => {
  const f = await fixture();
  try {
    await f.leaveStalePublicationLock();
    const result = await f.provisioner.finalizeDns({ confirmed: true, confirmHostname: hostname });
    assert.equal(result.phase, "published");
    assert.equal(result.dnsCompleted, true);
    assert.equal(result.tunnelId, tunnelId);
    assert.equal(result.dnsRecordId, dnsId);
    assert.equal((await f.repo.load())?.phase, "published");
    assert.equal(await f.repo.lockStatus(), "clear");
    assert.deepEqual(f.calls.filter(v => v.method === "POST"), [{
      method: "POST", route: "/zones/" + zoneId + "/dns_records",
    }]);
    assert.equal(f.calls.some(v => v.route === "/accounts/" + accountId + "/cfd_tunnel" &&
      v.method === "POST"), false);
    await assert.rejects(() => f.provisioner.finalizeDns({
      confirmed: true, confirmHostname: hostname,
    }), /Only an existing|Only an existing, incomplete/);
  } finally { await f.close(); }
});

test("DNS completion refuses wrong host, missing consent, conflicting DNS or incorrect Tunnel ingress", async () => {
  for (const opts of [{ collision: true }, { mismatchedIngress: true }]) {
    const f = await fixture(opts);
    try {
      await f.leaveStalePublicationLock();
      await assert.rejects(() => f.provisioner.finalizeDns({
        confirmed: true, confirmHostname: hostname,
      }));
      assert.equal((await f.repo.load())?.phase, "tunnel-ready");
      assert.equal(await f.repo.lockStatus(), "held");
      assert.equal(f.calls.filter(v => v.method !== "GET").length, 0);
    } finally { await f.close(); }
  }
  const f = await fixture();
  try {
    await assert.rejects(() => f.provisioner.finalizeDns({
      confirmed: false, confirmHostname: hostname,
    }), /explicit owner consent/);
    await assert.rejects(() => f.provisioner.finalizeDns({
      confirmed: true, confirmHostname: "other.example.com",
    }), /does not match/);
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test("DNS write HTTP 403 leaves deployment locked and never marks published", async () => {
  const f = await fixture({ denyDns: true });
  try {
    await f.leaveStalePublicationLock();
    await assert.rejects(() => f.provisioner.finalizeDns({
      confirmed: true, confirmHostname: hostname,
    }), (error: unknown) => {
      assert.ok(error instanceof DeploymentStageError);
      assert.equal(error.stage, "dns-resume-create");
      assert.equal(error.providerStatus, 403);
      assert.equal(error.message.includes(apiToken), false);
      return true;
    });
    assert.equal((await f.repo.load())?.phase, "tunnel-ready");
    assert.equal(await f.repo.lockStatus(), "held");
    assert.equal(f.calls.filter(v => v.method === "POST").length, 1);
  } finally { await f.close(); }
});

test("unexpected local credential failure is classified safely without leaking secrets or clearing lock", async () => {
  const f = await fixture();
  try {
    await f.leaveStalePublicationLock();
    const broken = new ProtectedCloudflareProvisioner(
      f.repo,
      { read() { throw new Error("PRIVATE KEYRING ERROR secret-data"); } },
    );
    await assert.rejects(
      () => broken.finalizeDns({ confirmed: true, confirmHostname: hostname }),
      (error: unknown) => {
        assert.ok(error instanceof DnsCompletionStageError);
        assert.equal(error.stage, "credential-read");
        assert.doesNotMatch(error.message, /PRIVATE|secret-data/);
        return true;
      },
    );
    assert.equal(await f.repo.lockStatus(), "held");
    assert.equal((await f.repo.load())?.phase, "tunnel-ready");
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test("unexpected local lock failure is categorized without a Cloudflare write", async () => {
  const f = await fixture();
  try {
    class BrokenRepository extends DeploymentRepository {
      override async exclusiveDnsCompletion<T>(_work: () => Promise<T>): Promise<T> {
        throw new Error("Native filesystem internal sensitive path");
      }
    }
    const broken = new BrokenRepository(f.directory);
    const provisioner = new ProtectedCloudflareProvisioner(broken);
    await assert.rejects(() => provisioner.finalizeDns({
      confirmed: true, confirmHostname: hostname,
    }), (error: unknown) => {
      assert.ok(error instanceof DnsCompletionStageError);
      assert.equal(error.stage, "deployment-lock");
      assert.doesNotMatch(error.message, /sensitive path/);
      return true;
    });
    assert.equal((await f.repo.load())?.phase, "tunnel-ready");
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test("read-only lock diagnosis distinguishes stale deployment lock from completion/recovery guards", async () => {
  const f = await fixture();
  try {
    const clean = await f.repo.inspectDnsLock();
    assert.equal(clean.deployment.state, "clear");
    assert.equal(clean.completion.state, "clear");
    assert.equal(clean.canAttemptDnsRecovery, true);
    await f.leaveStalePublicationLock();
    const held = await f.repo.inspectDnsLock();
    assert.equal(held.deployment.state, "held");
    assert.ok((held.deployment.ageSeconds ?? 0) >= 180);
    assert.equal(held.completion.state, "clear");
    assert.equal(held.canAttemptDnsRecovery, true);
    await fs.writeFile(path.join(f.directory, "cloudflare-dns-finalize.guard"), "", { flag: "wx" });
    const guarded = await f.repo.inspectDnsLock();
    assert.equal(guarded.completion.state, "held");
    assert.equal(guarded.canAttemptDnsRecovery, false);
    assert.equal(await f.repo.lockStatus(), "held");
  } finally { await f.close(); }
});

test("unexpected filesystem error is classified by safe errno, never raw message", async () => {
  const problem = new Error("Do not leak internal home path or Cloudflare token");
  Object.assign(problem, { code: "EACCES" });
  const diagnostic = new DnsCompletionStageError("deployment-lock", problem);
  assert.equal(diagnostic.safeCode, "EACCES");
  assert.equal(diagnostic.kind, "filesystem");
  assert.doesNotMatch(JSON.stringify(diagnostic), /home path|Cloudflare token/);
});

test("DNS finalization endpoint requires owner approval and UI never retries Tunnel creation", async () => {
  const route = await fs.readFile(path.resolve("src/app/api/local/cloudflare/dns-finalize/route.ts"), "utf8");
  const ui = await fs.readFile(path.resolve("src/app/cloudflare-setup/page.js"), "utf8");
  assert.match(route, /ensureOwnerRequest\(request, true\)/);
  assert.match(route, /finalizeDns\(body\)/);
  assert.match(route, /checkDnsCompletion\(\)/);
  assert.match(ui, /Selesaikan Publikasi DNS/);
  assert.match(ui, /Cek kelengkapan DNS \(read-only\)/);
  assert.match(ui, /dnsApproved/);
  assert.match(ui, /dnsFailure/);
  assert.match(ui, /dnsLockInfo/);
  assert.match(ui, /canAttemptDnsRecovery/);
  assert.match(route, /inspectDnsLock/);
  assert.match(route, /DnsCompletionStageError/);
  assert.match(route, /deployment/);
  assert.doesNotMatch(route, /cfd_tunnel.*POST|TUNNEL_TOKEN|API_TOKEN/);
});
