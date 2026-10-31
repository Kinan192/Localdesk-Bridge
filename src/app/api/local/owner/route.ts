import { NextRequest } from "next/server";
import { ensureLocalRequest, ownerSessionCookie, respond, respondError } from "@/server/http/local-only";
import { OwnerPairingRepository } from "@/server/owner/index";
import { LAUNCH_SECRET_ENV, launcherReadyProof } from "@/server/owner/dashboard-launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = ensureLocalRequest(request);
  if (denied) return denied;
  try {
    const paired = await new OwnerPairingRepository().verifySession(
      ownerSessionCookie(request),
    );
    const response = respond({ paired, mode: "local-owner-pairing", provisioningEnabled: false });
    const proof = launcherReadyProof(
      process.env[LAUNCH_SECRET_ENV], request.headers.get("x-local-mcp-launch-challenge"),
    );
    if (proof) response.headers.set("X-Local-MCP-Launch-Proof", proof);
    return response;
  } catch (error) { return respondError(error); }
}
