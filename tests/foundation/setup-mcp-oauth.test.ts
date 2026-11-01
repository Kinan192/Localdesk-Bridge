import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function sources() {
  const files = {
    wizard: "src/app/setup-center/page.js",
    steps: "src/features/setup-center/steps.js",
    mcp: "src/features/setup-center/mcp-settings-panel.js",
    oauth: "src/features/setup-center/oauth-callbacks-panel.js",
    mcpLegacy: "src/app/cloudflare-config/page.js",
    oauthLegacy: "src/app/oauth-settings/page.js",
    mcpRoute: "src/app/api/local/cloudflare/route.ts",
    previewRoute: "src/app/api/local/cloudflare/import-preview/route.ts",
    oauthRoute: "src/app/api/local/cloudflare/oauth-redirects/route.ts",
  };
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) =>
    [key, await fs.readFile(file, "utf8")]))) as Record<keyof typeof files, string>;
}

test("M2.5 MCP and OAuth settings render directly in wizard with shared compatibility pages", async () => {
  const { wizard, steps, mcpLegacy, oauthLegacy, mcp, oauth } = await sources();
  assert.match(wizard, /activeStep === 4/);
  assert.match(wizard, /<MCPSettingsPanel embedded onNavigateStep=\{selectStep\}/);
  assert.match(wizard, /activeStep === 5/);
  assert.match(wizard, /<OAuthCallbacksPanel embedded onChanged=\{\(\) => refresh\(\)\}/);
  assert.match(steps, /id: "mcp".*href: null/);
  assert.match(steps, /id: "oauth".*href: null/);
  assert.match(mcp, /export function MCPSettingsPanel\(\{ embedded = false, onNavigateStep = null, onConfigured = null \}\)/);
  assert.match(oauth, /export function OAuthCallbacksPanel\(\{ embedded = false, onChanged = null \}\)/);
  assert.match(mcpLegacy, /<SetupNavigation current="\/cloudflare-config"/);
  assert.match(mcpLegacy, /<MCPSettingsPanel \/>/);
  assert.match(oauthLegacy, /<SetupNavigation current="\/oauth-settings"/);
  assert.match(oauthLegacy, /<OAuthCallbacksPanel \/>/);
  assert.doesNotMatch(mcpLegacy, /fetch\(/);
  assert.doesNotMatch(oauthLegacy, /fetch\(/);
});

test("M2.5 MCP import does not overwrite existing settings or create Cloudflare resources", async () => {
  const { mcp, mcpRoute, previewRoute } = await sources();
  assert.match(mcp, /read\("\/api\/local\/owner"\)/);
  assert.match(mcp, /read\("\/api\/local\/cloudflare"\)/);
  assert.match(mcp, /read\("\/api\/local\/cloudflare\/import-preview"\)/);
  assert.match(mcp, /if \(existing\.configured && current\)/);
  assert.match(mcp, /Tidak akan ditimpa otomatis/);
  assert.match(mcp, /method: "PUT", credentials: "same-origin", cache: "no-store"/);
  assert.match(mcp, /headers: ownerHeaders/);
  assert.match(mcp, /if \(onConfigured\) void onConfigured\(\)/);
  assert.match(mcp, /onNavigateStep\(6\)/);
  assert.match(mcpRoute, /ensureOwnerRequest\(request, true\)/);
  assert.match(previewRoute, /ensureOwnerRequest\(request\)/);
  assert.doesNotMatch(previewRoute, /export async function POST/);
  assert.doesNotMatch(mcp, /localStorage|sessionStorage|console\.(?:log|error)/);
  // Read-only GET of deployment metadata is allowed as a fail-closed import
  // fallback. What must be prohibited here is writing Cloudflare resources.
  assert.match(mcp, /read\("\/api\/local\/cloudflare\/deployment"\)\.catch\(\(\) => null\)/);
  assert.match(mcp, /const response = await fetch\(url, \{ credentials: "same-origin", cache: "no-store" \}\)/);
  assert.doesNotMatch(mcp, /fetch\(["']\/api\/local\/cloudflare\/(?:deployment|dns-finalize)/);
  assert.doesNotMatch(mcp, /method: "(?:POST|PATCH|DELETE)"/);
});

test("M2.5 MCP form remains visible for a paired owner when import preview is unavailable", async () => {
  const { mcp, mcpLegacy, wizard } = await sources();
  assert.match(mcp, /const existing = await read\("\/api\/local\/cloudflare"\)/);
  assert.match(mcp, /const imported = await read\("\/api\/local\/cloudflare\/import-preview"\)\.catch\(\(\) => null\)/);
  assert.match(mcp, /read\("\/api\/local\/cloudflare\/deployment"\)\.catch\(\(\) => null\)/);
  assert.match(mcp, /\["access-ready", "tunnel-ready", "published"\]\.includes\(deployment\.phase\)/);
  assert.match(mcp, /deployment\.accessAudience/);
  assert.match(mcp, /source: "local-deployment-fallback"/);
  assert.match(mcp, /setImportIssue\(/);
  assert.match(mcp, /\{paired === true && \(/);
  assert.doesNotMatch(mcp, /paired === true && \(preview \|\| saved\)/);
  assert.match(mcp, /if \(existing\.configured && current\)/);
  assert.match(mcp, /Tidak akan ditimpa otomatis/);
  assert.match(mcp, /Belum ditemukan deployment Access|Konfigurasi belum tersimpan/);
  assert.match(mcpLegacy, /<MCPSettingsPanel \/>/);
  assert.match(wizard, /<MCPSettingsPanel embedded/);
});

test("M2.5 OAuth callbacks load actual Cloudflare state and save only after distinct consent", async () => {
  const { oauth, oauthRoute } = await sources();
  assert.match(oauth, /fetch\(endpoint, \{ credentials: "same-origin", cache: "no-store" \}\)/);
  assert.match(oauth, /setSnapshot\(data\)/);
  assert.match(oauth, /setUrls\(\[\.\.\.data\.redirectUris\]\)/);
  assert.match(oauth, /const changed = snapshot/);
  assert.match(oauth, /!consent \|\| validation \|\| !changed/);
  assert.match(oauth, /confirmed: true, confirmHostname: snapshot\.hostname/);
  assert.match(oauth, /expectedUris: snapshot\.redirectUris, redirectUris: normalized/);
  assert.match(oauth, /method: "PUT", credentials: "same-origin", cache: "no-store", headers/);
  assert.match(oauth, /setUncertain\(data\.requiresInspection === true\)/);
  assert.match(oauth, /disabled=\{busy \|\| uncertain \|\| !changed \|\| !consent \|\| Boolean\(validation\)\}/);
  assert.match(oauth, /if \(onChanged\) void onChanged\(\)/);
  assert.match(oauthRoute, /ensureOwnerRequest\(request, true\)/);
  assert.match(oauthRoute, /requiresInspection: true/);
  assert.doesNotMatch(oauth, /localStorage|sessionStorage|console\.(?:log|error)/);
  assert.doesNotMatch(oauth, /Access application baru dibuat|cfd_tunnel/);
});

test("M2.5 OAuth validation rejects unsafe or duplicate callbacks", async () => {
  const { oauth } = await sources();
  assert.match(oauth, /new Set\(urls\)\.size !== urls\.length/);
  assert.match(oauth, /uri\.protocol !== "https:"/);
  assert.match(oauth, /uri\.hostname === "localhost"/);
  assert.match(oauth, /uri\.hostname === "127\.0\.0\.1"/);
  assert.match(oauth, /urls\.length >= 8/);
  assert.match(oauth, /Muat ulang dari Cloudflare/);
  assert.match(oauth, /Jangan klik Simpan berulang kali/);
});

test("M2.5 focused and full test runners include configuration UI regressions", async () => {
  const file = JSON.parse(await fs.readFile("package.json", "utf8"));
  assert.match(file.scripts.test, /setup-mcp-oauth\.test\.ts/);
  assert.match(file.scripts["test:setup"], /setup-mcp-oauth\.test\.ts/);
});
