import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond } from "@/server/http/local-only";
import { ProtectedCloudflareProvisioner, DeploymentStageError, DnsCompletionStageError } from "@/server/cloudflare/protected-provisioner";
import { DeploymentRepository } from "@/server/cloudflare/deployment-state";
import { ProvisioningError } from "@/server/cloudflare/provisioning-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe read-only prerequisite check; never creates or overwrites DNS. */
export async function GET(request: NextRequest) {
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  const repository = new DeploymentRepository();
  let lockDiagnostics = null;
  try { lockDiagnostics = await repository.inspectDnsLock(); } catch { /* Fail closed. */ }
  try {
    return respond({
      ...(await new ProtectedCloudflareProvisioner().checkDnsCompletion()),
      lockDiagnostics,
    });
  } catch (error) {
    return respond({
      ready: false,
      lockDiagnostics,
      failedStage: error instanceof DeploymentStageError ? error.stage : "readiness",
      cloudflareHttpStatus: error instanceof DeploymentStageError ? error.providerStatus : null,
      error: error instanceof ProvisioningError ? error.message :
        "DNS readiness check could not verify Access, Tunnel, ingress and hostname.",
    }, 409);
  }
}

/** Explicit owner-confirmed completion of DNS ONLY, never Access/Tunnel creation. */
export async function POST(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const body = await readJsonSmall(request);
    return respond(await new ProtectedCloudflareProvisioner().finalizeDns(body));
  } catch (error) {
    const failedStage = error instanceof DeploymentStageError || error instanceof DnsCompletionStageError
      ? error.stage : "request-or-deployment";
    // Local-only metadata; do not perform any second write or disclose API token.
    let deployment: { phase: string; lock: string } | null = null;
    try {
      const repository = new DeploymentRepository();
      const state = await repository.load();
      deployment = { phase: state?.phase || "not-started", lock: await repository.lockStatus() };
    } catch { /* Do not mask the primary error or guess local state. */ }
    let lockDiagnostics = null;
    try { lockDiagnostics = await new DeploymentRepository().inspectDnsLock(); } catch { /* Fail closed. */ }
    const errorCode = error instanceof DnsCompletionStageError ? error.safeCode : null;
    const errorKind = error instanceof DnsCompletionStageError ? error.kind : null;
    return respond({
      error: error instanceof ProvisioningError ? error.message :
        "DNS gagal pada tahap " + failedStage + ". Periksa status deployment dan DNS; jangan ulangi Publish.",
      failedStage,
      cloudflareHttpStatus: error instanceof DeploymentStageError ? error.providerStatus : null,
      errorCode,
      errorKind,
      deployment,
      lockDiagnostics,
      requiresInspection: true,
    }, 409);
  }
}
