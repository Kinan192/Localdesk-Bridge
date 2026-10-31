import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { safeAutoStartFailureHint, startRemoteConnectivity } from "../../src/server/service/auto-start.ts";
import { AUTO_SERVICES_ENV } from "../../src/server/owner/dashboard-launch.ts";

function services(mcpState = "stopped", tunnelState = "stopped") {
  const events: string[] = [];
  let mcp = mcpState;
  let tunnel = tunnelState;
  const mcpService = {
    status: () => ({ state: mcp }),
    start: async () => { events.push("mcp"); mcp = "running"; },
  };
  const tunnelService = {
    status: () => ({ state: tunnel }),
    start: async () => {
      assert.equal(mcp, "running", "Tunnel may only start after MCP is protected and listening.");
      events.push("tunnel");
      tunnel = "running";
    },
  };
  return { events, mcpService, tunnelService };
}

test("auto-start starts protected MCP before Tunnel, without changing deployment", async () => {
  const { events, mcpService, tunnelService } = services();
  assert.deepEqual(await startRemoteConnectivity(mcpService, tunnelService), {
    mcpStarted: true, tunnelStarted: true,
  });
  assert.deepEqual(events, ["mcp", "tunnel"]);
  assert.deepEqual(await startRemoteConnectivity(mcpService, tunnelService), {
    mcpStarted: false, tunnelStarted: false,
  });
  assert.deepEqual(events, ["mcp", "tunnel"]);
});

test("auto-start skips an already running MCP and starts only missing Tunnel", async () => {
  const { events, mcpService, tunnelService } = services("running", "stopped");
  const result = await startRemoteConnectivity(mcpService, tunnelService);
  assert.deepEqual(result, { mcpStarted: false, tunnelStarted: true });
  assert.deepEqual(events, ["tunnel"]);
});

test("auto-start refuses a changing-state MCP and will not touch Tunnel", async () => {
  const { events, mcpService, tunnelService } = services("starting", "stopped");
  await assert.rejects(() => startRemoteConnectivity(mcpService, tunnelService), /MCP is changing state/);
  assert.deepEqual(events, []);
});

test("auto-start does not launch Tunnel if MCP startup fails", async () => {
  const { events, mcpService, tunnelService } = services();
  mcpService.start = async () => { events.push("mcp-error"); throw new Error("MCP rejected"); };
  await assert.rejects(() => startRemoteConnectivity(mcpService, tunnelService), /MCP rejected/);
  assert.deepEqual(events, ["mcp-error"]);
});

test("auto-start does not open duplicate Tunnel while Tunnel is changing state", async () => {
  const { events, mcpService, tunnelService } = services("running", "starting");
  await assert.rejects(() => startRemoteConnectivity(mcpService, tunnelService), /Tunnel is changing state/);
  assert.deepEqual(events, []);
});

test("auto-start provides actionable but secret-free failure hints", () => {
  const sensitive = "provider-secret-token-should-not-appear";
  const port = safeAutoStartFailureHint(
    { lastError: "MCP HTTP port is already in use; refusing to modify an unmanaged process." },
    { lastError: null },
  );
  assert.match(port, /8401/);
  assert.match(port, /unrelated services/);
  const provider = safeAutoStartFailureHint(
    { lastError: null },
    { lastError: "Cloudflare error: " + sensitive },
  );
  assert.match(provider, /Tunnel failed/);
  assert.equal(provider.includes(sensitive), false);
  const mcpError = safeAutoStartFailureHint(
    { lastError: "MCP failure " + sensitive },
    { lastError: null },
  );
  assert.equal(mcpError.includes(sensitive), false);
});

test("auto-start is restricted to production launcher after successful owner pairing", async () => {
  const manifest = JSON.parse(await fs.readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const launcher = await fs.readFile("scripts/launch-dashboard.ts", "utf8");
  const pairingRoute = await fs.readFile("src/app/api/local/owner/pair/route.ts", "utf8");
  const service = await fs.readFile("src/server/service/auto-start.ts", "utf8");
  assert.match(manifest.scripts.start, /launch-dashboard\.ts/);
  assert.match(manifest.scripts["start:manual"], /--manual-services/);
  assert.match(launcher, /!dev && !process\.argv\.includes\("--manual-services"\)/);
  assert.match(launcher, /\[AUTO_SERVICES_ENV\]: autoServices \? "1" : "0"/);
  assert.equal(AUTO_SERVICES_ENV, "LOCAL_MCP_AUTO_START_SERVICES");
  const authIndex = pairingRoute.indexOf("redeemTicket(");
  const scheduleIndex = pairingRoute.indexOf("scheduleAutoStartAfterOwnerPair()");
  assert.ok(authIndex !== -1 && scheduleIndex > authIndex);
  assert.match(service, /process\.env\[AUTO_SERVICES_ENV\] !== "1"/);
  assert.match(service, /process\.env\[LAUNCH_SECRET_ENV\]/);
  assert.match(service, /__localMcpAutoStartTask/);
});
