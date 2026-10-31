import test from "node:test";
import assert from "node:assert/strict";
import { localRequestError } from "../../src/server/http/localhost-policy.ts";

function browserRequest(
  urlHost: string,
  hostHeader: string | null,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  options: { origin?: string; actionHeader?: string; contentType?: string } = {},
) {
  const headers = new Headers();
  if (hostHeader !== null) headers.set("host", hostHeader);
  if (options.origin !== undefined) headers.set("origin", options.origin);
  if (options.actionHeader !== undefined) headers.set("x-local-mcp-action", options.actionHeader);
  if (options.contentType !== undefined) headers.set("content-type", options.contentType);
  return new Request("http://" + urlHost + "/api/local/policy", { method, headers });
}

test("Local GET is allowed even when Next.js normalizes request.url host", () => {
  // Regression: the browser Host is 127.0.0.1, but NextRequest.url says localhost.
  assert.equal(localRequestError(browserRequest("localhost:3100", "127.0.0.1:3100")), null);
  assert.equal(localRequestError(browserRequest("127.0.0.1:3100", "localhost:3100")), null);
  assert.equal(localRequestError(browserRequest("127.0.0.1:3100", "127.0.0.1:3100")), null);
  assert.equal(localRequestError(browserRequest("localhost:3100", "localhost:3100")), null);
});

test("Local GET rejects unknown, missing or incorrect Host headers", () => {
  for (const host of [null, "evil.example:3100", "127.0.0.1.evil.example:3100", "127.0.0.1:3101", "localhost:3030", "[::1]:3100"]) {
    assert.match(localRequestError(browserRequest("localhost:3100", host)) ?? "", /localhost-only/);
  }
});

test("Local mutations require matching Origin, JSON content and custom header", () => {
  const valid = {
    origin: "http://127.0.0.1:3100",
    actionHeader: "dashboard",
    contentType: "application/json; charset=UTF-8",
  };
  for (const method of ["POST", "PATCH", "DELETE"] as const) {
    assert.equal(localRequestError(browserRequest("localhost:3100", "127.0.0.1:3100", method, valid), true), null);
    assert.match(localRequestError(browserRequest("localhost:3100", "127.0.0.1:3100", method, {
      ...valid, origin: "http://evil.example:3100",
    }), true) ?? "", /Same-origin/);
    assert.match(localRequestError(browserRequest("localhost:3100", "127.0.0.1:3100", method, {
      ...valid, actionHeader: "",
    }), true) ?? "", /Same-origin/);
    assert.match(localRequestError(browserRequest("localhost:3100", "127.0.0.1:3100", method, {
      ...valid, contentType: "application/jsonp",
    }), true) ?? "", /Same-origin/);
    assert.match(localRequestError(browserRequest("localhost:3100", "127.0.0.1:3100", method), true) ?? "", /Same-origin/);
  }
});
