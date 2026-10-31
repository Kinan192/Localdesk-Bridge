import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Setup Center links all active first-run steps and shows honest service statuses", async () => {
  const source = await fs.readFile("src/app/setup-center/page.js", "utf8");
  const steps = await fs.readFile("src/features/setup-center/steps.js", "utf8");
  assert.match(source, /import \{ setupSteps \}/);
  assert.match(source, /<CredentialVaultPanel credentialInfo=\{data\?\.credentials\}/);
  assert.match(steps, /id: "credentials".*href: null/);
  for (const page of ["/cloudflare-setup", "/cloudflare-config", "/oauth-settings"]) {
    assert.ok(steps.includes(page), "Missing step: " + page);
  }
  for (const api of ["/api/local/owner", "/api/local/policy", "/api/local/cloudflare/deployment",
      "/api/local/service", "/api/local/tunnel", "/api/local/status",
      "/api/local/cloudflare/setup-draft", "/api/local/onboarding"]) {
    assert.ok(source.includes(api), "Missing status API " + api);
  }
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /"X-Local-MCP-Action"/);
  assert.match(source, /owner\.paired !== true/);
  assert.match(source, /system\?\.cloudflaredPresent/);
  assert.match(source, /system\?\.dependenciesReady/);
  assert.match(steps, /Pemeriksaan sistem/);
  assert.match(source, /list_roots/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /(?:sk-|ghp_)[A-Za-z0-9]{20,}/);
});

test("Setup pages use shared navigation instead of disconnected back links", async () => {
  const names = ["setup-center", "cloudflare-setup", "cloudflare-config",
    "credential-vault", "oauth-settings", "tunnel-control"];
  for (const name of names) {
    const src = await fs.readFile("src/app/" + name + "/page.js", "utf8");
    assert.match(src, /SetupNavigation/, name);
    assert.ok(src.includes('current="/' + name + '"'));
  }
  const nav = await fs.readFile("src/components/setup-navigation.js", "utf8");
  for (const name of names) assert.ok(nav.includes('"/' + name + '"'));
  assert.match(nav, /aria-label="Navigasi konfigurasi"/);
  assert.match(nav, /aria-current=/);
});



test("Setup Center guides users in-place and never enables duplicate managed processes", async () => {
  const source = await fs.readFile("src/app/setup-center/page.js", "utf8");
  assert.match(source, /activeStep/);
  assert.match(source, /setActiveStep/);
  assert.match(source, /Langkah konfigurasi/);
  assert.match(source, /step\.guide|steps\[activeStep\]\.guide/);
  assert.match(source, /mcpConfigured/);
  assert.match(source, /mcpManaged/);
  assert.match(source, /tunnelManaged/);
  assert.match(source, /disabled=\{busy \|\| mcp \|\| !mcpConfigured\}/);
  assert.match(source, /disabled=\{busy \|\| !mcpManaged\}/);
  assert.match(source, /disabled=\{busy \|\| !mcp \|\| tunnel\}/);
  assert.match(source, /disabled=\{busy \|\| !tunnelManaged\}/);
  assert.match(source, /Konektor belum diverifikasi/);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /cloudflared untuk Tunnel ini belum dijalankan manual/);
  assert.doesNotMatch(source, /getRandomValues\(|Math\.random\(/);
});

test("Production demo fixtures cannot imply fake file permissions or activity", async () => {
  const src = await fs.readFile("src/lib/demo.ts", "utf8");
  assert.match(src, /sampleRoots: FolderRoot\[\] = \[\];/);
  assert.match(src, /sampleEvents: EventEntry\[\] = \[\];/);
});
