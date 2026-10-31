/**
 * Cloudflare's official *user* API token template format.
 * This prefills READ-ONLY permissions for zone discovery + DNS preflight.
 * The Cloudflare page still requires user review, scope selection and
 * explicit creation. No token value is ever passed in the URL.
 *
 * https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/
 */
export function cloudflareReadOnlyTokenTemplateUrl(): string {
  const url = new URL("https://dash.cloudflare.com/profile/api-tokens");
  const permissions = [
    { key: "zone", type: "read" },
    { key: "dns", type: "read" },
  ];
  url.searchParams.set("permissionGroupKeys", JSON.stringify(permissions));
  // These are Cloudflare's required template placeholders, NOT a grant.
  // The user should restrict the token to their actual Cloudflare zone.
  url.searchParams.set("accountId", "*");
  url.searchParams.set("zoneId", "all");
  url.searchParams.set("name", "Local MCP Manager - read-only domain check");
  return url.toString();
}
