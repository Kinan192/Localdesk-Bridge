import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { OAuthRedirectManager } from "@/server/cloudflare/oauth-redirect-manager";
import { CloudflareApiError, ProvisioningError } from "@/server/cloudflare/provisioning-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only. Only the paired local owner may inspect configured callbacks. */
export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    return respond(await new OAuthRedirectManager().read());
  } catch (error) {
    return respond({ error: error instanceof ProvisioningError ? error.message :
      "Could not verify the existing Cloudflare Access application." }, 409);
  }
}

/** Explicit owner-approved update: never creates Access, Tunnel, or DNS. */
export async function PUT(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    return respond(await new OAuthRedirectManager().save(await readJsonSmall(request)));
  } catch (error) {
    const status = error instanceof CloudflareApiError ? error.httpStatus : 409;
    return respond({
      error: error instanceof ProvisioningError ? error.message :
        "Update not confirmed. Inspect Cloudflare before retrying.",
      requiresInspection: true,
      cloudflareHttpStatus: error instanceof CloudflareApiError ? error.httpStatus : null,
    }, status);
  }
}
