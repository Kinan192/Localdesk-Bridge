import { CloudflareCredentialVault } from "../credentials/index.ts";
import { DeploymentRepository, type DeploymentRecord } from "./deployment-state.ts";
import { cloudflareRequest, type CloudflareRequester } from "./provisioning-api.ts";

export type ImportPreview = {
  publicHostname: string;
  applicationAudience: string;
  teamDomain: string | null;
  port: 8401;
  deploymentPhase: DeploymentRecord["phase"];
  teamDomainNeedsEntry: boolean;
  source: "cloudflare-deployment";
};

/**
 * Read-only auto-prefill from a verified local deployment.
 * Team Domain is not present in an Access application/AUD, so retrieve
 * auth_domain from the Cloudflare Zero Trust organization when permitted.
 * No token or organization API error is sent to the browser.
 * Never create/update a Cloudflare resource or persist settings here.
 */
export async function previewRemoteConfigFromDeployment(
  state: Pick<DeploymentRepository, "load"> = new DeploymentRepository(),
  vault?: Pick<CloudflareCredentialVault, "read">,
  api: CloudflareRequester = cloudflareRequest(),
): Promise<ImportPreview | null> {
  const record = await state.load();
  if (!record || !record.accessAppId || !record.aud ||
      !["access-ready", "tunnel-ready", "published"].includes(record.phase)) return null;
  let teamDomain: string | null = null;
  try {
    const reader = vault ?? new CloudflareCredentialVault();
    const token = reader.read({ kind: "cloudflare-api-token", accountId: record.accountId });
    const raw = await api("GET",
      "/accounts/" + record.accountId + "/access/organizations", token);
    if (raw && typeof raw === "object" && !Array.isArray(raw) &&
        "auth_domain" in raw && typeof raw.auth_domain === "string") {
      const candidate = raw.auth_domain.toLowerCase().trim();
      if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(candidate)) {
        teamDomain = candidate;
      }
    }
  } catch {
    // Lack of optional Organizations Read permission is not an error:
    // only teamDomain remains user-supplied.
  }
  return {
    publicHostname: record.hostname,
    applicationAudience: record.aud,
    teamDomain,
    port: 8401,
    deploymentPhase: record.phase,
    teamDomainNeedsEntry: teamDomain === null,
    source: "cloudflare-deployment",
  };
}
