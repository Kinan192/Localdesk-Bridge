import { NextRequest, NextResponse } from "next/server";
import { ensureLocalRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { OWNER_COOKIE, OwnerPairingRepository, SESSION_TTL_MS } from "@/server/owner/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const denied = ensureLocalRequest(request, true);
  if (denied) return denied;
  try {
    const data = await readJsonSmall(request) as { ticket?: unknown };
    if (!data || typeof data !== "object" ||
        Object.keys(data).length !== 1 || typeof data.ticket !== "string") {
      return respond({ error: "Invalid pairing request." }, 400);
    }
    const session = await new OwnerPairingRepository().redeemTicket(data.ticket);
    if (!session) return respond({ error: "Pairing link expired or already used." }, 401);
    const response = NextResponse.json({ paired: true }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
    response.cookies.set(OWNER_COOKIE, session, {
      httpOnly: true, sameSite: "strict", path: "/", maxAge: SESSION_TTL_MS / 1000,
    });
    return response;
  } catch { return respond({ error: "Pairing could not be completed." }, 400); }
}
