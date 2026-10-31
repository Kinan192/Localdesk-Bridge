import { z } from "zod";

const ORIGIN = "https://api.cloudflare.com/client/v4";
const MAX_RESPONSE = 256 * 1024;
const HEX_ID = /^[a-f0-9]{32}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Envelope = z.object({ success: z.boolean(), result: z.unknown().optional() }).passthrough();

export class ProvisioningError extends Error {
  constructor(message: string) { super(message); this.name = "ProvisioningError"; }
}

/** Safe HTTP code only; never forward Cloudflare error payloads or credential values. */
export class CloudflareApiError extends ProvisioningError {
  constructor(public readonly httpStatus: number) {
    super(httpStatus === 403 || httpStatus === 401
      ? "Cloudflare API denied the request. Check token scope and resource permissions."
      : "Cloudflare API returned HTTP " + httpStatus + ".");
    this.name = "CloudflareApiError";
  }
}

export function requireAccountId(value: string): string {
  if (!HEX_ID.test(value)) throw new ProvisioningError("Invalid Cloudflare account or zone ID.");
  return value.toLowerCase();
}

export function requireResourceId(value: string): string {
  if (!UUID.test(value) && !HEX_ID.test(value)) {
    throw new ProvisioningError("Invalid Cloudflare resource ID.");
  }
  return value.toLowerCase();
}

export type CloudflareMethod = "GET" | "POST" | "PUT";
export type CloudflareRequester = (
  method: CloudflareMethod, path: string, token: string, body?: object,
) => Promise<unknown>;

/** Fixed Cloudflare origin; request paths are constructed by server code only. */
export function cloudflareRequest(fetcher: typeof fetch = fetch): CloudflareRequester {
  return async (method, path, token, body) => {
    if (!/^\/(?:accounts|zones)\/[a-z0-9/_?=&.%-]+$/.test(path) ||
        path.includes("..") || path.includes("%") || path.includes("//")) {
      throw new ProvisioningError("Unsafe Cloudflare API path.");
    }
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(token)) {
      throw new ProvisioningError("Cloudflare token is unavailable.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(ORIGIN + path, {
        method, redirect: "error", signal: controller.signal,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new CloudflareApiError(response.status);
      const reader = response.body?.getReader();
      if (!reader) throw new ProvisioningError("Cloudflare returned no response.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > MAX_RESPONSE) throw new ProvisioningError("Cloudflare response too large.");
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const part of chunks) { data.set(part, offset); offset += part.length; }
      const parsed = Envelope.parse(JSON.parse(new TextDecoder().decode(data)));
      if (!parsed.success || parsed.result === undefined) {
        throw new ProvisioningError("Cloudflare operation was not confirmed.");
      }
      return parsed.result;
    } catch (error) {
      if (error instanceof ProvisioningError) throw error;
      throw new ProvisioningError("Cloudflare request could not be verified securely.");
    } finally { clearTimeout(timeout); }
  };
}
