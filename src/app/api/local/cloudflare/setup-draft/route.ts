import { NextRequest } from "next/server";
import { ensureOwnerRequest, respond } from "@/server/http/local-only";
import { CloudflareCredentialVault } from "@/server/credentials/index";
import { SetupDraftRepository } from "@/server/cloudflare/setup-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only, nonsecret metadata; NO endpoint for reading the stored token.
// The draft is created only after successful live read-only preflight.
export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    const draft = await new SetupDraftRepository().load();
    if (!draft) return respond({ draft: null, credentialAvailable: false });
    let credentialAvailable = false;
    try {
      const token = new CloudflareCredentialVault().read({
        kind: "cloudflare-api-token", accountId: draft.accountId,
      });
      credentialAvailable = typeof token === "string" && token.length >= 20;
    } catch { /* Locked or missing native keychain remains unavailable. */ }
    return respond({ draft, credentialAvailable });
  } catch {
    return respond({ error: "Could not securely retrieve the local Cloudflare setup draft." }, 400);
  }
}
