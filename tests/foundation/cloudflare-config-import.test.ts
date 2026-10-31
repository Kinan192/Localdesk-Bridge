import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { previewRemoteConfigFromDeployment } from "../../src/server/cloudflare/config-import.ts";
import type { CloudflareRequester } from "../../src/server/cloudflare/provisioning-api.ts";
import type { DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";

const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const accountId = "a".repeat(32);
const state: DeploymentRecord = {
  version: 1, accountId, zoneId: "b".repeat(32),
  domain: "example.com", hostname: "mcp.example.com",
  allowedEmail: "owner@example.com", redirectUris: ["https://example.com/callback"],
  phase: "published", accessAppId: "11111111-1111-4111-8111-111111111111",
  aud: "audience_tag_0123456789", tunnelId: "22222222-2222-4222-8222-222222222222",
  dnsRecordId: "3333333333333333",
};

test("Remote MCP import prefills hostname and AUD plus discovered Cloudflare team domain, GET-only", async () => {
  const calls: string[] = [];
  const api: CloudflareRequester = async (method, url, received) => {
    calls.push(method + " " + url);
    assert.equal(method, "GET");
    assert.equal(received, token);
    assert.equal(url, "/accounts/" + accountId + "/access/organizations");
    return { auth_domain: "MYTEAM.cloudflareaccess.com" };
  };
  const result = await previewRemoteConfigFromDeployment(
    { async load() { return structuredClone(state); } },
    { read(ref) { assert.equal(ref.accountId, accountId); return token; } }, api,
  );
  assert.equal(result?.publicHostname, "mcp.example.com");
  assert.equal(result?.applicationAudience, state.aud);
  assert.equal(result?.teamDomain, "myteam.cloudflareaccess.com");
  assert.equal(result?.teamDomainNeedsEntry, false);
  assert.equal(result?.port, 8401);
  assert.deepEqual(calls, ["GET /accounts/" + accountId + "/access/organizations"]);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("Missing optional Organization Read still autofills known hostname and AUD", async () => {
  const api: CloudflareRequester = async () => { throw new Error("Cloudflare HTTP 403"); };
  const result = await previewRemoteConfigFromDeployment(
    { async load() { return state; } }, { read() { return token; } }, api,
  );
  assert.equal(result?.publicHostname, "mcp.example.com");
  assert.equal(result?.applicationAudience, state.aud);
  assert.equal(result?.teamDomain, null);
  assert.equal(result?.teamDomainNeedsEntry, true);
  assert.equal(result?.source, "cloudflare-deployment");
});

test("No deployment / unverified Access provides no prefill", async () => {
  let count = 0;
  const api: CloudflareRequester = async () => { count++; return {}; };
  const vault = { read() { count++; return token; } };
  assert.equal(await previewRemoteConfigFromDeployment(
    { async load() { return null; } }, vault, api,
  ), null);
  assert.equal(await previewRemoteConfigFromDeployment(
    { async load() { return { ...state, phase: "preparing", aud: null }; } }, vault, api,
  ), null);
  assert.equal(count, 0);
});

test("Invalid Cloudflare organization response cannot smuggle Team Domain", async () => {
  const api: CloudflareRequester = async () => ({
    auth_domain: "https://evil.example.com/cloudflareaccess.com",
  });
  const result = await previewRemoteConfigFromDeployment(
    { async load() { return state; } }, { read() { return token; } }, api,
  );
  assert.equal(result?.teamDomain, null);
});

test("Import route and UI require owner and never accept token through browser", async () => {
  const route = await fs.readFile(path.resolve("src/app/api/local/cloudflare/import-preview/route.ts"), "utf8");
  const page = await fs.readFile(path.resolve("src/app/cloudflare-config/page.js"), "utf8");
  const setup = await fs.readFile(path.resolve("src/app/cloudflare-setup/page.js"), "utf8");
  assert.match(route, /ensureOwnerRequest\(request\)/);
  assert.match(route, /previewRemoteConfigFromDeployment\(\)/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(page, /\/api\/local\/cloudflare\/import-preview/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /Simpan konfigurasi MCP/);
  assert.match(setup, /href="\/cloudflare-config"/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});
