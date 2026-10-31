import { NextRequest } from "next/server";
import { ensureOwnerRequest, respond, respondError } from "@/server/http/local-only";
import { getLocalClientSetup } from "@/server/setup/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generates setup instructions only; never modifies Claude's config or starts an agent. */
export async function GET(request: NextRequest) {
  // P1D: sensitive read metadata must not be exposed to unpaired local clients.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    return respond({ setup: await getLocalClientSetup(), mode: "local-stdio" });
  } catch (error) {
    return respondError(error);
  }
}
