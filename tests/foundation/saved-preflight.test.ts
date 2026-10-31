import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CloudflareCredentialVault, type KeyringFactory } from "../../src/server/credentials/index.ts";
import { SavedCloudflarePreflight } from "../../src/server/cloudflare/saved-preflight.ts";
import { preflightCloudflareHostname } from "../../src/server/cloudflare/preflight.ts";

const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const accountId = "a".repeat(32);
const zoneId = "b".repeat(32);
const input = { accountId, domain: "example.com", subdomain: "mcp", allowedEmail: "owner@example.com" };

function fixture(options: { occupied?: boolean; foreignAccount?: boolean; fail?: boolean; save?: boolean } = {}) {
  const saved = new Map<string, string>();
  const factory: KeyringFactory = (service, account) => ({
    setPassword(value: string) { saved.set(service + ":" + account, value); },
    getPassword() {
      const value = saved.get(service + ":" + account);
      if (!value) throw new Error("Missing secret " + token);
      return value;
    },
    deletePassword() { saved.delete(service + ":" + account); },
  });
  const vault = new CloudflareCredentialVault(factory);
  if (options.save !== false) vault.store({ kind: "cloudflare-api-token", accountId }, token);
  const calls: { method: string | undefined; url: string }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const uri = String(url);
    calls.push({ method: init?.method, url: uri });
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer " + token);
    assert.equal(new URL(uri).origin, "https://api.cloudflare.com");
    if (options.fail) throw new Error("Sensitive provider details " + token);
    const body = uri.endsWith("/user/tokens/verify")
      ? { success: true, result: { status: "active" } }
      : uri.includes("/zones?")
        ? { success: true, result: [{
          id: zoneId, name: "example.com", status: "active",
          account: { id: options.foreignAccount ? "c".repeat(32) : accountId, name: "Test account" },
        }], result_info: { total_pages: 1 } }
        : uri.includes("/dns_records?")
          ? { success: true, result: options.occupied
            ? [{ id: "dns-record", name: "mcp.example.com", type: "CNAME" }] : [],
              result_info: { total_pages: 1 } }
          : (() => { throw new Error("Unexpected endpoint"); })();
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const preflight = new SavedCloudflarePreflight(vault, (request) =>
    preflightCloudflareHostname(request, fetcher));
  return { preflight, calls, saved };
}

test("saved-token preflight uses OS keyring without browser token or Cloudflare writes", async () => {
  const f = fixture();
  const data = await f.preflight.check(input);
  assert.equal(data.preflight.status, "candidate");
  assert.equal(data.preflight.accountId, accountId);
  assert.equal(data.preflight.hostname, "mcp.example.com");
  assert.equal(data.credentialSource, "os-keychain");
  assert.equal(data.credentialStored, true);
  assert.equal(data.canProvision, false);
  assert.equal(data.preflight.accessPolicyChecked, false);
  assert.equal(data.preflight.tunnelChecked, false);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(call => call.method === "GET"));
  assert.equal(JSON.stringify(data).includes(token), false);
  assert.equal(f.saved.size, 1);
});

test("saved-token preflight catches hostname collisions without changing credentials", async () => {
  const f = fixture({ occupied: true });
  const data = await f.preflight.check(input);
  assert.equal(data.preflight.status, "blocked");
  assert.equal(data.canProvision, false);
  assert.equal(f.saved.size, 1);
});

test("saved-token preflight fails closed for absent vault entry, wrong account or bad fields", async () => {
  const missing = fixture({ save: false });
  await assert.rejects(() => missing.preflight.check(input), /No accessible Cloudflare token/);
  assert.equal(missing.calls.length, 0);
  const different = fixture({ foreignAccount: true });
  await assert.rejects(() => different.preflight.check(input), /preflight failed/);
  for (const bad of [
    { ...input, accountId: "abc" },
    { ...input, accountId: "c".repeat(32) },
    { ...input, token },
    { ...input, domain: "http://example.com" },
    { ...input, subdomain: "../../admin" },
  ]) {
    await assert.rejects(() => fixture().preflight.check(bad));
  }
});

test("saved-token preflight sanitizes provider errors including credential bytes", async () => {
  const f = fixture({ fail: true });
  await assert.rejects(() => f.preflight.check(input), (error: unknown) => {
    assert.equal(String(error).includes(token), false);
    return true;
  });
});

test("saved-token preflight route enforces owner auth, CSRF and never exposes a GET", async () => {
  const source = await fs.readFile(path.resolve("src/app/api/local/cloudflare/preflight/saved/route.ts"), "utf8");
  assert.match(source, /await ensureOwnerRequest\(request, true\)/);
  assert.match(source, /new SavedCloudflarePreflight\(\)\.check\(body\)/);
  assert.doesNotMatch(source, /export async function GET/);
  assert.doesNotMatch(source, /respond\(\{[^}]*token/);
});
