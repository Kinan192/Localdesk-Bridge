import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { CloudflareCredentialActions, SafeCredentialActionError } from "@/server/credentials/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P1D-B: owner-authorized, explicitly confirmed token vault management.
 * Credentials are transferred in same-origin JSON POST/PUT bodies only,
 * never in URLs. No GET endpoint exists, and no token is returned or logged.
 * This does NOT perform Cloudflare Tunnel, DNS or Access provisioning.
 */
async function perform(request: NextRequest, action: "save" | "rotate" | "revoke") {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const input = await readJsonSmall(request);
    const service = new CloudflareCredentialActions();
    const result = action === "save" ? await service.save(input)
      : action === "rotate" ? await service.rotate(input)
      : service.revoke(input);
    return respond(result);
  } catch (error) {
    // Do not reflect user data, validation errors, upstream payloads, or
    // native keyring exceptions. Unknown failures receive a generic message.
    return respond({
      error: error instanceof SafeCredentialActionError
        ? error.message : "Credential operation failed securely.",
    }, 400);
  }
}

export async function POST(request: NextRequest) {
  return perform(request, "save");
}

export async function PUT(request: NextRequest) {
  return perform(request, "rotate");
}

export async function DELETE(request: NextRequest) {
  return perform(request, "revoke");
}
