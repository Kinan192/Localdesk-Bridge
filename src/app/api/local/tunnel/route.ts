import { NextRequest } from "next/server";
import { z } from "zod";
import { ensureOwnerRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { tunnelConnectorSupervisor } from "@/server/tunnel/connector-supervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Action = z.object({ action: z.enum(["start", "stop"]) }).strict();

/** Only the paired owner can read local process metadata or start/stop it. */
export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  return respond({
    status: tunnelConnectorSupervisor.status(),
    manualReplicasUnmanaged: true,
    message: "Only the cloudflared process started by this dashboard can be stopped here.",
  });
}

export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  let action: "start" | "stop";
  try {
    action = Action.parse(await readJsonSmall(request)).action;
  } catch {
    return respond({ error: "Invalid Tunnel action." }, 400);
  }
  try {
    const status = action === "start"
      ? await tunnelConnectorSupervisor.start()
      : await tunnelConnectorSupervisor.stop();
    return respond({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message :
      "Tunnel control failed safely.";
    return respond({ error: message, status: tunnelConnectorSupervisor.status() }, 409);
  }
}
