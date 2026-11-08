import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { approveDelete, listDeleteApprovals } from "@/server/files/delete-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try { return respond({ pending: await listDeleteApprovals() }); }
  catch (error) { return respondError(error); }
}

export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const body: unknown = await readJsonSmall(request);
    if (!body || typeof body !== "object" || !("id" in body) ||
        typeof body.id !== "string") throw new Error("Invalid request.");
    await approveDelete(body.id);
    return respond({ approved: true });
  } catch (error) { return respondError(error); }
}
