/**
 * Explicit opt-in for the remote MCP service. The process MUST NOT start
 * without Cloudflare Access configuration; never fall back to authless HTTP.
 */
export type RemoteConfig = {
  teamDomain: string;
  applicationAudience: string;
  publicHostname: string;
  port: number;
};

// Only the four remote-MCP settings are required as an input shape.
// Next.js augments NodeJS.ProcessEnv with a mandatory NODE_ENV; accepting that
// full type would incorrectly reject validated config objects built by the UI.
export type RemoteConfigEnvironment = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  MCP_PUBLIC_HOSTNAME?: string;
  MCP_HTTP_PORT?: string;
};

export function parseRemoteConfig(env: RemoteConfigEnvironment): RemoteConfig {
  const teamDomain = (env.CF_ACCESS_TEAM_DOMAIN || "").trim().toLowerCase();
  const applicationAudience = (env.CF_ACCESS_AUD || "").trim();
  const publicHostname = (env.MCP_PUBLIC_HOSTNAME || "").trim().toLowerCase();
  const port = env.MCP_HTTP_PORT ? Number(env.MCP_HTTP_PORT) : 8401;

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(teamDomain)) {
    throw new Error("Set CF_ACCESS_TEAM_DOMAIN to your actual team.cloudflareaccess.com hostname.");
  }
  if (applicationAudience.length < 16 || applicationAudience.length > 256 || /\s/.test(applicationAudience)) {
    throw new Error("Set CF_ACCESS_AUD to your Cloudflare Access application's audience tag.");
  }
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(publicHostname) ||
      publicHostname.endsWith(".cloudflareaccess.com")) {
    throw new Error("Set MCP_PUBLIC_HOSTNAME to the separate public MCP hostname (no scheme or path).");
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3100 || port === 3030 || port === 8001) {
    throw new Error("MCP_HTTP_PORT must be a non-conflicting unprivileged port.");
  }
  return { teamDomain, applicationAudience, publicHostname, port };
}

export function remoteRequestError(
  method: string | undefined,
  pathname: string,
  host: string | undefined,
  origin: string | undefined,
  config: RemoteConfig,
): { status: number; message: string } | null {
  if (pathname !== "/mcp") return { status: 404, message: "Not found" };
  const allowedHosts = new Set([
    config.publicHostname,
    "127.0.0.1:" + config.port,
    "localhost:" + config.port,
  ]);
  if (!allowedHosts.has((host || "").toLowerCase())) {
    return { status: 403, message: "Invalid hostname" };
  }
  // ChatGPT/Claude cloud services make server-side HTTP requests without
  // browser Origin headers. Reject browser-origin MCP requests by default.
  if (origin) return { status: 403, message: "Browser origin forbidden" };
  if (!["POST", "GET", "DELETE"].includes(method || "")) {
    return { status: 405, message: "Unsupported method" };
  }
  return null;
}
