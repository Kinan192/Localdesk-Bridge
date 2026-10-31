import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CloudflareCredentialVault, type KeyringFactory,
} from "../../src/server/credentials/index.ts";
import { CloudflareCredentialActions } from "../../src/server/credentials/actions.ts";

const accountId = "0123456789abcdef0123456789abcdef";
const otherId = "ffffffffffffffffffffffffffffffff";
const tokenA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const tokenB = "ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghi012345";
const request = { accountId, token: tokenA, confirmed: true };

function fixture(options: { account?: string; active?: boolean; fail?: boolean } = {}) {
  const stored = new Map<string, string>();
  const factory: KeyringFactory = (service, account) => ({
    setPassword(value) { stored.set(service + ":" + account, value); },
    getPassword() {
      const result = stored.get(service + ":" + account);
      if (!result) throw new Error("missing " + tokenA);
      return result;
    },
    deletePassword() { if (!stored.delete(service + ":" + account)) throw new Error("missing"); },
  });
  let calls = 0;
  const verifier = async (input: unknown) => {
    calls++;
    if (options.fail) throw new Error("upstream leaked " + tokenA);
    assert.deepEqual(input, { token: (input as { token: string }).token });
    return {
      verified: true as const,
      tokenStatus: "active" as const,
      expiresAt: null,
      zones: [{ id: otherId, name: "example.com", status: options.active === false ? "pending" : "active",
        accountId: options.account ?? accountId, accountName: "Sandbox" }],
      truncated: false,
      credentialStored: false as const,
      canProvision: false as const,
      note: "Read-only verification",
    };
  };
  return {
    actions: new CloudflareCredentialActions(new CloudflareCredentialVault(factory), verifier),
    stored, get calls() { return calls; },
  };
}

test("P1D-B explicit owner workflow saves, rotates and revokes verified Cloudflare credentials without returning token", async () => {
  const f = fixture();
  const saved = await f.actions.save(request);
  assert.equal(saved.stored, true);
  assert.equal(saved.canProvision, false);
  assert.equal(saved.verifiedZoneCount, 1);
  assert.equal(saved.credential.accountId, accountId);
  assert.equal(JSON.stringify(saved).includes(tokenA), false);
  assert.equal(f.stored.size, 1);

  const rotated = await f.actions.rotate({ ...request, token: tokenB });
  assert.equal(rotated.rotated, true);
  assert.equal(rotated.canProvision, false);
  assert.equal(JSON.stringify(rotated).includes(tokenB), false);
  assert.equal([...f.stored.values()][0], tokenB);

  const revoked = f.actions.revoke({ accountId, confirmed: true });
  assert.equal(revoked.revoked, true);
  assert.equal(revoked.canProvision, false);
  assert.equal(f.stored.size, 0);
  assert.equal(f.calls, 2);
});

test("P1D-B consent, valid account and verified zone are required before storing", async () => {
  const f = fixture();
  for (const bad of [
    { ...request, confirmed: false },
    { accountId, token: tokenA },
    { ...request, confirmed: "true" },
    { ...request, accountId: "not-an-id" },
    { ...request, extra: "unknown" },
    { ...request, token: tokenA + "!" },
    { ...request, token: "invalid" },
  ]) {
    await assert.rejects(() => f.actions.save(bad));
  }
  assert.equal(f.calls, 0);
  assert.equal(f.stored.size, 0);
  await assert.rejects(() => fixture({ account: otherId }).actions.save(request), /verification failed/i);
  await assert.rejects(() => fixture({ active: false }).actions.save(request), /verification failed/i);
});

test("P1D-B Cloudflare failures are sanitized and do not persist tokens", async () => {
  const f = fixture({ fail: true });
  await assert.rejects(() => f.actions.save(request), error => {
    assert.equal(String(error).includes(tokenA), false);
    assert.match(String(error), /Cloudflare verification failed/);
    return true;
  });
  assert.equal(f.stored.size, 0);
});

test("P1D-B rotation cannot implicitly create absent credential or revoke without approval", async () => {
  const f = fixture();
  await assert.rejects(() => f.actions.rotate({ ...request, token: tokenB }), /Could not rotate/);
  assert.equal(f.stored.size, 0);
  assert.throws(() => f.actions.revoke({ accountId, confirmed: false }), /Invalid revoke/);
  assert.throws(() => f.actions.revoke({ accountId, confirmed: true, extra: tokenA }), /Invalid revoke/);
  assert.equal(f.stored.size, 0);
});

test("P1D-B vault HTTP route requires owner authorization and has no secret-reading GET", async () => {
  const file = path.resolve("src/app/api/local/cloudflare/credentials/route.ts");
  const source = await fs.readFile(file, "utf8");
  assert.match(source, /await ensureOwnerRequest\(request, true\)/);
  for (const method of ["POST", "PUT", "DELETE"]) {
    assert.match(source, new RegExp("export async function " + method + "\\(request: NextRequest\\)"));
  }
  assert.doesNotMatch(source, /export async function GET/);
  assert.match(source, /readJsonSmall\(request\)/);
  assert.doesNotMatch(source, /respond\(\{.*token/);
});

test("P1D-B native addon stays external to Turbopack server chunks", async () => {
  const config = await fs.readFile(path.resolve("next.config.ts"), "utf8");
  assert.match(config, /serverExternalPackages:\s*\[\s*["']@napi-rs\/keyring["']\s*\]/);
});
