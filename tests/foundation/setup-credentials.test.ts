import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  activeVerifiedAccounts, credentialPayload, revokeCredentialPayload,
  confirmedVaultOutcome, ACCOUNT_ID_RE, CLOUD_TOKEN_RE,
} from "../../src/features/setup-center/credential-flow.ts";

const id = "0123456789abcdef0123456789abcdef";
const other = "ffffffffffffffffffffffffffffffff";
const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789";

function verification() {
  return {
    verified: true, tokenStatus: "active", credentialStored: false, canProvision: false,
    zones: [
      { accountId: id.toUpperCase(), accountName: "Workspace", status: "active" },
      { accountId: id, accountName: "Duplicate", status: "active" },
      { accountId: other, accountName: "Another", status: "active" },
      { accountId: "bad", accountName: "Bad", status: "active" },
      { accountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", accountName: "Pending", status: "pending" },
    ],
  };
}

test("M2.3 verified accounts are strict, active, deduplicated and contain no tokens", () => {
  assert.deepEqual(activeVerifiedAccounts(verification()), [
    { id, name: "Workspace" },
    { id: other, name: "Another" },
  ]);
  for (const change of [
    { verified: false },
    { tokenStatus: "revoked" },
    { credentialStored: true },
    { canProvision: true },
    { zones: null },
  ]) assert.deepEqual(activeVerifiedAccounts({ ...verification(), ...change }), []);
  assert.deepEqual(activeVerifiedAccounts(null), []);
  assert.deepEqual(activeVerifiedAccounts({}), []);
});

test("M2.3 keychain operations require verified account, token and explicit consent", () => {
  assert.equal(ACCOUNT_ID_RE.test(id), true);
  assert.equal(CLOUD_TOKEN_RE.test(token), true);
  assert.deepEqual(credentialPayload(id.toUpperCase(), token, true), {
    accountId: id, token, confirmed: true,
  });
  assert.deepEqual(revokeCredentialPayload(id.toUpperCase(), true), {
    accountId: id, confirmed: true,
  });
  for (const value of ["", "wrong", "a".repeat(33)]) {
    assert.throws(() => credentialPayload(value, token, true));
    assert.throws(() => revokeCredentialPayload(value, true));
  }
  for (const candidate of ["", "short", "invalid secret", "a".repeat(257)]) {
    assert.throws(() => credentialPayload(id, candidate, true));
  }
  assert.throws(() => credentialPayload(id, token, false), /setujui/);
  assert.throws(() => revokeCredentialPayload(id, false), /persetujuan/);
});

test("M2.3 UI confirms only server-matched Keychain result and never assumes Cloudflare provisioning", () => {
  const response = { credential: { kind: "cloudflare-api-token", accountId: id },
    canProvision: false, stored: true, rotated: true, revoked: true };
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    assert.equal(confirmedVaultOutcome(method, response, id), true);
    assert.equal(confirmedVaultOutcome(method, { ...response, canProvision: true }, id), false);
    assert.equal(confirmedVaultOutcome(method, { ...response, credential: { ...response.credential, accountId: other } }, id), false);
    assert.equal(confirmedVaultOutcome(method, { ...response, credential: null }, id), false);
    const statusKey = method === "POST" ? "stored" : method === "PUT" ? "rotated" : "revoked";
    assert.equal(confirmedVaultOutcome(method, { ...response, [statusKey]: false }, id), false);
  }
});

test("M2.3 credential UI lives inline, uses only protected credential routes, never stores token in local storage", async () => {
  const page = await fs.readFile("src/app/setup-center/page.js", "utf8");
  const steps = await fs.readFile("src/features/setup-center/steps.js", "utf8");
  const panel = await fs.readFile("src/features/setup-center/credential-vault-panel.js", "utf8");
  const flow = await fs.readFile("src/features/setup-center/credential-flow.ts", "utf8");
  assert.match(page, /activeStep === 2/);
  assert.match(page, /<CredentialVaultPanel credentialInfo=\{data\?\.credentials\}/);
  assert.match(steps, /id: "credentials".*href: null/);
  assert.match(panel, /"\/api\/local\/cloudflare"/);
  assert.match(panel, /localCredentialAction\("\/verify", "POST", \{ token \}\)/);
  assert.match(panel, /localCredentialAction\("\/credentials", method, payload\)/);
  assert.match(panel, /localCredentialAction\("\/credentials", "DELETE", payload\)/);
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /"X-Local-MCP-Action": "dashboard"/);
  assert.match(panel, /type="password"/);
  assert.match(panel, /autoComplete="off"/);
  assert.match(panel, /confirmedVaultOutcome/);
  assert.match(panel, /setToken\(""/);
  assert.match(panel, /inFlight\.current/);
  assert.match(panel, /window\.confirm\(/);
  assert.match(panel, /status === "unknown"/);
  assert.match(panel, /!draft \? "no-draft"/);
  assert.doesNotMatch(panel + flow, /localStorage|sessionStorage|console\.(?:log|error)|URLSearchParams|\?token=/);
});

test("M2.3 existing APIs enforce owner+CSRF and make no Cloudflare provisioning changes", async () => {
  const api = await fs.readFile("src/app/api/local/cloudflare/credentials/route.ts", "utf8");
  const verify = await fs.readFile("src/app/api/local/cloudflare/verify/route.ts", "utf8");
  const draft = await fs.readFile("src/app/api/local/cloudflare/setup-draft/route.ts", "utf8");
  const service = await fs.readFile("src/server/credentials/actions.ts", "utf8");
  assert.match(api, /ensureOwnerRequest\(request, true\)/);
  assert.match(verify, /ensureOwnerRequest\(request, true\)/);
  assert.match(draft, /ensureOwnerRequest\(request\)/);
  assert.doesNotMatch(api, /export async function GET/);
  assert.match(service, /verifiedAccount/);
  assert.match(service, /this\.vault\.store/);
  assert.match(service, /this\.vault\.rotate/);
  assert.match(service, /this\.vault\.revoke/);
  assert.match(service, /canProvision: false/);
});
