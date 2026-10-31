import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createProbeServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OwnerPairingRepository } from "../src/server/owner/index.ts";
import { DASHBOARD_ORIGIN, browserOpenCommand, ownerLaunchUrl } from "../src/server/owner/dashboard-launch.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dev = process.argv.includes("--dev");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = [nextCli, dev ? "dev" : "start", "--hostname", "127.0.0.1", "--port", "3100"];

const portAvailable = await new Promise<boolean>(resolve => {
  const probe = createProbeServer();
  probe.once("error", () => resolve(false));
  probe.listen(3100, "127.0.0.1", () => probe.close(() => resolve(true)));
});
if (!portAvailable) {
  process.stderr.write("[Local MCP Manager] Port 3100 is already in use. Stop the previous dashboard before launching a new session.\n");
  process.exit(1);
}

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: false,
});
let exited = false;
let childExitCode: number | null = null;
child.on("exit", code => {
  exited = true;
  childExitCode = code;
});
child.on("error", error => {
  exited = true;
  process.stderr.write("[Local MCP Manager] Failed to start dashboard: " + error.message + "\n");
});

function pause(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function waitForLocalDashboard(process: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (exited || process.exitCode !== null) {
      throw new Error("Dashboard process stopped before it was ready.");
    }
    try {
      const response = await fetch(DASHBOARD_ORIGIN + "/api/local/owner", {
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
        redirect: "error",
      });
      if (response.ok) return;
    } catch { /* Next.js is still starting. */ }
    await pause(350);
  }
  throw new Error("Dashboard did not become ready on 127.0.0.1:3100.");
}

async function openBrowser(url: string): Promise<void> {
  const { command, args } = browserOpenCommand(process.platform, url);
  try {
    const opener = spawn(command, args, { shell: false, detached: false, stdio: "ignore" });
    opener.on("error", () => {
      // The terminal link remains available if no browser opener is installed.
    });
    opener.unref();
  } catch { /* The terminal link remains available. */ }
}

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

try {
  await waitForLocalDashboard(child);
  // Ticket is generated AFTER the bound local listener is responsive, to
  // minimize expiry while Next.js compiles. The browser must redeem it once.
  const ticket = await new OwnerPairingRepository().createTicket();
  const url = ownerLaunchUrl(ticket);
  process.stdout.write(
    "\n[Local MCP Manager] Dashboard ready. Opening your browser.\n" +
    "[Local MCP Manager] If it does not open, use this private link within 2 minutes:\n" +
    url + "\n" +
    "[Local MCP Manager] Do not share this link. It only authorizes this browser.\n\n",
  );
  await openBrowser(url);
} catch (error) {
  process.stderr.write(
    "[Local MCP Manager] " + (error instanceof Error ? error.message : "Startup failed") + "\n",
  );
  child.kill("SIGTERM");
  process.exitCode = 1;
}

while (!exited && child.exitCode === null) {
  await pause(500);
}
if (process.exitCode !== 1) process.exitCode = childExitCode || 0;
