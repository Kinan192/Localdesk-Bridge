/**
 * M2.6 — display-only interpretation of owner-protected local status.
 *
 * Neither a local 401, managed cloudflared child nor a published deployment
 * proves Cloudflare Healthy, browser OAuth or AI tool connectivity.
 */
export type PublicDeployment = { phase?: unknown; hostname?: unknown } | null | undefined;

export function publicMcpUrl(deployment: PublicDeployment): string | null {
  if (deployment?.phase !== "published" || typeof deployment.hostname !== "string") return null;
  const host = deployment.hostname;
  if (host.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/i.test(host) ||
      !host.includes(".") || host.includes("..")) return null;
  return "https://" + host.toLowerCase() + "/mcp";
}

export type ServiceFacts = {
  mcpProtected: boolean;
  mcpManaged: boolean;
  mcpRunning: boolean;
  configReady: boolean;
  tunnelRunning: boolean;
  tunnelManaged: boolean;
  mcpState: string;
  tunnelState: string;
  canStartMcp: boolean;
  canStopMcp: boolean;
  canStartTunnel: boolean;
  canStopTunnel: boolean;
};

/** Controls are scoped to processes owned by this LocalDesk supervisor. */
export function serviceFacts(
  service: any, tunnel: any, remote: any, busy = false,
): ServiceFacts {
  const mcpState = typeof service?.status?.state === "string" ? service.status.state : "unknown";
  const tunnelState = typeof tunnel?.status?.state === "string" ? tunnel.status.state : "unknown";
  const configReady = service?.configReady === true;
  const mcpProtected = remote?.remoteHttp?.state === "listening-protected";
  const mcpManaged = service?.status?.managed === true;
  const mcpRunning = mcpState === "running";
  const tunnelRunning = tunnelState === "running";
  const tunnelManaged = tunnel?.status?.managed === true;
  const mcpTransition = mcpState === "starting" || mcpState === "stopping";
  const tunnelTransition = tunnelState === "starting" || tunnelState === "stopping";
  return {
    mcpProtected, mcpManaged, mcpRunning, configReady,
    tunnelRunning, tunnelManaged, mcpState, tunnelState,
    canStartMcp: !busy && configReady && !mcpProtected && !mcpManaged && mcpState === "stopped" && !mcpTransition,
    canStopMcp: !busy && mcpManaged && !mcpTransition,
    canStartTunnel: !busy && mcpProtected && !tunnelManaged && tunnelState === "stopped" && !tunnelTransition,
    canStopTunnel: !busy && tunnelManaged && !tunnelTransition,
  };
}
