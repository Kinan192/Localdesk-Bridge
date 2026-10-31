import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { verifyCloudflareTokenAndZones } from "@/server/cloudflare/account-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const input = await readJsonSmall(request);
    return respond(await verifyCloudflareTokenAndZones(input));
  } catch (error) {
    // Never echo input, Authorization or Cloudflare's raw error response.
    return respondError(error);
  }
}
