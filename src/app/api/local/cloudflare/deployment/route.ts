import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { ProtectedCloudflareProvisioner, DeploymentStageError } from "@/server/cloudflare/protected-provisioner";
import { ProvisioningError } from "@/server/cloudflare/provisioning-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only, local-only. A read-only readiness check is available before
// either privileged step. Mutations require exact hostname confirmation,
// owner session, explicit step consent and verified Access-first safeguards.
// No developer environment flag or terminal activation is required.
export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  let action = "unknown";
  try {
    const body = await readJsonSmall(request);
    action = body && typeof body === "object" && typeof body.action === "string"
      ? body.action : "unknown";
    const provisioner = new ProtectedCloudflareProvisioner();
    if (body && typeof body === "object" && body.action === "check") {
      return respond(await provisioner.checkSetup(body));
    }
    if (body && typeof body === "object" && body.action === "recover") {
      return respond(await provisioner.recover(body));
    }
    return respond(await provisioner.execute(body));
  } catch (error) {
    if (action === "recover") {
      return respond({
        error: error instanceof ProvisioningError ? error.message :
          "Recovery could not confirm a safe state; lock remains held.",
        recovered: false,
      }, 409);
    }
    if (action === "publish" && error instanceof DeploymentStageError) {
      return respond({
        error: error.message,
        failedStage: error.stage,
        cloudflareHttpStatus: error.providerStatus,
        requiresInspection: true,
      }, 409);
    }
    if (error instanceof ProvisioningError && error.message.startsWith("Tidak")) {
      return respond({ error: error.message }, 400);
    }
    if (error instanceof ProvisioningError && (
      error.message.startsWith("Lengkapi") || error.message.startsWith("Konfirmasi") ||
      error.message.startsWith("Sudah ada") || error.message.startsWith("Hostname sudah")
    )) return respond({ error: error.message }, 400);
    return respond({
      error: action === "publish"
        ? "Publikasi Tunnel/DNS belum selesai. Jangan ulangi tombol Publish. Periksa status resource secara read-only; kemungkinan izin Tunnel Write/DNS Write kurang atau ada perubahan remote yang belum tercatat."
        : "Pemeriksaan atau pembuatan Access belum selesai. Periksa status resource secara read-only sebelum mengulang.",
      requiresInspection: true,
    }, 409);
  }
}

export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    const provisioner = new ProtectedCloudflareProvisioner();
    if (request.nextUrl.searchParams.get("inspect") === "1") {
      return respond(await provisioner.diagnose());
    }
    return respond(await provisioner.status());
  } catch {
    return respond({ error: "Status deployment tidak dapat diperiksa. Jangan ulangi mutasi sebelum meninjau Cloudflare." }, 409);
  }
}
