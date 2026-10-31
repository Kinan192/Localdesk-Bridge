import { z } from "zod";
import { CloudflareCredentialVault } from "../credentials/index.ts";
import { preflightCloudflareHostname } from "./preflight.ts";
import { createProvisioningPreview, ProvisioningPreviewInput } from "./provisioning-plan.ts";

/**
 * Read-only setup check using an API credential already stored in OS Keychain.
 * Only call from an owner-authorized local handler. No tokens in JSON responses.
 */
export const SavedPreflightInput = ProvisioningPreviewInput.extend({
  accountId: z.string().regex(/^[a-f0-9]{32}$/i),
}).strict();

export class SavedPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedPreflightError";
  }
}

type Runner = typeof preflightCloudflareHostname;

export class SavedCloudflarePreflight {
  constructor(
    private readonly vault: Pick<CloudflareCredentialVault, "read"> = new CloudflareCredentialVault(),
    private readonly run: Runner = preflightCloudflareHostname,
  ) {}

  async check(input: unknown) {
    const parsed = SavedPreflightInput.safeParse(input);
    if (!parsed.success) {
      throw new SavedPreflightError("Invalid hostname preflight request.");
    }
    const accountId = parsed.data.accountId.toLowerCase();
    let plan: ReturnType<typeof createProvisioningPreview>;
    try {
      plan = createProvisioningPreview({
        domain: parsed.data.domain,
        subdomain: parsed.data.subdomain,
        allowedEmail: parsed.data.allowedEmail,
      });
    } catch {
      throw new SavedPreflightError("Invalid Cloudflare domain or hostname.");
    }

    let token: string;
    try {
      token = this.vault.read({ kind: "cloudflare-api-token", accountId });
    } catch {
      throw new SavedPreflightError("No accessible Cloudflare token in OS Keychain for this account.");
    }

    try {
      // The existing preflight only calls Cloudflare's official API with GET,
      // checks zone ownership/activation and exact DNS hostname collisions.
      const result = await this.run({
        token,
        domain: plan.zone,
        subdomain: parsed.data.subdomain,
        allowedEmail: plan.allowedEmail,
      });
      if (result.preflight.accountId.toLowerCase() !== accountId) {
        throw new Error("Account mismatch.");
      }
      return {
        ...result,
        credentialStored: true as const,
        credentialSource: "os-keychain" as const,
        canProvision: false as const,
      };
    } catch {
      // Do not reflect raw Cloudflare errors or native-provider exception text.
      throw new SavedPreflightError(
        "Cloudflare hostname preflight failed or the token cannot access the selected account and domain.",
      );
    }
  }
}
