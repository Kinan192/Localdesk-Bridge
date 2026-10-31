import test from "node:test";
import assert from "node:assert/strict";
import { browserOpenCommand, DASHBOARD_ORIGIN, ownerLaunchUrl,
  launcherReadyProof, verifyLauncherReadyProof, managedDashboardExitCode, ownedProcessGroupId, LAUNCH_SECRET_ENV } from "../../src/server/owner/dashboard-launch.ts";

const ticket = "a".repeat(43);
const url = DASHBOARD_ORIGIN + "/#owner-pair=" + ticket;

test("launcher creates only a localhost fragment URL with a valid one-use ticket", () => {
  assert.equal(ownerLaunchUrl(ticket), url);
  assert.equal(new URL(url).pathname, "/");
  assert.equal(new URL(url).search, "");
  assert.equal(new URL(url).hash, "#owner-pair=" + ticket);
});

test("launcher rejects empty, malformed and arbitrary browser destinations", () => {
  assert.throws(() => ownerLaunchUrl("test"));
  assert.throws(() => ownerLaunchUrl("a".repeat(44)));
  assert.throws(() => browserOpenCommand("linux", "https://example.org/"));
  assert.throws(() => browserOpenCommand("linux", "http://127.0.0.1:8401/#owner-pair=" + ticket));
});

test("launcher authenticates only its own localhost child before creating pairing ticket", () => {
  const secret = "s".repeat(43);
  const challenge = "c".repeat(43);
  const proof = launcherReadyProof(secret, challenge);
  assert.match(proof ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyLauncherReadyProof(secret, challenge, proof), true);
  assert.equal(verifyLauncherReadyProof("x".repeat(43), challenge, proof), false);
  assert.equal(verifyLauncherReadyProof(secret, "x".repeat(43), proof), false);
  assert.equal(verifyLauncherReadyProof(secret, challenge, null), false);
  assert.equal(launcherReadyProof(undefined, challenge), null);
  assert.equal(launcherReadyProof(secret, "bad"), null);
  assert.equal(LAUNCH_SECRET_ENV, "LOCAL_MCP_LAUNCH_SECRET");
});

test("launcher reports unexpected termination as failure, and deliberate shutdown as success", () => {
  assert.equal(managedDashboardExitCode(0, false), 0);
  assert.equal(managedDashboardExitCode(2, false), 2);
  assert.equal(managedDashboardExitCode(null, false), 1);
  assert.equal(managedDashboardExitCode(null, true), 0);
});

test("process groups are explicitly scoped to launcher-spawned POSIX children", () => {
  assert.equal(ownedProcessGroupId("linux", 4321), 4321);
  assert.equal(ownedProcessGroupId("darwin", 5678), 5678);
  assert.equal(ownedProcessGroupId("win32", 4321), null);
  assert.equal(ownedProcessGroupId("linux", undefined), null);
  assert.equal(ownedProcessGroupId("linux", 0), null);
  assert.equal(ownedProcessGroupId("linux", -1), null);
  assert.equal(ownedProcessGroupId("linux", 1), null);
});

test("browser startup stays shell-free on Linux, Windows and macOS", () => {
  assert.deepEqual(browserOpenCommand("linux", url), { command: "xdg-open", args: [url] });
  assert.deepEqual(browserOpenCommand("win32", url), { command: "explorer.exe", args: [url] });
  assert.deepEqual(browserOpenCommand("darwin", url), { command: "open", args: [url] });
});

test("user-facing npm start uses auto-pair launcher and preserves development command", async () => {
  const fs = await import("node:fs/promises");
  const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
  assert.match(manifest.scripts.start, /launch-dashboard\.ts/);
  assert.match(manifest.scripts["dashboard:dev"], /launch-dashboard\.ts --dev/);
  assert.doesNotMatch(manifest.scripts.start, /owner:pair/);
  const launcher = await fs.readFile("scripts/launch-dashboard.ts", "utf8");
  assert.match(launcher, /createTicket\(\)/);
  assert.match(launcher, /ownerLaunchUrl\(ticket\)/);
  assert.match(launcher, /verifyLauncherReadyProof\(/);
  assert.match(launcher, /X-Local-MCP-Launch-Challenge/);
  assert.match(launcher, /LAUNCH_SECRET_ENV/);
  const route = await fs.readFile("src/app/api/local/owner/route.ts", "utf8");
  assert.match(route, /launcherReadyProof\(/);
  assert.match(route, /ensureLocalRequest\(request\)/);
  assert.match(launcher, /"127\.0\.0\.1"/);
  assert.match(launcher, /shell: false/);
  assert.match(launcher, /function stopManagedDashboard/);
  assert.match(launcher, /managedDashboardExitCode\(childExitCode, stopping\)/);
  assert.match(launcher, /detached: process\.platform !== "win32"/);
  assert.match(launcher, /process\.kill\(-managedGroup, signal\)/);
  assert.match(launcher, /managedGroupStillRunning\(\)/);
  assert.match(launcher, /signalOwnedTree\("SIGKILL"\)/);
  assert.match(launcher, /stopManagedDashboard\("SIGTERM"\)/);
  assert.match(launcher, /After pairing, resume your saved wizard step at:/);
  assert.match(launcher, /DASHBOARD_ORIGIN \+ "\/setup-center/);
  assert.doesNotMatch(launcher, /CLOUDFLARE_API_TOKEN/);
});
