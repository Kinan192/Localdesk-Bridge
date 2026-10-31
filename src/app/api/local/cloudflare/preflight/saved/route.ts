import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { SavedCloudflarePreflight, SavedPreflightError } from "@/server/cloudflare/saved-preflight";
import { SetupDraftRepository } from "@/server/cloudflare/setup-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST is read-only to Cloudflare, but protected like a mutation because it
// accesses an OS-keychain token. A successful candidate preflight saves ONLY
// nonsecret setup fields to the local draft for navigation between pages.
// No GET or token-echoing endpoint is exposed.
export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const body = await readJsonSmall(request);
    const result = await new SavedCloudflarePreflight().check(body);
    let draftSaved = false;
    if (result.preflight.status === "candidate" && !result.preflight.dnsScanTruncated) {
      await new SetupDraftRepository().save({
        accountId: result.preflight.accountId,
        domain: result.preflight.domain,
        subdomain: body.subdomain,
        allowedEmail: body.allowedEmail,
      });
      draftSaved = true;
    }
    return respond({ ...result, draftSaved });
  } catch (error) {
    return respond({
      error: error instanceof SavedPreflightError
        ? error.message : "Cloudflare preflight could not be completed securely.",
    }, 400);
  }
}
