import { localRequestError } from "./localhost-policy.ts";
import { OWNER_COOKIE, OwnerPairingRepository } from "../owner/index.ts";
const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

// Framework-independent cookie parsing for the foundation security layer.
// Fail closed when the browser supplies duplicate owner cookies.
function ownerSessionCookie(request: Request): string | undefined {
  const cookies = request.headers.get("cookie");
  if (!cookies) return undefined;
  const matches = cookies.split(";").map(cookie => cookie.trim())
    .filter(cookie => cookie.startsWith(OWNER_COOKIE + "="));
  return matches.length === 1 ? matches[0].slice(OWNER_COOKIE.length + 1) : undefined;
}

// This checks Host, Origin and JSON CSRF headers only.
// Use ensureOwnerRequest for sensitive operations; localhost is not identity.
export function ensureLocalRequest(request: Request, mutation = false): Response | null {
  const error = localRequestError(request, mutation);
  return error ? Response.json({ error }, {
    status: 403, headers: SECURITY_HEADERS,
  }) : null;
}

/**
 * Additional owner-session requirement for any endpoint receiving a
 * Cloudflare credential or performing a future remote mutation.
 * Existing local Host/Origin checks alone do not prove ownership.
 */
export async function ensureOwnerRequest(request: Request, mutation = false): Promise<Response | null> {
  const local = ensureLocalRequest(request, mutation);
  if (local) return local;
  try {
    const authenticated = await new OwnerPairingRepository().verifySession(
      ownerSessionCookie(request),
    );
    if (authenticated) return null;
  } catch { /* Fail closed. */ }
  return Response.json({ error: "Owner pairing required. Open the trusted local pairing link." }, {
    status: 401, headers: SECURITY_HEADERS,
  });
}

export function respond(body: unknown, status = 200) {
  return Response.json(body, { status, headers: SECURITY_HEADERS });
}

export function respondError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected request failure";
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  const status = code === "ACCESS_DENIED" ? 403 :
    code === "NOT_FOUND" ? 404 :
    code === "CONFLICT" ? 409 : 400;
  return respond({ error: message }, status);
}

export async function readJsonSmall(request: Request) {
  const maxSize = 8 * 1024;
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxSize) throw new Error("Request body too large.");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxSize) throw new Error("Request body too large.");
  return JSON.parse(text);
}
