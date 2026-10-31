import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { preflightCloudflareHostname } from "@/server/cloudflare/preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only; POST is still protected by same-origin/JSON/custom-header guards.
// Never emit/store the Cloudflare credential or raw upstream API error data.
export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    return respond(await preflightCloudflareHostname(await readJsonSmall(request)));
  } catch (error) {
    return respondError(error);
  }
}
