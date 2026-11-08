import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  SETUP_STEP_IDS, STEP_STORAGE_KEY, loadSelectedStep, storeSelectedStep,
} from "../../src/features/setup-center/navigation.ts";
import { setupStepStates, configuredStepCount } from "../../src/features/setup-center/progress.ts";
import { serviceFacts, publicMcpUrl } from "../../src/features/setup-center/service-facts.ts";
import { newReadRoot } from "../../src/features/setup-center/folder-policy.ts";
import { activeVerifiedAccounts } from "../../src/features/setup-center/credential-flow.ts";
import { setupSteps } from "../../src/features/setup-center/steps.js";

const read = (relative: string) => fs.readFile(relative, "utf8");

test("M2.7 all eight steps mount their panels directly, with legacy pages optional", async () => {
  const page = await read("src/app/setup-center/page.js");
  assert.deepEqual(setupSteps.map(step => step.id), [...SETUP_STEP_IDS]);
  assert.equal(SETUP_STEP_IDS.length, 8);
  for (const step of setupSteps) {
    assert.equal(step.href, null, "Internal deep-page navigation should not be required: " + step.id);
    assert.equal(step.label, null);
  }
  const panels = [
    ["0", "SystemCheckPanel"], ["1", "FolderAccessPanel"],
    ["2", "CredentialVaultPanel"], ["3", "CloudflareDeploymentPanel"],
    ["4", "MCPSettingsPanel"], ["5", "OAuthCallbacksPanel"],
    ["6", "ServiceControlPanel"], ["7", "AIClientVerificationPanel"],
  ];
  for (const [index, component] of panels) {
    assert.ok(page.includes("activeStep === " + index), "Missing inline step " + index);
    assert.ok(page.includes("<" + component), "Missing inline component " + component);
  }
  assert.match(page, /nextSelectedStep\(activeStep, -1\)/);
  assert.match(page, /nextSelectedStep\(activeStep, 1\)/);
});

test("M2.7 saved wizard location is a non-authoritative step ID and owner login is required", async () => {
  const page = await read("src/app/setup-center/page.js");
  assert.match(page, /owner\.paired !== true/);
  assert.match(page, /data\?\.paired === true && !stepRestored/);
  assert.match(page, /data\?\.paired === false && stepRestored/);
  assert.match(page, /loadBrowserSelectedStep\(\)/);
  assert.match(page, /storeBrowserSelectedStep\(index\)/);
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  assert.equal(storeSelectedStep(storage, 7), 7);
  assert.deepEqual([...store.entries()], [[STEP_STORAGE_KEY, "clients"]]);
  assert.equal(loadSelectedStep(storage), 7);
  storage.setItem(STEP_STORAGE_KEY, JSON.stringify({ accessToken: "never" }));
  assert.equal(loadSelectedStep(storage), 0);
  assert.equal(store.size, 0);
});

test("M2.7 a configured local deployment never counts ChatGPT/Claude as authenticated", () => {
  const states = setupStepStates({
    systemReady: true, approvedFolders: 1, credentialAvailable: true,
    deploymentPhase: "published", mcpConfigured: true,
    mcpProtected: true, tunnelManagedRunning: true,
  });
  assert.deepEqual(states, [
    "configured", "configured", "configured", "configured",
    "configured", "review", "configured", "verify-in-client",
  ]);
  assert.equal(configuredStepCount(states), 6);
  assert.equal(publicMcpUrl({ phase: "published", hostname: "MCP.Example.com" }),
    "https://mcp.example.com/mcp");
  assert.equal(publicMcpUrl({ phase: "access-ready", hostname: "mcp.example.com" }), null);
});

test("M2.7 missing backend, Cloudflare, Keychain or manual Tunnel is fail closed", () => {
  assert.deepEqual(activeVerifiedAccounts({ verified: false }), []);
  assert.deepEqual(newReadRoot("Work", "/tmp/work"), { label: "Work", absolutePath: "/tmp/work" });
  const unknown = serviceFacts(null, null, null);
  assert.equal(unknown.canStartMcp, false);
  assert.equal(unknown.canStopMcp, false);
  assert.equal(unknown.canStartTunnel, false);
  assert.equal(unknown.canStopTunnel, false);
  const unmanaged = serviceFacts(
    { configReady: true, status: { state: "running", managed: false } },
    { status: { state: "running", managed: false } },
    { remoteHttp: { state: "listening-protected" }, connectedClients: null },
  );
  assert.equal(unmanaged.canStopMcp, false);
  assert.equal(unmanaged.canStopTunnel, false);
  assert.equal(unmanaged.canStartTunnel, false);
  assert.equal(publicMcpUrl({ phase: "published", hostname: "localhost" }), null);
});

