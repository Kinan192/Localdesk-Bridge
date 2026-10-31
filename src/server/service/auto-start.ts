import { AUTO_SERVICES_ENV, LAUNCH_SECRET_ENV } from "../owner/dashboard-launch.ts";
import { remoteMcpSupervisor } from "./index.ts";
import { tunnelConnectorSupervisor } from "../tunnel/connector-supervisor.ts";

/**
 * Opt-in remote connectivity for a *trusted, local* dashboard launcher.
 * The dashboard owner must first redeem a valid one-use pairing ticket.
 * This never changes Cloudflare resources, permissions, or secrets.
 */
type ManagedStarter = {
  status(): { state: string };
  start(): Promise<unknown>;
};

export type AutoStartResult = {
  mcpStarted: boolean;
  tunnelStarted: boolean;
};

/** Start dependencies in order; do not restart resources already managed by this process. */
export async function startRemoteConnectivity(
  mcp: ManagedStarter,
  tunnel: ManagedStarter,
): Promise<AutoStartResult> {
  let mcpStarted = false;
  let tunnelStarted = false;

  if (mcp.status().state !== "running") {
    if (!["stopped", "error"].includes(mcp.status().state)) {
      throw new Error("MCP is changing state; automatic startup cancelled.");
    }
    await mcp.start();
    mcpStarted = true;
  }
  if (mcp.status().state !== "running") {
    throw new Error("Protected MCP did not become ready; Tunnel will not start.");
  }

  if (tunnel.status().state !== "running") {
    if (!["stopped", "error"].includes(tunnel.status().state)) {
      throw new Error("Tunnel is changing state; automatic startup cancelled.");
    }
    await tunnel.start();
    tunnelStarted = true;
  }
  if (tunnel.status().state !== "running") {
    throw new Error("Tunnel failed readiness after startup.");
  }
  return { mcpStarted, tunnelStarted };
}

declare global {
  // Singleton across Next.js route bundles in the same Node.js process.
  var __localMcpAutoStartTask: Promise<AutoStartResult> | undefined;
}

/** Do not log provider exception messages or token-bearing runtime metadata.
 * This fixed diagnostic text is safe to expose in the local terminal. */
export function safeAutoStartFailureHint(
  mcp: { lastError: string | null },
  tunnel: { lastError: string | null },
): string {
  if (mcp.lastError?.includes("MCP HTTP port is already in use")) {
    return "Port 8401 already has an MCP listener. Inspect the previous LocalDesk process; " +
      "do not kill unrelated services.";
  }
  if (mcp.lastError) return "Protected MCP failed; check Service status in the local dashboard.";
  if (tunnel.lastError) return "Tunnel failed; check Tunnel status in the local dashboard.";
  return "Check MCP and Tunnel status in the local dashboard.";
}

/** Owner pairing is the trigger: never start from a public GET or before authorization.
 * Failure stays nonfatal for the owner session; the dashboard offers manual recovery. */
export function scheduleAutoStartAfterOwnerPair(): void {
  if (process.env[AUTO_SERVICES_ENV] !== "1" || !process.env[LAUNCH_SECRET_ENV]) return;
  if (globalThis.__localMcpAutoStartTask) return;

  const task = Promise.resolve().then(() =>
    startRemoteConnectivity(remoteMcpSupervisor, tunnelConnectorSupervisor));
  globalThis.__localMcpAutoStartTask = task;
  void task.then(
    () => process.stdout.write("[Local MCP Manager] Protected MCP and Tunnel started automatically.\n"),
    () => process.stderr.write(
      "[Local MCP Manager] Automatic MCP/Tunnel startup failed. " +
      safeAutoStartFailureHint(remoteMcpSupervisor.status(), tunnelConnectorSupervisor.status()) + "\n",
    ),
  );
}
