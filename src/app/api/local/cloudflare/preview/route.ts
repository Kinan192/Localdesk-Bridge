import { NextRequest } from "next/server";
import { ensureLocalRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { createProvisioningPreview } from "@/server/cloudflare/provisioning-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview only. Does not call Cloudflare or alter local/remote state.
 * POST still requires localhost same-origin mutation guards to prevent
 * an external site from using this localhost API as an origin oracle.
 */
export async function POST(request: NextRequest) {
  const denied = ensureLocalRequest(request, true);
  if (denied) return denied;
  try {
    return respond({ preview: createProvisioningPreview(await readJsonSmall(request)) });
  } catch (error) { return respondError(error); }
}
