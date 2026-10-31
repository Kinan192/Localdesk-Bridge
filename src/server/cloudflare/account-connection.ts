import { z } from "zod";

// Read-only Cloudflare API discovery. No token is saved or logged.
export const TokenInput = z.object({
  token: z.string().min(20).max(256).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export type ZoneInfo = { id: string; name: string; status: string; accountId: string; accountName: string };
type Fetcher = typeof fetch;
const base = "https://api.cloudflare.com/client/v4";
const MAX_BYTES = 512 * 1024;
// Only module-authored errors may reach the dashboard; untrusted fetch
// exception messages may embed token or headers and must be replaced.
class SafeCloudflareError extends Error {}

export async function cloudflareGet(path: string, token: string, fetcher: Fetcher): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    // Fixed official host only, no redirects (never leak Authorization).
    const response = await fetcher(base + path, {
      method: "GET", redirect: "error", signal: controller.signal,
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
    });
    if (response.status === 401 || response.status === 403) throw new Error("Token invalid or missing necessary Cloudflare permissions.");
    if (response.status === 429) throw new SafeCloudflareError("Cloudflare rate limit reached.");
    if (!response.ok) throw new SafeCloudflareError("Cloudflare API request failed.");
    const size = Number(response.headers.get("content-length") ?? 0);
    if (size > MAX_BYTES) throw new Error("Cloudflare response too large.");
    const reader = response.body?.getReader();
    if (!reader) throw new SafeCloudflareError("Cloudflare returned an empty response.");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("Cloudflare response too large.");
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(bytes);
    let i = 0;
    for (const chunk of chunks) { data.set(chunk, i); i += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(data)) as unknown;
  } catch (error) {
    if (error instanceof SafeCloudflareError ||
        (error instanceof Error && error.message === "Token invalid or missing necessary Cloudflare permissions.")) throw error;
    throw new Error("Could not securely verify the Cloudflare account.");
  } finally { clearTimeout(timeout); }
}

const verificationSchema = z.object({
  success: z.boolean(),
  result: z.object({ status: z.string(), expires_on: z.string().nullish() }).passthrough().optional(),
}).passthrough();
const zoneSchema = z.object({
  success: z.boolean(),
  result: z.array(z.object({
    id: z.string(), name: z.string(), status: z.string(),
    account: z.object({ id: z.string(), name: z.string().optional() }).passthrough(),
  }).passthrough()),
  result_info: z.object({ total_pages: z.number().int().nonnegative().optional() }).passthrough().optional(),
}).passthrough();

export async function verifyCloudflareTokenAndZones(input: unknown, fetcher: Fetcher = fetch) {
  const { token } = TokenInput.parse(input);
  const verified = verificationSchema.parse(await cloudflareGet("/user/tokens/verify", token, fetcher));
  if (!verified.success || verified.result?.status !== "active") throw new Error("Cloudflare token is not active.");
  const zones: ZoneInfo[] = [];
  let truncated = false;
  for (let page = 1; page <= 5; page++) {
    const result = zoneSchema.parse(await cloudflareGet("/zones?per_page=50&page=" + page, token, fetcher));
    if (!result.success) throw new Error("Cloudflare zone listing failed. Check Zone Read permission.");
    zones.push(...result.result.map(zone => ({
      id: zone.id, name: zone.name, status: zone.status,
      accountId: zone.account.id, accountName: zone.account.name ?? "Cloudflare account",
    })));
    const pages = result.result_info?.total_pages;
    if (pages !== undefined ? page >= pages : result.result.length < 50) break;
    if (page === 5) truncated = true;
  }
  return {
    verified: true as const, tokenStatus: "active" as const,
    expiresAt: verified.result.expires_on ?? null,
    zones, truncated, credentialStored: false as const,
    canProvision: false as const,
    note: "Token verified, visible zones discovered. Token NOT saved; write permissions not verified.",
  };
}
