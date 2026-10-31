import test from "node:test";
import assert from "node:assert/strict";
import { setupStepStates, configuredStepCount } from "../../src/features/setup-center/progress.ts";

test("an empty installation never claims an authenticated client connection", () => {
  const states = setupStepStates();
  assert.deepEqual(states, [
    "review", "pending", "review", "pending", "pending", "pending", "pending", "verify-in-client",
  ]);
  assert.equal(configuredStepCount(states), 0);
});

test("system check needs real prerequisite detection and is never inferred from deployment", () => {
  assert.equal(setupStepStates()[0], "review");
  assert.equal(setupStepStates({ deploymentPhase: "published" })[0], "review");
  assert.equal(setupStepStates({ systemReady: true })[0], "configured");
});

test("published config is distinct from OAuth client verification", () => {
  const states = setupStepStates({
    systemReady: true, approvedFolders: 2, credentialAvailable: true, deploymentPhase: "published",
    mcpConfigured: true, mcpProtected: true, tunnelManagedRunning: true,
  });
  assert.equal(configuredStepCount(states), 6);
  assert.equal(states[5], "review");
  assert.equal(states[7], "verify-in-client");
});

test("MCP or Tunnel alone cannot produce a complete service status", () => {
  const mcpOnly = setupStepStates({ mcpProtected: true });
  const tunnelOnly = setupStepStates({ tunnelManagedRunning: true });
  assert.equal(mcpOnly[6], "pending");
  assert.equal(tunnelOnly[6], "pending");
});
