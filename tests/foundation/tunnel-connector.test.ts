import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { CloudflareApiError, type CloudflareRequester } from "../../src/server/cloudflare/provisioning-api.ts";
import type { DeploymentRecord } from "../../src/server/cloudflare/deployment-state.ts";
import { connectorEnvironment, fetchDedicatedTunnelToken, assertTunnelLocalConfiguration,
  TunnelConnectorSupervisor } from "../../src/server/tunnel/connector-supervisor.ts";

const accountId = "a".repeat(32);
const tunnelId = "11111111-1111-4111-8111-111111111111";
const token = "eyJ" + "x".repeat(170);
const apiToken = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const record: DeploymentRecord = {
  version: 1, accountId, zoneId: "b".repeat(32), domain: "example.com",
  hostname: "mcp.example.com", allowedEmail: "owner@example.com",
  redirectUris: ["https://client.example.com/callback"], phase: "tunnel-ready",
  accessAppId: "22222222-2222-4222-8222-222222222222",
  aud: "audience_tag_0123456789", tunnelId, dnsRecordId: null,
};
const config = {
  teamDomain: "example.cloudflareaccess.com", applicationAudience: record.aud!,
  publicHostname: record.hostname, port: 8401,
};

test("Tunnel API credential fetch is read-only, bound to exact project Tunnel ID, and never returned to browser", async () => {
  const calls: string[] = [];
  const api: CloudflareRequester = async (method, url, value) => {
    assert.equal(method, "GET");
    assert.equal(value, apiToken);
    calls.push(url);
    return url.endsWith("/token") ? token : { id: tunnelId, deleted_at: null };
  };
  assert.equal(await fetchDedicatedTunnelToken(record, apiToken, api), token);
  assert.deepEqual(calls, [
    "/accounts/" + accountId + "/cfd_tunnel/" + tunnelId,
    "/accounts/" + accountId + "/cfd_tunnel/" + tunnelId + "/token",
  ]);
});

test("Tunnel token supports Cloudflare's padded standard Base64 format", async () => {
  const paddedToken = "eyJ" + "a".repeat(120) + "+/==";
  const api: CloudflareRequester = async (_method, route) =>
    route.endsWith("/token") ? paddedToken : { id: tunnelId, deleted_at: null };
  assert.equal(await fetchDedicatedTunnelToken(record, apiToken, api), paddedToken);
  assert.equal(connectorEnvironment(paddedToken, {}).TUNNEL_TOKEN, paddedToken);
  assert.throws(() => connectorEnvironment(paddedToken + " token", {}), /invalid/);
});

test("Tunnel API token is refused if resource mismatches or deployment not ready", async () => {
  const wrong: CloudflareRequester = async () => ({ id: "another", deleted_at: null });
  await assert.rejects(() => fetchDedicatedTunnelToken(record, apiToken, wrong), /identity/);
  const noSecret: CloudflareRequester = async (_method, url) =>
    url.endsWith("/token") ? { token } : { id: tunnelId, deleted_at: null };
  await assert.rejects(() => fetchDedicatedTunnelToken(record, apiToken, noSecret), /token-format/);
  await assert.rejects(() => fetchDedicatedTunnelToken({
    ...record, tunnelId: null, phase: "access-ready",
  }, apiToken, wrong), /not recorded/);
});

test("Connector env forwards only required variables and token through environment, not args", () => {
  const env = connectorEnvironment(token, {
    PATH: "/usr/bin:/bin", HOME: "/home/tester", EVIL_SECRET: "not-allowed",
    CF_ACCESS_AUD: "test-aud",
  } as NodeJS.ProcessEnv);
  assert.equal(env.TUNNEL_TOKEN, token);
  assert.equal(env.PATH, "/usr/bin:/bin");
  assert.equal(env.EVIL_SECRET, undefined);
  assert.throws(() => connectorEnvironment("not-a-connector-token", {}), /invalid/);
});

