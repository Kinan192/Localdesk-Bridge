import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { publicMcpUrl, serviceFacts } from "../../src/features/setup-center/service-facts.ts";

const managedMcp = { configReady: true, status: { state: "running", managed: true, pid: 123 } };
const managedTunnel = { status: { state: "running", managed: true, pid: 456 } };
const remote = { remoteHttp: { state: "listening-protected", httpStatus: 401, port: 8401 }, connectedClients: null };

test("M2.6 public MCP URL comes only from published hostname, never localhost or arbitrary URLs", () => {
  assert.equal(publicMcpUrl({ phase: "published", hostname: "MCP.example.com" }), "https://mcp.example.com/mcp");
  for (const value of [
    null, undefined, { hostname: "mcp.example.com" }, { phase: "access-ready", hostname: "mcp.example.com" },
    { phase: "published", hostname: "http://example.com" },
    { phase: "published", hostname: "localhost" }, { phase: "published", hostname: "mcp..example.com" },
    { phase: "published", hostname: "mcp.example.com/other" },
    { phase: "published", hostname: "mcp.example.com?token=private" },
  ]) assert.equal(publicMcpUrl(value), null);
});

test("M2.6 no local status does not enable control of unmanaged processes", () => {
  const empty = serviceFacts(null, null, null);
  assert.deepEqual([empty.canStartMcp, empty.canStopMcp, empty.canStartTunnel, empty.canStopTunnel], [false, false, false, false]);
  const available = serviceFacts(
    { configReady: true, status: { state: "stopped", managed: false } },
    { status: { state: "stopped", managed: false } },
    { remoteHttp: { state: "stopped" } },
  );
  assert.equal(available.canStartMcp, true);
  assert.equal(available.canStartTunnel, false);
  assert.equal(available.canStopMcp, false);
  assert.equal(available.canStopTunnel, false);
  const unknownMcp = serviceFacts({ configReady: true, status: { state: "unknown", managed: false } }, { status: { state: "stopped", managed: false } }, null);
  assert.equal(unknownMcp.canStartMcp, false);
  const uncertainTunnel = serviceFacts(managedMcp, { status: { state: "error", managed: false } }, remote);
  assert.equal(uncertainTunnel.canStartTunnel, false);
});

test("M2.6 MCP before Tunnel and only owned local children can be stopped", () => {
  const result = serviceFacts(managedMcp, managedTunnel, remote);
  assert.equal(result.mcpProtected, true);
  assert.equal(result.mcpManaged, true);
  assert.equal(result.tunnelManaged, true);
  assert.equal(result.canStopMcp, true);
  assert.equal(result.canStopTunnel, true);
  assert.equal(result.canStartMcp, false);
  assert.equal(result.canStartTunnel, false);
  const manual = serviceFacts(managedMcp, { status: { state: "running", managed: false } }, remote);
  assert.equal(manual.canStopTunnel, false);
  assert.equal(manual.canStartTunnel, false);
  const startTunnel = serviceFacts(managedMcp, { status: { state: "stopped", managed: false } }, remote);
  assert.equal(startTunnel.canStartTunnel, true);
  assert.equal(serviceFacts(managedMcp, managedTunnel, remote, true).canStopMcp, false);
  assert.equal(serviceFacts(managedMcp, managedTunnel, remote, true).canStopTunnel, false);
});

test("M2.6 HTTP 401 proves a protected listener, not authenticated external tools", () => {
  const local = serviceFacts(
    { configReady: true, status: { state: "running", managed: false } },
    { status: { state: "running", managed: false } },
    remote,
  );
  assert.equal(local.mcpProtected, true);
  assert.equal(local.tunnelRunning, true);
  assert.equal(local.tunnelManaged, false);
  assert.equal(local.canStopMcp, false);
  assert.equal(local.canStopTunnel, false);
});

test("M2.6 inline services and client verification never auto-claim Cloudflare Healthy or OAuth", async () => {
  const [page, component, steps, oldTunnelPage, api, serviceApi, statusApi] = await Promise.all([
    fs.readFile("src/app/setup-center/page.js", "utf8"),
    fs.readFile("src/features/setup-center/service-client-panels.js", "utf8"),
    fs.readFile("src/features/setup-center/steps.js", "utf8"),
    fs.readFile("src/app/tunnel-control/page.js", "utf8"),
    fs.readFile("src/app/api/local/tunnel/route.ts", "utf8"),
    fs.readFile("src/app/api/local/service/route.ts", "utf8"),
    fs.readFile("src/app/api/local/status/route.ts", "utf8"),
  ]);
  assert.match(page, /activeStep === 6/);
  assert.match(page, /<ServiceControlPanel service=\{data\?\.service\}/);
  assert.match(page, /activeStep === 7/);
  assert.match(page, /<AIClientVerificationPanel deployment=\{data\?\.deployment\}/);
  assert.match(steps, /id: "services".*href: null/);
  assert.match(steps, /id: "clients".*href: null/);
  assert.match(component, /publicMcpUrl\(deployment\)/);
  assert.match(component, /serviceFacts\(service, tunnel, remote, busy\)/);
  assert.match(component, /Cloudflare Tunnel Healthy/);
  assert.match(component, /Belum diverifikasi di masing-masing klien/);
  assert.match(component, /list_roots/);
  assert.match(component, /list_files/);
  assert.match(component, /read_file/);
  assert.match(component, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(component, /disabled=\{!canRead \|\| !facts\.canStartTunnel\}/);
  assert.match(component, /disabled=\{!canRead \|\| !facts\.canStopTunnel\}/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /cloudflared untuk Tunnel ini belum dijalankan manual/);
  assert.match(oldTunnelPage, /Start Tunnel/);
  assert.match(oldTunnelPage, /Stop Tunnel/);
  assert.match(api, /ensureOwnerRequest\(request, true\)/);
  assert.match(serviceApi, /ensureOwnerRequest\(request, true\)/);
  assert.match(statusApi, /connectedClients: null/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|TUNNEL_TOKEN|CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(component, /fetch\(/);
});
