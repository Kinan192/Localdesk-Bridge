import { NextRequest } from "next/server";
import { ensureLocalRequest, ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { writeReleaseStatus } from "@/server/access/write-release";
import {
  getPolicy, addReadOnlyRoot, setRootEnabled, removeRoot, setToolEnabled,
} from "@/server/http/local-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // P1D: sensitive read metadata must not be exposed to unpaired local clients.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try { return respond({ policy: await getPolicy(), mode: "read-only", writeRelease: writeReleaseStatus() }); }
  catch (error) { return respondError(error); }
}

export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const policy = await addReadOnlyRoot(await readJsonSmall(request));
    return respond({ policy, mode: "read-only", writeRelease: writeReleaseStatus() }, 201);
  } catch (error) { return respondError(error); }
}

export async function PATCH(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const payload = await readJsonSmall(request);
    if (!payload || typeof payload !== "object") throw new Error("Invalid request.");
    const policy = payload.type === "root"
      ? await setRootEnabled(payload)
      : payload.type === "tool"
      ? await setToolEnabled(payload)
      : (() => { throw new Error("Unknown policy change."); })();
    return respond({ policy, mode: "read-only", writeRelease: writeReleaseStatus() });
  } catch (error) { return respondError(error); }
}

export async function DELETE(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    return respond({ policy: await removeRoot(await readJsonSmall(request)), mode: "read-only", writeRelease: writeReleaseStatus() });
  } catch (error) { return respondError(error); }
}
