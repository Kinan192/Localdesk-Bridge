import test from "node:test";
import assert from "node:assert/strict";
import { cloudflareReadOnlyTokenTemplateUrl } from "../../src/lib/cloudflare-token-template.ts";

test("Cloudflare user-token template uses only zone/dns READ permissions", () => {
  const url = new URL(cloudflareReadOnlyTokenTemplateUrl());
  assert.equal(url.origin, "https://dash.cloudflare.com");
  assert.equal(url.pathname, "/profile/api-tokens");
  const grants = JSON.parse(url.searchParams.get("permissionGroupKeys") ?? "null");
  assert.deepEqual(grants, [
    { key: "zone", type: "read" },
    { key: "dns", type: "read" },
  ]);
  assert.equal(url.searchParams.get("accountId"), "*");
  assert.equal(url.searchParams.get("zoneId"), "all");
  assert.equal(url.searchParams.has("token"), false);
  assert.equal(url.searchParams.has("apiKey"), false);
});
