/**
 * Local dashboard request checks. Keep this independent of Next.js so we can
 * regression-test it with standard Request objects.
 *
 * Next.js may normalize request.url to localhost while retaining the browser's
 * original Host header (127.0.0.1), so do NOT compare host === new URL(url).host.
 */
const ALLOWED_HOSTS = new Set(["127.0.0.1:3100", "localhost:3100"]);

export function localRequestError(
  request: Pick<Request, "headers" | "url">,
  mutation = false,
): string | null {
  const host = request.headers.get("host")?.trim().toLowerCase() ?? "";
  if (!ALLOWED_HOSTS.has(host)) {
    return "Dashboard is localhost-only.";
  }

  // GETs generally lack an Origin header. Mutations must have a matching
  // browser Origin, a custom header, and application/json for CSRF resistance.
  if (!mutation) return null;

  const expectedOrigin = "http://" + host;
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (
    request.headers.get("origin") !== expectedOrigin ||
    request.headers.get("x-local-mcp-action") !== "dashboard" ||
    !/^application\/json(?:\s*;|$)/i.test(contentType)
  ) {
    return "Same-origin JSON request required.";
  }
  return null;
}
