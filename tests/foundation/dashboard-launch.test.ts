import test from "node:test";
import assert from "node:assert/strict";
import { browserOpenCommand, DASHBOARD_ORIGIN, ownerLaunchUrl } from "../../src/server/owner/dashboard-launch.ts";

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
  assert.match(launcher, /"127\.0\.0\.1"/);
  assert.match(launcher, /shell: false/);
  assert.doesNotMatch(launcher, /CLOUDFLARE_API_TOKEN/);
});
