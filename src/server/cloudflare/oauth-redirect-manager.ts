import { z } from "zod";
import { CloudflareCredentialVault } from "../credentials/index.ts";
import { DeploymentRepository, type DeploymentRecord } from "./deployment-state.ts";
import { callbackUris, checkAccess } from "./protected-provisioner.ts";
import { CloudflareRequester, cloudflareRequest, ProvisioningError } from "./provisioning-api.ts";

const SaveRequest = z.object({
  confirmHostname: z.string().min(4).max(253),
  confirmed: z.literal(true),
  expectedUris: z.array(z.string().min(12).max(300)).min(1).max(8),
  redirectUris: z.array(z.string().min(12).max(300)).min(1).max(8),
}).strict();

type Store = Pick<DeploymentRepository, "load" | "save" | "exclusive">;
type Credentials = Pick<CloudflareCredentialVault, "read">;

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProvisioningError("Cloudflare Access application returned invalid data.");
  }
  return value as Record<string, unknown>;
}

function validatedUris(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8 ||
      value.some(v => typeof v !== "string")) {
    throw new ProvisioningError("Managed OAuth redirect URL list is missing or invalid.");
  }
  const uris = callbackUris(value as string[]);
  if (new Set(uris).size !== uris.length) {
    throw new ProvisioningError("OAuth redirect URLs must be unique.");
  }
  return uris;
}

function deployment(record: DeploymentRecord | null): asserts record is DeploymentRecord {
  if (!record || !record.accessAppId || !record.aud ||
      !["access-ready", "tunnel-ready", "published"].includes(record.phase)) {
    throw new ProvisioningError("A verified existing Access deployment is required.");
  }
}

export class OAuthRedirectManager {
  constructor(
    private readonly store: Store = new DeploymentRepository(),
    private readonly vault: Credentials = new CloudflareCredentialVault(),
    private readonly api: CloudflareRequester = cloudflareRequest(),
  ) {}

  private async fetchCurrent(record: DeploymentRecord, token: string) {
    const route = "/accounts/" + record.accountId + "/access/apps/" + record.accessAppId;
    const app = asObject(await this.api("GET", route, token));
    const policies = await this.api("GET", route + "/policies", token);
    const identity = checkAccess(app, record.hostname, record.allowedEmail, undefined, policies);
    if (identity.id !== record.accessAppId || identity.aud !== record.aud) {
      throw new ProvisioningError("Cloudflare Access application identity changed; refusing to edit.");
    }
    const oauth = asObject(app.oauth_configuration);
    const dcr = asObject(oauth.dynamic_client_registration);
    const urls = validatedUris(dcr.allowed_uris);
    return { app, oauth, dcr, policies, urls, route };
  }

  /** Owner-only, read-only Cloudflare refresh; remote is the source of truth. */
  async read() {
    const record = await this.store.load();
    deployment(record);
    const token = this.vault.read({ kind: "cloudflare-api-token", accountId: record.accountId });
    const current = await this.fetchCurrent(record, token);
    return {
      hostname: record.hostname,
      phase: record.phase,
      redirectUris: current.urls,
      inSyncWithLocalState: JSON.stringify(current.urls) === JSON.stringify(record.redirectUris),
      cloudflareMutated: false as const,
    };
  }

  /**
   * Confirmed update of the EXISTING Access application only.
   * The deployment lock serializes against publishing/recovery.
   * An uncertain provider write retains that lock for manual inspection.
   */
  async save(raw: unknown) {
    const parsed = SaveRequest.safeParse(raw);
    if (!parsed.success) throw new ProvisioningError("Invalid or unconfirmed OAuth redirect update.");
    const { confirmHostname, confirmed, expectedUris, redirectUris } = parsed.data;
    const expected = validatedUris(expectedUris);
    const requested = validatedUris(redirectUris);
    if (!confirmed) throw new ProvisioningError("Owner approval is required.");
    const result = await this.store.exclusive(async () => {
      let mutationAttempted = false;
      try {
      const record = await this.store.load();
      deployment(record);
      if (record.hostname !== confirmHostname) {
        throw new ProvisioningError("Confirmed hostname does not match the existing deployment.");
      }
      const token = this.vault.read({ kind: "cloudflare-api-token", accountId: record.accountId });
      const current = await this.fetchCurrent(record, token);
      if (JSON.stringify(current.urls) !== JSON.stringify(expected)) {
        throw new ProvisioningError("Cloudflare redirects changed; refresh before editing to prevent overwrites.");
      }
      if (JSON.stringify(current.urls) === JSON.stringify(requested)) {
        // No provider mutation: a no-op is safe and keeps local metadata synchronized.
        if (JSON.stringify(record.redirectUris) !== JSON.stringify(requested)) {
          await this.store.save({ ...record, redirectUris: requested });
        }
        return { hostname: record.hostname, redirectUris: requested, updated: false, verified: true };
      }
      // Cloudflare documents GET -> PUT (preserve the complete existing app settings).
      // Remove read-only response metadata; do not change type/domain/policies/Access grants.
      const body: Record<string, unknown> = {
        ...current.app,
        // Cloudflare PUT expects the existing application configuration,
        // including the separately verified Access policy.
        policies: current.policies,
        oauth_configuration: {
          ...current.oauth,
          dynamic_client_registration: {
            ...current.dcr, allowed_uris: requested,
          },
        },
      };
      for (const key of ["id", "aud", "account_id", "created_at", "updated_at", "last_updated"]) {
        delete body[key];
      }
      mutationAttempted = true;
      await this.api("PUT", current.route, token, body);
      const verified = await this.fetchCurrent(record, token);
      if (JSON.stringify(verified.urls) !== JSON.stringify(requested)) {
        throw new ProvisioningError("Cloudflare did not confirm the updated redirect URLs.");
      }
      await this.store.save({ ...record, redirectUris: requested });
      return { hostname: record.hostname, redirectUris: requested, updated: true, verified: true };
      } catch (error) {
        // A failed pre-write validation must never strand the deployment lock.
        // Once a PUT was attempted, retain the lock until manual verification.
        if (mutationAttempted) throw error;
        return { prewriteError: error };
      }
    });
    if ("prewriteError" in result) throw result.prewriteError;
    return result;
  }
}
