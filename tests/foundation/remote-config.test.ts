import test from "node:test";
import assert from "node:assert/strict";
import { parseRemoteConfig, remoteRequestError } from "../../src/server/mcp/remote-config.ts";

const example = {
  CF_ACCESS_TEAM_DOMAIN: "myteam.cloudflareaccess.com",
  CF_ACCESS_AUD: "abcdef0123456789abcdef0123456789abcdef",
  MCP_PUBLIC_HOSTNAME: "mcp.example.com",
  MCP_HTTP_PORT: "18401",
};

test("Remote MCP fails closed without Cloudflare Access configuration", () => {
  assert.throws(() => parseRemoteConfig({}), /CF_ACCESS_TEAM_DOMAIN/);
  assert.throws(() => parseRemoteConfig({ ...example, CF_ACCESS_AUD: "" }), /CF_ACCESS_AUD/);
  assert.throws(() => parseRemoteConfig({ ...example, MCP_PUBLIC_HOSTNAME: "" }), /MCP_PUBLIC_HOSTNAME/);
  assert.throws(() => parseRemoteConfig({ ...example, MCP_HTTP_PORT: "3100" }), /MCP_HTTP_PORT/);
  assert.throws(() => parseRemoteConfig({ ...example, CF_ACCESS_TEAM_DOMAIN: "localhost:80" }), /CF_ACCESS_TEAM_DOMAIN/);
  assert.throws(() => parseRemoteConfig({ ...example, MCP_PUBLIC_HOSTNAME: "http://mcp.example.com" }), /MCP_PUBLIC_HOSTNAME/);
  assert.throws(() => parseRemoteConfig({ ...example, MCP_PUBLIC_HOSTNAME: "mcp.example.com:3100" }), /MCP_PUBLIC_HOSTNAME/);
});

test("Remote MCP allows only its endpoint and valid configured hosts", () => {
  const config = parseRemoteConfig(example);
  assert.equal(config.port, 18401);
  assert.equal(remoteRequestError("POST", "/mcp", "mcp.example.com", undefined, config), null);
  assert.equal(remoteRequestError("POST", "/mcp", "127.0.0.1:18401", undefined, config), null);
  assert.equal(remoteRequestError("GET", "/mcp", "localhost:18401", undefined, config), null);
  assert.equal(remoteRequestError("POST", "/api/local/policy", config.publicHostname, undefined, config)?.status, 404);
  assert.equal(remoteRequestError("POST", "/mcp", "evil.com", undefined, config)?.status, 403);
  assert.equal(remoteRequestError("POST", "/mcp", config.publicHostname, "http://evil.com", config)?.status, 403);
  assert.equal(remoteRequestError("PATCH", "/mcp", config.publicHostname, undefined, config)?.status, 405);
});
