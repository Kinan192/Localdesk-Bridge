import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("P1D-B credential vault UI is pairing-first and never reads back secret bytes", async () => {
  const source = await fs.readFile(path.resolve("src/app/credential-vault/page.js"), "utf8");
  assert.match(source, /"use client"/);
  assert.match(source, /\/api\/local\/owner/);
  assert.match(source, /Formulir Vault terkunci/);
  assert.match(source, /const base = "\/api\/local\/cloudflare"/);
  assert.match(source, /base \+ "\/verify"/);
  assert.match(source, /base \+ "\/credentials"/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /"X-Local-MCP-Action"/);
  assert.match(source, /confirmed: true/);
  assert.match(source, /"POST"/);
  assert.match(source, /"PUT"/);
  assert.match(source, /"DELETE"/);
  assert.doesNotMatch(source, /(?:window\.)?(?:localStorage|sessionStorage)\.(?:getItem|setItem)|console\.(?:log|error)/);
  assert.doesNotMatch(source, /\?token=|URLSearchParams\(/);
});

test("P1D-B credential UI requires explicit approval and resets in-memory token after save", async () => {
  const source = await fs.readFile(path.resolve("src/app/credential-vault/page.js"), "utf8");
  assert.match(source, /approved && validAccount && token\.length/);
  assert.match(source, /setApproved\(false\)/);
  assert.match(source, /setToken\(""\)/);
  assert.match(source, /setRevokeId\(accountId\)/);
  assert.match(source, /setRevokeApproved\(false\)/);
  assert.match(source, /revokeApproved/);
  assert.match(source, /accountIdPattern\.test\(revokeId\)/);
  assert.match(source, /setSetupAccountId\(accountId\)/);
  assert.match(source, /base \+ "\/preflight\/saved"/);
  assert.match(source, /credentialSource !== "os-keychain"/);
  assert.match(source, /Cek hostname & simpan konfigurasi \(read-only\)/);
});

test("AI Connections links to the standalone owner-protected Credential Vault", async () => {
  const source = await fs.readFile(path.resolve("src/features/connections/connections-page.tsx"), "utf8");
  assert.match(source, /href="\/credential-vault"/);
  assert.match(source, /<RemoteServicePanel\s*\/>/);
});
