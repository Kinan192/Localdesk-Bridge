import { z } from "zod";
import { verifyCloudflareTokenAndZones, TokenInput } from "../cloudflare/account-connection.ts";
import { CloudflareCredentialVault, type CredentialReference } from "./index.ts";

/**
 * Owner-only credential management. The handler must verify the owner BEFORE
 * parsing this request and must never echo input or raw upstream exceptions.
 * This module makes read-only Cloudflare verification calls; no provisioning.
 */
const AccountId = z.string().regex(/^[a-f0-9]{32}$/i);
const SaveInput = z.object({
  accountId: AccountId,
  token: TokenInput.shape.token,
  confirmed: z.literal(true),
}).strict();
const RevokeInput = z.object({
  accountId: AccountId,
  confirmed: z.literal(true),
}).strict();

type Verifier = typeof verifyCloudflareTokenAndZones;
export class SafeCredentialActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeCredentialActionError";
  }
}

function reference(accountId: string): CredentialReference {
  return { kind: "cloudflare-api-token", accountId: accountId.toLowerCase() };
}

export class CloudflareCredentialActions {
  constructor(
    private readonly vault: Pick<CloudflareCredentialVault, "store" | "rotate" | "revoke"> = new CloudflareCredentialVault(),
    private readonly verify: Verifier = verifyCloudflareTokenAndZones,
  ) {}

  private async verifiedAccount(input: unknown) {
    const parsed = SaveInput.safeParse(input);
    if (!parsed.success) throw new SafeCredentialActionError("Invalid credential request or approval.");
    const { accountId, token } = parsed.data;
    try {
      const discovery = await this.verify({ token });
      if (!discovery.verified || discovery.tokenStatus !== "active") {
        throw new Error("Inactive token.");
      }
      const matching = discovery.zones.filter(zone =>
        zone.accountId.toLowerCase() === accountId.toLowerCase() && zone.status === "active");
      if (!matching.length) throw new Error("No matching active zones.");
      return { ref: reference(accountId), token, verifiedZoneCount: matching.length };
    } catch {
      // Do not echo raw Cloudflare errors, token bytes, or headers.
      throw new SafeCredentialActionError("Cloudflare verification failed or account has no active visible zone.");
    }
  }

  /** Explicit consent; does not grant Tunnel/DNS/Access write permission. */
  async save(input: unknown) {
    const data = await this.verifiedAccount(input);
    try {
      const credential = this.vault.store(data.ref, data.token);
      return { stored: true as const, credential, verifiedZoneCount: data.verifiedZoneCount,
        canProvision: false as const };
    } catch {
      throw new SafeCredentialActionError("Could not store the token in the native OS keychain.");
    }
  }

  async rotate(input: unknown) {
    const data = await this.verifiedAccount(input);
    try {
      const credential = this.vault.rotate(data.ref, data.token);
      return { rotated: true as const, credential, verifiedZoneCount: data.verifiedZoneCount,
        canProvision: false as const };
    } catch {
      throw new SafeCredentialActionError("Could not rotate the token in the native OS keychain.");
    }
  }

  revoke(input: unknown) {
    const parsed = RevokeInput.safeParse(input);
    if (!parsed.success) throw new SafeCredentialActionError("Invalid revoke request or approval.");
    const ref = reference(parsed.data.accountId);
    try {
      this.vault.revoke(ref);
      return { revoked: true as const, credential: ref, canProvision: false as const };
    } catch {
      throw new SafeCredentialActionError("Could not revoke the token from the native OS keychain.");
    }
  }
}
