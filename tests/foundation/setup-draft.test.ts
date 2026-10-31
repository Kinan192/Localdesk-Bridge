import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SetupDraftRepository } from "../../src/server/cloudflare/setup-draft.ts";

const accountId = "a".repeat(32);
const input = {
  accountId, domain: "example.com", subdomain: "mcptest",
  allowedEmail: "owner@example.com",
};
const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";

test("nonsecret setup draft survives navigation/reload and never stores token", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-setup-draft-"));
  try {
    const first = new SetupDraftRepository(folder);
    const saved = await first.save(input);
    assert.equal(saved.version, 1);
    assert.equal(saved.accountId, accountId);
    const second = new SetupDraftRepository(folder);
    assert.deepEqual(await second.load(), saved);
    const raw = await fs.readFile(path.join(folder, "cloudflare-setup-draft.json"), "utf8");
    assert.ok(!raw.includes(secret));
    assert.ok(!raw.includes("token"));
    const stat = await fs.stat(path.join(folder, "cloudflare-setup-draft.json"));
    if (process.platform !== "win32") assert.equal(stat.mode & 0o777, 0o600);
    await second.clearForAccount("b".repeat(32));
    assert.deepEqual(await second.load(), saved);
    await second.clearForAccount(accountId);
    assert.equal(await second.load(), null);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("setup draft refuses secret fields, malformed hostnames and unrelated accounts", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-setup-invalid-"));
  const repo = new SetupDraftRepository(folder);
  try {
    await assert.rejects(() => repo.save({ ...input, token: secret }));
    await assert.rejects(() => repo.save({ ...input, domain: "https://example.com" }));
    await assert.rejects(() => repo.save({ ...input, subdomain: "../admin" }));
    await assert.rejects(() => repo.save({ ...input, accountId: "bad" }));
    assert.equal(await repo.load(), null);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("setup draft refuses symlink destinations", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-setup-symlink-"));
  const external = path.join(folder, "outside.json");
  const target = path.join(folder, "cloudflare-setup-draft.json");
  try {
    await fs.writeFile(external, "safe");
    await fs.symlink(external, target);
    const repo = new SetupDraftRepository(folder);
    await assert.rejects(() => repo.load());
    await assert.rejects(() => repo.save(input));
    assert.equal(await fs.readFile(external, "utf8"), "safe");
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("owner-protected local draft GET never returns token and preflight saves only on candidate", async () => {
  const readRoute = await fs.readFile(path.resolve("src/app/api/local/cloudflare/setup-draft/route.ts"), "utf8");
  const preflightRoute = await fs.readFile(path.resolve("src/app/api/local/cloudflare/preflight/saved/route.ts"), "utf8");
  assert.match(readRoute, /await ensureOwnerRequest\(request\)/);
  assert.match(readRoute, /credentialAvailable/);
  assert.doesNotMatch(readRoute, /export async function POST/);
  assert.match(preflightRoute, /await ensureOwnerRequest\(request, true\)/);
  assert.match(preflightRoute, /preflight\.status === "candidate"/);
  assert.match(preflightRoute, /new SetupDraftRepository\(\)\.save/);
  assert.doesNotMatch(preflightRoute, /result\.token/);
});

test("vault and setup UI share only the owner-protected draft; no browser secret persistence", async () => {
  const vault = await fs.readFile(path.resolve("src/app/credential-vault/page.js"), "utf8");
  const setup = await fs.readFile(path.resolve("src/app/cloudflare-setup/page.js"), "utf8");
  assert.match(vault, /\/setup-draft/);
  assert.match(vault, /draftSaved/);
  assert.match(vault, /Lanjut ke Cloudflare Setup/);
  assert.match(vault, /Cek hostname & simpan konfigurasi/);
  assert.match(setup, /\/api\/local\/cloudflare\/setup-draft/);
  assert.match(setup, /setAccountId\(saved\.draft\.accountId\)/);
  assert.match(setup, /setDomain\(saved\.draft\.domain\)/);
  assert.match(setup, /setAllowedEmail\(saved\.draft\.allowedEmail\)/);
  for (const source of [vault, setup]) {
    assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.(?:setItem|getItem)/);
  }
});
