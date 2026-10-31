import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cloudflareRequest, CloudflareApiError, ProvisioningError } from "../../src/server/cloudflare/provisioning-api.ts";
import { DeploymentRepository, type DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";

const account = "a".repeat(32);
const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";

test("Cloudflare write transport uses only official host, bounded JSON, no redirects and bearer token", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify({ success: true, result: { id: "created" } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const api = cloudflareRequest(fake);
  const result = await api("POST", "/accounts/" + account + "/access/apps", token, { name: "new-app" });
  assert.deepEqual(result, { id: "created" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/" + account + "/access/apps");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer " + token);
  assert.equal(calls[0].init.body, JSON.stringify({ name: "new-app" }));
  await assert.rejects(() => api("POST", "/accounts/" + account + "/../bad", token, {}), ProvisioningError);
  await assert.rejects(() => api("GET", "//evil.test", token), ProvisioningError);
});

test("Cloudflare transport discards response/body/provider errors and never leaks credential", async () => {
  const fake = (async () => new Response(JSON.stringify({
    success: false, errors: [{ message: "provider secret " + token }],
  }), { status: 403 })) as typeof fetch;
  const api = cloudflareRequest(fake);
  await assert.rejects(() => api("POST", "/accounts/" + account + "/access/apps", token, {}), error => {
    assert.ok(error instanceof ProvisioningError);
    assert.equal(String(error).includes(token), false);
    return true;
  });
});

test("Cloudflare HTTP status is available without exposing provider body or token", async () => {
  const fake = (async () => new Response(JSON.stringify({
    success: false, errors: [{ code: 10000, message: "secret " + token }],
  }), { status: 403 })) as typeof fetch;
  const api = cloudflareRequest(fake);
  await assert.rejects(() => api("POST", "/accounts/" + account + "/cfd_tunnel", token, {}),
    (error: unknown) => {
      assert.ok(error instanceof CloudflareApiError);
      assert.equal(error.httpStatus, 403);
      assert.equal(error.message.includes(token), false);
      return true;
    });
});

test("deployment metadata stores identifiers only and refuses extra secret fields", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-deploy-"));
  const repo = new DeploymentRepository(folder);
  const state: DeploymentRecord = {
    version: 1, accountId: account, zoneId: "b".repeat(32),
    hostname: "mcp.example.com", domain: "example.com", allowedEmail: "owner@example.com",
    redirectUris: ["https://client.example.org/callback"],
    phase: "access-ready", accessAppId: "11111111-1111-4111-8111-111111111111",
    aud: "audience_tag_01234567", tunnelId: null, dnsRecordId: null,
  };
  try {
    assert.equal(await repo.load(), null);
    await repo.save(state);
    assert.deepEqual(await repo.load(), state);
    const raw = await fs.readFile(path.join(folder, "cloudflare-deployment.json"), "utf8");
    assert.ok(!raw.includes(token));
    await assert.rejects(() => repo.save({ ...state, token } as DeploymentRecord));
    assert.deepEqual(await repo.load(), state);
    assert.equal(await repo.lockStatus(), "clear");
    const value = await repo.exclusive(async () => {
      assert.equal(await repo.lockStatus(), "held");
      return "success";
    });
    assert.equal(value, "success");
    assert.equal(await repo.lockStatus(), "clear");
    await assert.rejects(() => repo.exclusive(async () => {
      throw new Error("uncertain write");
    }), /uncertain write/);
    await assert.rejects(() => repo.exclusive(async () => "retry"), /locked/);
    assert.equal(await repo.lockStatus(), "held");
  } finally { await fs.rm(folder, { force: true, recursive: true }); }
});

test("deployment metadata safe lock is released if no intent or resource was saved", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-deploy-empty-"));
  const repo = new DeploymentRepository(folder);
  try {
    await assert.rejects(() => repo.exclusive(async () => {
      throw new Error("validation");
    }), /validation/);
    assert.equal(await repo.exclusive(async () => "safe"), "safe");
  } finally { await fs.rm(folder, { force: true, recursive: true }); }
});

test("Cloudflare Setup UI requires owner and separate explicit approval for Access and DNS", async () => {
  const source = await fs.readFile(path.resolve("src/app/cloudflare-setup/page.js"), "utf8");
  assert.match(source, /\/api\/local\/owner/);
  assert.match(source, /\/api\/local\/cloudflare\/deployment/);
  assert.match(source, /"prepare"/);
  assert.match(source, /"publish"/);
  assert.match(source, /publishApproved/);
  assert.match(source, /"Cek kesiapan \(read-only\)"/);
  assert.match(source, /action: "check"/);
  assert.match(source, /!readiness/);
  assert.match(source, /readinessIssue/);
  assert.match(source, /Buka Credential Vault untuk ganti token/);
  assert.match(source, /Access: Apps and Policies/);
  assert.match(source, /disabled=\{busy \|\| !publishSafetyChecked \|\| record\?\.phase !== "access-ready"\}/);
  assert.match(source, /Periksa status Cloudflare \(read-only\)/);
  assert.match(source, /diagnostics\.lock/);
  assert.doesNotMatch(source, /writesEnabled|LOCAL_MCP_ENABLE_CLOUDFLARE_WRITES/);
  assert.match(source, /confirmed: true/);
  assert.match(source, /confirmHostname: hostname/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.log/);
});
