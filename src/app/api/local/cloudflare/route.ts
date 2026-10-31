import { NextRequest } from "next/server";
import { ensureLocalRequest, ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { CloudflareSettingsRepository } from "@/server/cloudflare/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // P1D: sensitive read metadata must not be exposed to unpaired local clients.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    const config = await new CloudflareSettingsRepository().load();
    return respond({ configured: Boolean(config), config });
  } catch (error) { return respondError(error); }
}

export async function PUT(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const config = await new CloudflareSettingsRepository().save(await readJsonSmall(request));
    return respond({ configured: true, config });
  } catch (error) { return respondError(error); }
}

export async function DELETE(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    await new CloudflareSettingsRepository().clear();
    return respond({ configured: false, config: null });
  } catch (error) { return respondError(error); }
}