test("M2.7 all existing mutation APIs still require owner + CSRF protection", async () => {
  const protectedRoutes = [
    "src/app/api/local/policy/route.ts",
    "src/app/api/local/delete-approvals/route.ts",
    "src/app/api/local/cloudflare/credentials/route.ts",
    "src/app/api/local/cloudflare/deployment/route.ts",
    "src/app/api/local/cloudflare/dns-finalize/route.ts",
    "src/app/api/local/cloudflare/oauth-redirects/route.ts",
    "src/app/api/local/cloudflare/route.ts",
    "src/app/api/local/service/route.ts",
    "src/app/api/local/tunnel/route.ts",
  ];
  for (const filename of protectedRoutes) {
    const src = await read(filename);
    assert.match(src, /ensureOwnerRequest\(request, true\)/,
      "Privileged mutation must authenticate the owner: " + filename);
    assert.doesNotMatch(src, /Access-Control-Allow-Origin:\s*\*/,
      "Privileged mutation must not allow wildcard origins: " + filename);
  }
  const localOnly = await read("src/server/http/local-only.ts");
  assert.match(localOnly, /Origin|origin/);
  assert.match(localOnly, /Host|host/);
});

test("M2.7 inline components do not persist credentials or trigger provider writes on mount", async () => {
  const panels = [
    "src/features/setup-center/system-folder-panels.js",
    "src/features/setup-center/credential-vault-panel.js",
    "src/features/setup-center/cloudflare-deployment-panel.js",
    "src/features/setup-center/mcp-settings-panel.js",
    "src/features/setup-center/oauth-callbacks-panel.js",
    "src/features/setup-center/service-client-panels.js",
  ];
  for (const file of panels) {
    const source = await read(file);
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/,
      "No secrets or provider state in browser persistent storage: " + file);
    assert.doesNotMatch(source, /console\.(log|debug|info)\(/, "No logging of user input: " + file);
  }
  const cloudflare = await read("src/features/setup-center/cloudflare-deployment-panel.js");
  assert.match(cloudflare, /confirmed: true/);
  assert.match(cloudflare, /approved/);
  assert.match(cloudflare, /publishApproved/);
  const oauth = await read("src/features/setup-center/oauth-callbacks-panel.js");
  assert.match(oauth, /expectedUris: snapshot\.redirectUris/);
  assert.match(oauth, /!consent/);
  const creds = await read("src/features/setup-center/credential-vault-panel.js");
  assert.match(creds, /type="password"/);
  assert.match(creds, /setToken\(""/);
});

test("M2.7 all previous routes remain accessible as non-destructive compatibility UI", async () => {
  const wrappers = [
    ["credential-vault", "Credential"],
    ["cloudflare-setup", "CloudflareDeploymentPanel"],
    ["cloudflare-config", "MCPSettingsPanel"],
    ["oauth-settings", "OAuthCallbacksPanel"],
    ["tunnel-control", "Tunnel"],
  ];
  const navigation = await read("src/components/setup-navigation.js");
  for (const [route, marker] of wrappers) {
    const src = await read("src/app/" + route + "/page.js");
    assert.match(src, /SetupNavigation/, "Lost compatibility route: " + route);
    assert.ok(src.includes(marker), "Missing expected UI: " + route);
    assert.ok(navigation.includes('"/' + route + '"'), "Missing compatibility navigation: " + route);
  }
});

test("M2.7 keyboard/mobile basics remain present; true accessibility needs a live browser audit", async () => {
  const wizard = await read("src/app/setup-center/page.js");
  const folder = await read("src/features/setup-center/system-folder-panels.js");
  const credential = await read("src/features/setup-center/credential-vault-panel.js");
  const oauth = await read("src/features/setup-center/oauth-callbacks-panel.js");
  const nav = await read("src/components/setup-navigation.js");
  assert.match(wizard, /<nav aria-label="Daftar langkah konfigurasi"/);
  assert.match(wizard, /aria-current=\{activeStep === i \? "step"/);
  assert.match(wizard, /grid gap-3/);
  assert.match(nav, /overflow-x-auto/);
  assert.match(folder, /<label htmlFor="setup-root-path"/);
  assert.match(credential, /<label htmlFor="wizard-cloudflare-token"/);
  assert.match(oauth, /type="button"/);
});
