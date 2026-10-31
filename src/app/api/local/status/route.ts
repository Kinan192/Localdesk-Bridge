import { NextRequest } from "next/server";
import { ensureOwnerRequest, respond } from "@/server/http/local-only";
import { CloudflareSettingsRepository, resolveCloudflareConfig } from "@/server/cloudflare/index.ts";
import { remoteMcpSupervisor } from "@/server/service/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * An HTTP 401 response only shows a loopback listener rejected anonymous
 * traffic. It is NOT proof of a valid Cloudflare Tunnel or OAuth login.
 */
async function probeRemoteHttp() {
  let port = 8401;
  try {
    const configuration = await resolveCloudflareConfig({
      CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
      CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
      MCP_PUBLIC_HOSTNAME: process.env.MCP_PUBLIC_HOSTNAME,
      MCP_HTTP_PORT: process.env.MCP_HTTP_PORT,
    }, new CloudflareSettingsRepository());
    port = configuration.port;
  } catch { /* No configured tunnel yet; probe the default port only. */ }

  try {
    const response = await fetch("http://127.0.0.1:" + port + "/mcp", {
      method: "GET", cache: "no-store", signal: AbortSignal.timeout(700),
    });
    return {
      port,
      state: response.status === 401 ? "listening-protected" : "unexpected-response",
      httpStatus: response.status,
    };
  } catch { return { port, state: "stopped", httpStatus: null }; }
}

export async function GET(request: NextRequest) {
  // P1D: block unpaired requests from accessing local metadata.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  return respond({
    state: remoteMcpSupervisor.status().state,
    mode: "local-first",
    remoteHttp: await probeRemoteHttp(),
    remoteService: remoteMcpSupervisor.status(),
    connectedClients: null,
    message: "MCP HTTP is managed locally; Cloudflare Tunnel and authenticated AI clients are not monitored.",
  });
}


