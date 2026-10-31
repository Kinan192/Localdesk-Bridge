import { NextRequest } from "next/server";
import { ensureLocalRequest, respond, respondError } from "@/server/http/local-only";
import { OWNER_COOKIE, OwnerPairingRepository } from "@/server/owner/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = ensureLocalRequest(request);
  if (denied) return denied;
  try {
    const paired = await new OwnerPairingRepository().verifySession(
      request.cookies.get(OWNER_COOKIE)?.value,
    );
    return respond({ paired, mode: "local-owner-pairing", provisioningEnabled: false });
  } catch (error) { return respondError(error); }
}
