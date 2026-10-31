import { NextRequest } from "next/server";
import { ensureOwnerRequest, respond } from "@/server/http/local-only";
import { previewRemoteConfigFromDeployment } from "@/server/cloudflare/config-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only prefill. No writes or secret responses. */
export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    return respond({ preview: await previewRemoteConfigFromDeployment() });
  } catch {
    return respond({ error: "Konfigurasi deployment tidak bisa dibaca secara aman." }, 409);
  }
}
