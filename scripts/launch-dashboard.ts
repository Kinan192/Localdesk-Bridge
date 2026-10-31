import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createProbeServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OwnerPairingRepository } from "../src/server/owner/index.ts";
import { AUTO_SERVICES_ENV, DASHBOARD_ORIGIN, LAUNCH_SECRET_ENV, browserOpenCommand, managedDashboardExitCode, ownedProcessGroupId, ownerLaunchUrl, verifyLauncherReadyProof } from "../src/server/owner/dashboard-launch.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dev = process.argv.includes("--dev");
// Production launcher auto-starts the already-provisioned remote services.
// Developers and users can disable it with --manual-services.
const autoServices = !dev && !process.argv.includes("--manual-services");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = [nextCli, dev ? "dev" : "start", "--hostname", "127.0.0.1", "--port", "3100"];
const launchSecret = randomBytes(32).toString("base64url");
const launchChallenge = randomBytes(32).toString("base64url");

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
  // A dedicated POSIX process group contains only this dashboard and the
  // Remote MCP/Tunnel children it creates; external services stay untouched.
  detached: process.platform !== "win32",
  env: { ...process.env, [LAUNCH_SECRET_ENV]: launchSecret, [AUTO_SERVICES_ENV]: autoServices ? "1" : "0" },
  shell: false,
});
const managedGroup = ownedProcessGroupId(process.platform, child.pid);
let exited = false;
let stopping = false;
let shutdownStartedAt: number | null = null;
let forcedShutdown = false;
let childExitCode: number | null = null;
let childExitSignal: NodeJS.Signals | null = null;
child.on("exit", (code, signal) => {
  exited = true;
  childExitCode = code;
  childExitSignal = signal;
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
        headers: { "X-Local-MCP-Launch-Challenge": launchChallenge },
      });
      if (response.ok) {
        if (verifyLauncherReadyProof(
          launchSecret, launchChallenge, response.headers.get("X-Local-MCP-Launch-Proof"),
        )) return;
        throw new Error("Port 3100 responded, but not as this launcher-owned dashboard. Refusing owner pairing.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not as this launcher-owned dashboard")) throw error;
      // Next.js may still be starting; no pairing ticket is created yet.
    }
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

/** Send a signal only to this launcher's own POSIX process group.
 * Remote MCP and Tunnel inherit its group; independently started cloudflared
 * and systemd services never do. A Windows runner signals only its direct child. */
function signalOwnedTree(signal: NodeJS.Signals): void {
  if (managedGroup !== null) {
    try {
      process.kill(-managedGroup, signal);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        process.stderr.write("[Local MCP Manager] Could not signal managed process group.\n");
        return;
      }
    }
  }
  if (!exited) child.kill(signal);
}

function managedGroupStillRunning(): boolean {
  if (managedGroup === null) return false;
  try {
    process.kill(-managedGroup, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function stopManagedDashboard(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  shutdownStartedAt = Date.now();
  signalOwnedTree(signal);
}
process.on("SIGINT", () => stopManagedDashboard("SIGTERM"));
process.on("SIGTERM", () => stopManagedDashboard("SIGTERM"));

try {
  await waitForLocalDashboard(child);
  // Ticket is generated AFTER the bound local listener is responsive, to
  // minimize expiry while Next.js compiles. The browser must redeem it once.
  const ticket = await new OwnerPairingRepository().createTicket();
  const url = ownerLaunchUrl(ticket);
  process.stdout.write(
    "\n[Local MCP Manager] Dashboard ready. Opening your browser.\n" +
    (autoServices ? "[Local MCP Manager] MCP and Tunnel will start after owner pairing if configured.\n" :
      "[Local MCP Manager] Remote services are in manual mode.\n") +
    "[Local MCP Manager] If it does not open, use this private link within 2 minutes:\n" +
    url + "\n" +
    "[Local MCP Manager] Do not share this link. It only authorizes this browser.\n" +
    "[Local MCP Manager] After pairing, resume your saved wizard step at: " +
    DASHBOARD_ORIGIN + "/setup-center\n\n",
  );
  await openBrowser(url);
} catch (error) {
  process.stderr.write(
    "[Local MCP Manager] " + (error instanceof Error ? error.message : "Startup failed") + "\n",
  );
  stopManagedDashboard("SIGTERM");
  process.exitCode = 1;
}

// Do not wait indefinitely for an unresponsive dashboard process.
while (!exited && child.exitCode === null) {
  if (stopping && shutdownStartedAt !== null) {
    const elapsed = Date.now() - shutdownStartedAt;
    if (elapsed > 5000 && !forcedShutdown) {
      forcedShutdown = true;
      process.stderr.write("[Local MCP Manager] Graceful shutdown timed out; terminating owned process tree.\n");
      signalOwnedTree("SIGKILL");
    }
    if (elapsed > 7000) {
      process.stderr.write("[Local MCP Manager] Could not confirm dashboard shutdown.\n");
      process.exitCode = 1;
      break;
    }
  }
  await pause(150);
}

// Next.js may exit before its route workers, MCP child or cloudflared child.
// Check the dedicated POSIX process group even AFTER the main Next child exits.
if (managedGroup !== null && managedGroupStillRunning()) {
  if (!stopping) signalOwnedTree("SIGTERM");
  const graceDeadline = Date.now() + 1500;
  while (managedGroupStillRunning() && Date.now() < graceDeadline) await pause(100);
  if (managedGroupStillRunning()) {
    signalOwnedTree("SIGKILL");
    const forceDeadline = Date.now() + 1000;
    while (managedGroupStillRunning() && Date.now() < forceDeadline) await pause(100);
  }
  if (managedGroupStillRunning()) {
    process.stderr.write("[Local MCP Manager] Managed process group may still have descendants; inspect local processes.\n");
    process.exitCode = 1;
  }
}
// A child terminated unexpectedly by a signal is a failure, not success.
if (process.exitCode !== 1) {
  if (!stopping && childExitCode === null) {
    process.stderr.write(
      "[Local MCP Manager] Dashboard stopped unexpectedly" +
      (childExitSignal ? " (" + childExitSignal + ")" : "") + ".\n",
    );
  }
  process.exitCode = managedDashboardExitCode(childExitCode, stopping);
}
