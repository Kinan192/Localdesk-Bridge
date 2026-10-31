import { NextRequest } from "next/server";
import { z } from "zod";
import { ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { CloudflareSettingsRepository, resolveCloudflareConfig } from "@/server/cloudflare/index.ts";
import { remoteMcpSupervisor } from "@/server/service/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ServiceActionSchema = z.object({
  action: z.enum(["start", "stop"]),
}).strict();

export async function GET(request: NextRequest) {
  // P1D: block unpaired requests from accessing local metadata.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  let configReady = false;
  try {
    await resolveCloudflareConfig({
      CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
      CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
      MCP_PUBLIC_HOSTNAME: process.env.MCP_PUBLIC_HOSTNAME,
      MCP_HTTP_PORT: process.env.MCP_HTTP_PORT,
    }, new CloudflareSettingsRepository());
    configReady = true;
  } catch { /* Not configured is expected on first install. */ }
  return respond({
    status: remoteMcpSupervisor.status(),
    configReady,
    mode: "single-node-process-alpha",
    message: "Controls only this dashboard's own MCP HTTP child, not cloudflared or system services.",
  });
}

export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const { action } = ServiceActionSchema.parse(await readJsonSmall(request));
    const status = action === "start"
      ? await remoteMcpSupervisor.start()
      : await remoteMcpSupervisor.stop();
    return respond({ status });
  } catch (error) { return respondError(error); }
}
