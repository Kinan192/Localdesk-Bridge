import { NextRequest } from "next/server";
import { ActivityQuerySchema } from "@/server/contracts/index.ts";
import { readAuditEvents } from "@/server/audit/index.ts";
import { ensureOwnerRequest, respond, respondError } from "@/server/http/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local-only read view: returns structured metadata, never file contents or paths.
export async function GET(request: NextRequest) {
  // P1D: block unpaired requests from accessing local metadata.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    const params = request.nextUrl.searchParams;
    const options = ActivityQuerySchema.parse({
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
      ...(params.has("result") ? { result: params.get("result") } : {}),
    });
    const events = await readAuditEvents({ limit: options.limit, result: options.result });
    return respond({ events, mode: "local-stdio" });
  } catch (error) { return respondError(error); }
}
