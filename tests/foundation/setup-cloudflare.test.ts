import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function sources() {
  const [wizard, steps, shared, legacy, deployment, dns, packageJson] = await Promise.all([
    fs.readFile("src/app/setup-center/page.js", "utf8"),
    fs.readFile("src/features/setup-center/steps.js", "utf8"),
    fs.readFile("src/features/setup-center/cloudflare-deployment-panel.js", "utf8"),
    fs.readFile("src/app/cloudflare-setup/page.js", "utf8"),
    fs.readFile("src/app/api/local/cloudflare/deployment/route.ts", "utf8"),
    fs.readFile("src/app/api/local/cloudflare/dns-finalize/route.ts", "utf8"),
    fs.readFile("package.json", "utf8"),
  ]);
  return { wizard, steps, shared, legacy, deployment, dns, packageJson: JSON.parse(packageJson) };
}

test("M2.4 Cloudflare setup is inline and the legacy page shares the same implementation", async () => {
  const { wizard, steps, shared, legacy } = await sources();
  assert.match(wizard, /activeStep === 3/);
  assert.match(wizard, /<CloudflareDeploymentPanel embedded onNavigateStep=\{selectStep\}/);
  assert.match(wizard, /onDeploymentChange=\{\(\) => refresh\(\)\}/);
  assert.match(steps, /id: "cloudflare".*href: null/);
  assert.match(shared, /export function CloudflareDeploymentPanel\(\{ embedded = false, onNavigateStep = null, onDeploymentChange = null \}\)/);
  assert.match(shared, /embedded \? "min-w-0 space-y-4 text-slate-100"/);
  assert.match(legacy, /import \{ CloudflareDeploymentPanel \}/);
  assert.match(legacy, /<SetupNavigation current="\/cloudflare-setup" \/>/);
  assert.match(legacy, /<CloudflareDeploymentPanel \/>/);
  assert.doesNotMatch(legacy, /function checkReadiness|function apply\(/);
  assert.equal((wizard.match(/<CloudflareDeploymentPanel embedded/g) || []).length, 1);
});

test("M2.4 backend authorizes Cloudflare actions and frontend requires separate consent", async () => {
  const { shared, deployment, dns } = await sources();
  assert.match(deployment, /ensureOwnerRequest\(request, true\)/);
  assert.match(dns, /ensureOwnerRequest\(request, true\)/);
  assert.match(shared, /credentials: "same-origin"/);
  assert.match(shared, /"X-Local-MCP-Action": "dashboard"/);
  assert.match(shared, /action: "check"/);
  assert.match(shared, /cloudflareMutated !== false/);
  assert.match(shared, /!approved \|\| !readiness/);
  assert.match(shared, /!publishApproved \|\| !publishSafetyChecked/);
  assert.match(shared, /record\?\.phase !== "not-started"/);
  assert.match(shared, /record\?\.phase !== "access-ready"/);
  assert.match(shared, /!dnsApproved \|\| !dnsReadiness\?\.ready/);
  assert.match(shared, /action: "recover", confirmed: true/);
  assert.match(shared, /recoveryApproved/);
  assert.match(shared, /dnsFailure/);
  assert.match(shared, /dnsLockInfo/);
  assert.match(shared, /Selesaikan Publikasi DNS/);
  assert.match(shared, /Periksa status Cloudflare \(read-only\)/);
  assert.doesNotMatch(shared, /localStorage|sessionStorage|console\.log|LOCAL_MCP_ENABLE_CLOUDFLARE_WRITES/);
});

test("M2.4 embedded setup never forces users to leave wizard for adjacent steps", async () => {
  const { shared } = await sources();
  assert.match(shared, /onNavigateStep\(2\)/);
  assert.match(shared, /onNavigateStep\(4\)/);
  assert.match(shared, /onNavigateStep\(5\)/);
  assert.match(shared, /onNavigateStep\(6\)/);
  assert.match(shared, /onDeploymentChange\(\)/);
  for (const route of ["/credential-vault", "/cloudflare-config", "/oauth-settings", "/tunnel-control"]) {
    assert.ok(shared.includes('href="' + route + '"'), "Legacy link must remain for " + route);
  }
});

test("M2.4 tests include shared UI and remain in the full and focused test runner", async () => {
  const { packageJson, shared } = await sources();
  assert.match(packageJson.scripts.test, /setup-cloudflare\.test\.ts/);
  assert.match(packageJson.scripts["test:setup"], /setup-cloudflare\.test\.ts/);
  assert.match(shared, /ready = paired === true/);
  assert.match(shared, /diagnostics\?\.access === "verified"/);
  assert.match(shared, /diagnostics\?\.tunnel === "absent"/);
  assert.match(shared, /diagnostics\?\.dns === "available"/);
  assert.match(shared, /diagnostics\?\.lock === "clear"/);
  assert.match(shared, /cloudflared atau menghubungkan ChatGPT\/Claude/);
});
