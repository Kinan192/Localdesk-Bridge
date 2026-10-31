import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CloudflareSettingsRepository, resolveCloudflareConfig, validateCloudflareForm,
} from "../../src/server/cloudflare/index.ts";

const form = {
  teamDomain: "EXAMPLE.cloudflareaccess.com",
  applicationAudience: "1234567890abcdef1234567890abcdef",
  publicHostname: "MCP.example.com",
  port: 8401,
};

test("Cloudflare settings persist non-secret identifiers and recover after restart", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-cf-settings-"));
  try {
    const storage = new CloudflareSettingsRepository(folder);
    assert.equal(await storage.load(), null);
    const saved = await storage.save(form);
    assert.equal(saved.teamDomain, "example.cloudflareaccess.com");
    assert.equal(saved.publicHostname, "mcp.example.com");
    assert.equal(saved.port, 8401);
    assert.deepEqual(await new CloudflareSettingsRepository(folder).load(), saved);
    const text = await fs.readFile(path.join(folder, "cloudflare.json"), "utf8");
    assert.ok(text.includes('"version": 1'));
    assert.equal(text.includes("apiKey"), false);
    assert.equal(text.includes("tunnelToken"), false);
    if (process.platform !== "win32") {
      assert.equal((await fs.stat(path.join(folder, "cloudflare.json"))).mode & 0o077, 0);
    }
    await storage.clear();
    assert.equal(await storage.load(), null);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("Cloudflare config rejects injected secrets, invalid hostnames and invalid ports", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-cf-invalid-"));
  try {
    const storage = new CloudflareSettingsRepository(folder);
    await storage.save(form);
    for (const bad of [
      { ...form, tunnelToken: "do-not-store" },
      { ...form, apiKey: "do-not-store" },
      { ...form, applicationAudience: "" },
      { ...form, publicHostname: "http://mcp.example.com" },
      { ...form, teamDomain: "localhost" },
      { ...form, port: 3100 },
      { ...form, port: 999999 },
    ]) {
      await assert.rejects(() => storage.save(bad));
      assert.equal((await storage.load())?.publicHostname, "mcp.example.com");
    }
    assert.throws(() => validateCloudflareForm({ ...form, credentials: {} }));
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("MCP startup uses saved config, allows explicit env overrides and fails closed if absent", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-cf-effective-"));
  try {
    const storage = new CloudflareSettingsRepository(folder);
    await assert.rejects(() => resolveCloudflareConfig({}, storage), /CF_ACCESS_TEAM_DOMAIN/);
    await storage.save(form);
    const config = await resolveCloudflareConfig({}, storage);
    assert.equal(config.publicHostname, "mcp.example.com");
    const override = await resolveCloudflareConfig({ MCP_PUBLIC_HOSTNAME: "other.example.com" }, storage);
    assert.equal(override.publicHostname, "other.example.com");
    await assert.rejects(() => resolveCloudflareConfig({ CF_ACCESS_AUD: "" }, storage), /CF_ACCESS_AUD/);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("Cloudflare settings reject symlinks and malformed state", async () => {
  if (process.platform === "win32") return;
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-cf-symlink-"));
  try {
    const target = path.join(folder, "external.json");
    await fs.writeFile(target, JSON.stringify({ version: 1, ...form }));
    await fs.symlink(target, path.join(folder, "cloudflare.json"));
    const repo = new CloudflareSettingsRepository(folder);
    await assert.rejects(() => repo.load());
    await assert.rejects(() => repo.save(form));
    await assert.rejects(() => repo.clear());
    await fs.unlink(path.join(folder, "cloudflare.json"));
    await fs.writeFile(path.join(folder, "cloudflare.json"), "bad json");
    await assert.rejects(() => repo.load());
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
