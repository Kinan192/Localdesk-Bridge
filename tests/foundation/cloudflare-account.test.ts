import test from "node:test";
import assert from "node:assert/strict";
import { verifyCloudflareTokenAndZones } from "../../src/server/cloudflare/account-connection.ts";

const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

test("Cloudflare token verifies and lists only zones, never returns credential", async () => {
  const endpoints: string[] = [];
  const fake = (async (url: string | URL | Request, options?: RequestInit) => {
    endpoints.push(String(url));
    assert.equal(options?.redirect, "error");
    assert.equal(options?.headers && (options.headers as Record<string,string>).Authorization, "Bearer " + token);
    if (String(url).endsWith("/user/tokens/verify")) {
      return response({ success: true, result: { status: "active", expires_on: null } });
    }
    return response({ success: true, result: [{
      id: "zone1", name: "example.com", status: "active",
      account: { id: "acc1", name: "Test Account" },
    }], result_info: { total_pages: 1 } });
  }) as typeof fetch;
  const result = await verifyCloudflareTokenAndZones({ token }, fake);
  assert.equal(result.verified, true);
  assert.equal(result.credentialStored, false);
  assert.equal(result.canProvision, false);
  assert.deepEqual(result.zones, [{
    id: "zone1", name: "example.com", status: "active",
    accountId: "acc1", accountName: "Test Account",
  }]);
  assert.equal(endpoints.length, 2);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("Cloudflare tokens cannot inject URLs, leak secrets or pass expired verification", async () => {
  await assert.rejects(() => verifyCloudflareTokenAndZones({ token: "invalid!" }));
  await assert.rejects(() => verifyCloudflareTokenAndZones({ token, extra: "secret" }));
  const expired = (async () => response({ success: true, result: { status: "expired" } })) as typeof fetch;
  await assert.rejects(() => verifyCloudflareTokenAndZones({ token }, expired), /not active/);
  const refused = (async () => response({ success: false }, 401)) as typeof fetch;
  await assert.rejects(() => verifyCloudflareTokenAndZones({ token }, refused), /Token invalid/);
  const redirect = (async () => { throw new Error("Secret: " + token); }) as typeof fetch;
  await assert.rejects(() => verifyCloudflareTokenAndZones({ token }, redirect), error => {
    assert.equal(String(error).includes(token), false);
    return true;
  });
});
