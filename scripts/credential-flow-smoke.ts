import { randomBytes } from "node:crypto";
import { CloudflareCredentialVault } from "../src/server/credentials/index.ts";
import { CloudflareCredentialActions } from "../src/server/credentials/actions.ts";

/**
 * Native credential workflow smoke test WITHOUT network requests or real tokens.
 * Exercises the actual Cloudflare action service against the current OS keychain;
 * substitutes only Cloudflare's token verification response.
 *
 * The browser/HTTP flow and real Cloudflare token still require separate QA.
 */
const accountId = randomBytes(16).toString("hex");
const zoneId = randomBytes(16).toString("hex");
const original = randomBytes(32).toString("base64url");
const replacement = randomBytes(32).toString("base64url");
const reference = { kind: "cloudflare-api-token" as const, accountId };

let stored = false;
let revoked = false;
let vault: CloudflareCredentialVault | undefined;
try {
  vault = new CloudflareCredentialVault();
  const actions = new CloudflareCredentialActions(vault, async () => ({
    verified: true as const,
    tokenStatus: "active" as const,
    expiresAt: null,
    zones: [{
      id: zoneId, name: "example.invalid", status: "active",
      accountId, accountName: "Synthetic smoke test",
    }],
    truncated: false,
    credentialStored: false as const,
    canProvision: false as const,
    note: "Mock verification: no Cloudflare request occurred.",
  }));

  const saved = await actions.save({ accountId, token: original, confirmed: true });
  stored = true;
  if (!saved.stored || saved.canProvision || vault.read(reference) !== original ||
      JSON.stringify(saved).includes(original)) throw new Error("Store failed.");

  const rotated = await actions.rotate({ accountId, token: replacement, confirmed: true });
  if (!rotated.rotated || rotated.canProvision || vault.read(reference) !== replacement ||
      JSON.stringify(rotated).includes(replacement)) throw new Error("Rotation failed.");

  const removed = actions.revoke({ accountId, confirmed: true });
  if (!removed.revoked || removed.canProvision) throw new Error("Revocation failed.");
  revoked = true;

  let missing = false;
  try { vault.read(reference); } catch { missing = true; }
  if (!missing) throw new Error("Revocation verification failed.");
  process.stdout.write("PASS: Native keychain + credential actions store/rotate/revoke (synthetic only, no Cloudflare calls).\n");
} catch {
  process.stderr.write("FAILED: Native keychain credential workflow. No secrets printed and no Cloudflare resources changed.\n");
  process.exitCode = 1;
} finally {
  if (stored && !revoked && vault) {
    try { vault.revoke(reference); } catch { /* no logging of native-provider errors */ }
  }
}