test("Tunnel token permission failure reports stage and safe HTTP status, never secret", async () => {
  const supervisor = new TunnelConnectorSupervisor({
    getDeployment: async () => record,
    getConfig: async () => config,
    getApiCredential: () => apiToken,
    isMcpRunning: () => true,
    api: async (_method, route) => {
      if (route.endsWith("/token")) throw new CloudflareApiError(403);
      return { id: tunnelId, deleted_at: null };
    },
    launch: () => { throw new Error("must not spawn"); },
    startupDelayMs: 1,
  });
  await assert.rejects(() => supervisor.start(), /connector-token.*HTTP 403/);
  const result = supervisor.status();
  assert.equal(result.state, "error");
  assert.equal(result.managed, false);
  assert.equal(result.pid, null);
  assert.equal(result.failureStage, "connector-token");
  assert.equal(result.cloudflareHttpStatus, 403);
  assert.equal(JSON.stringify(result).includes(apiToken), false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("cloudflared spawn error becomes a safe launch-stage failure, even if another replica is Healthy", async () => {
  const supervisor = new TunnelConnectorSupervisor({
    getDeployment: async () => record,
    getConfig: async () => config,
    getApiCredential: () => apiToken,
    isMcpRunning: () => true,
    api: async (_method, route) =>
      route.endsWith("/token") ? token : { id: tunnelId, deleted_at: null },
    launch: () => {
      const emitter = new EventEmitter() as ChildProcess;
      Object.assign(emitter, { pid: undefined, kill: () => true });
      queueMicrotask(() => emitter.emit("error", new Error("provider secret should stay private")));
      return emitter;
    },
    startupDelayMs: 15,
  });
  await assert.rejects(() => supervisor.start(), /cloudflared-launch/);
  const info = supervisor.status();
  assert.equal(info.state, "error");
  assert.equal(info.managed, false);
  assert.equal(info.pid, null);
  assert.equal(info.failureStage, "cloudflared-launch");
  assert.equal(JSON.stringify(info).includes("provider secret"), false);
});

test("Start requires verified local Access/Tunnel configuration and running MCP HTTP", () => {
  assert.doesNotThrow(() => assertTunnelLocalConfiguration(record, config, true));
  assert.throws(() => assertTunnelLocalConfiguration(record, config, false), /Start the protected/);
  assert.throws(() => assertTunnelLocalConfiguration(record, { ...config, port: 3100 }, true), /config must match/);
  assert.throws(() => assertTunnelLocalConfiguration(record, {
    ...config, publicHostname: "evil.example.com",
  }, true), /config must match/);
  assert.throws(() => assertTunnelLocalConfiguration({
    ...record, tunnelId: null, phase: "access-ready",
  }, config, true), /Cloudflare Setup/);
});

test("Dashboard supervisor only stops its own child and never keeps Tunnel token in public status", async () => {
  const calls: string[] = [];
  let child: ChildProcess | null = null;
  const supervisor = new TunnelConnectorSupervisor({
    getDeployment: async () => record,
    getConfig: async () => config,
    getApiCredential: id => { assert.equal(id, accountId); return apiToken; },
    api: async (_method, route, value) => {
      assert.equal(value, apiToken);
      calls.push(route);
      return route.endsWith("/token") ? token : { id: tunnelId, deleted_at: null };
    },
    isMcpRunning: () => true,
    launch: value => {
      assert.equal(value, token);
      const emitter = new EventEmitter() as ChildProcess;
      Object.assign(emitter, {
        pid: 45231,
        kill: (_signal: string) => {
          queueMicrotask(() => emitter.emit("exit", 0));
          return true;
        },
      });
      child = emitter;
      return emitter;
    },
    startupDelayMs: 2,
  });
  assert.equal(supervisor.status().state, "stopped");
  const started = await supervisor.start();
  assert.equal(started.state, "running");
  assert.equal(started.pid, 45231);
  assert.equal(started.tunnelId, tunnelId);
  assert.equal(started.failureStage, null);
  assert.equal(started.managed, true);
  assert.equal(JSON.stringify(started).includes(token), false);
  await assert.rejects(() => supervisor.start(), /already manages/);
  const stopped = await supervisor.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.pid, null);
  assert.equal(stopped.failureStage, null);
  assert.equal(supervisor.status().managed, false);
  assert.ok(child);
  assert.equal(calls.length, 2);
});

test("Tunnel API/UI is owner protected and does not accept raw connector secrets", async () => {
  const route = await fs.readFile(path.resolve("src/app/api/local/tunnel/route.ts"), "utf8");
  const service = await fs.readFile(path.resolve("src/server/tunnel/connector-supervisor.ts"), "utf8");
  const page = await fs.readFile(path.resolve("src/app/tunnel-control/page.js"), "utf8");
  assert.match(route, /ensureOwnerRequest\(request\)/);
  assert.match(route, /ensureOwnerRequest\(request, true\)/);
  assert.match(route, /z\.enum\(\["start", "stop"\]\)/);
  assert.match(service, /TUNNEL_TOKEN/);
  assert.match(service, /spawn\("cloudflared", \["tunnel", "run"\]/);
  assert.match(service, /shell: false/);
  assert.doesNotMatch(service, /"tunnel", "run", "--token"/);
  assert.match(page, /Start Tunnel/);
  assert.match(page, /Stop Tunnel/);
  assert.match(page, /status\.failureStage/);
  assert.match(page, /status\?\.managed/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});
