/**
 * M2.3 — Pure client payload and response constraints.
 * Never persist or log a credential; the server validates everything again.
 */
export const ACCOUNT_ID_RE = /^[a-f0-9]{32}$/i;
export const CLOUD_TOKEN_RE = /^[A-Za-z0-9_-]{20,256}$/;

export type CloudflareAccountChoice = { id: string; name: string };
export type VaultAction = "POST" | "PUT" | "DELETE";

export function activeVerifiedAccounts(result: unknown): CloudflareAccountChoice[] {
  if (!result || typeof result !== "object") return [];
  const data = result as Record<string, unknown>;
  if (data.verified !== true || data.tokenStatus !== "active" ||
      data.credentialStored !== false || data.canProvision !== false ||
      !Array.isArray(data.zones)) return [];
  const choices = new Map<string, string>();
  for (const value of data.zones) {
    if (!value || typeof value !== "object") continue;
    const zone = value as Record<string, unknown>;
    if (zone.status !== "active" || typeof zone.accountId !== "string" ||
        !ACCOUNT_ID_RE.test(zone.accountId) || typeof zone.accountName !== "string") continue;
    const id = zone.accountId.toLowerCase();
    if (!choices.has(id)) choices.set(id, zone.accountName.slice(0, 120) || "Cloudflare account");
  }
  return [...choices].map(([id, name]) => ({ id, name }));
}

export function credentialPayload(accountId: string, token: string, confirmed: boolean) {
  if (!ACCOUNT_ID_RE.test(accountId) || !CLOUD_TOKEN_RE.test(token) || confirmed !== true) {
    throw new Error("Pilih akun hasil verifikasi, masukkan token yang valid, dan setujui penyimpanan.");
  }
  return { accountId: accountId.toLowerCase(), token, confirmed: true as const };
}

export function revokeCredentialPayload(accountId: string, confirmed: boolean) {
  if (!ACCOUNT_ID_RE.test(accountId) || confirmed !== true) {
    throw new Error("Account ID tidak valid atau persetujuan penghapusan belum diberikan.");
  }
  return { accountId: accountId.toLowerCase(), confirmed: true as const };
}

export function confirmedVaultOutcome(method: VaultAction, response: unknown, accountId: string): boolean {
  if (!response || typeof response !== "object" || !ACCOUNT_ID_RE.test(accountId)) return false;
  const result = response as Record<string, unknown>;
  const key = method === "POST" ? "stored" : method === "PUT" ? "rotated" : "revoked";
  const credential = result.credential;
  if (!credential || typeof credential !== "object") return false;
  const ref = credential as Record<string, unknown>;
  return result[key] === true && result.canProvision === false &&
    ref.kind === "cloudflare-api-token" &&
    typeof ref.accountId === "string" && ref.accountId.toLowerCase() === accountId.toLowerCase();
}
