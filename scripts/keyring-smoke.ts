import { randomBytes } from "node:crypto";
import { CloudflareCredentialVault } from "../src/server/credentials/index.ts";

/**
 * Optional, explicitly user-invoked native keychain smoke test.
 * Uses disposable synthetic values only. Never prints secret bytes.
 * Not part of npm run audit:all because Linux keyrings can prompt for unlock.
 */
let vault: CloudflareCredentialVault | null = null;
const ref = {
  kind: "cloudflare-api-token" as const,
  accountId: randomBytes(16).toString("hex"),
};
const original = randomBytes(32).toString("base64url");
const rotated = randomBytes(32).toString("base64url");
let stored = false;
let revoked = false;
try {
  vault = new CloudflareCredentialVault();
  vault.store(ref, original);
  stored = true;
  if (vault.read(ref) !== original) throw new Error("Credential verification failed.");
  vault.rotate(ref, rotated);
  if (vault.read(ref) !== rotated) throw new Error("Credential rotation failed.");
  vault.revoke(ref);
  revoked = true;
  process.stdout.write("Native OS keyring test PASS: store, retrieve, rotate, revoke (synthetic values only).\n");
} catch {
  process.stderr.write("Native OS keyring test FAILED: provider unavailable/locked or credential lifecycle failed. No plaintext fallback was used.\n");
  process.exitCode = 1;
} finally {
  // Best effort rollback if a late stage fails. Never touch unrelated vault items.
  if (stored && !revoked && vault) {
    try { vault.revoke(ref); } catch { /* No secret output. */ }
  }
}
