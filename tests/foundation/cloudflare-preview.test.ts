import test from "node:test";
import assert from "node:assert/strict";
import { createProvisioningPreview } from "../../src/server/cloudflare/provisioning-plan.ts";

test("Beginner Cloudflare plan makes a safe preview without external actions", () => {
  const plan = createProvisioningPreview({
    domain: "Example.COM",
    allowedEmail: "Owner@Example.COM",
  });
  assert.equal(plan.status, "preview-only");
  assert.equal(plan.zone, "example.com");
  assert.equal(plan.hostname, "mcp.example.com");
  assert.equal(plan.endpoint, "https://mcp.example.com/mcp");
  assert.equal(plan.origin, "http://127.0.0.1:8401");
  assert.equal(plan.allowedEmail, "owner@example.com");
  assert.equal(plan.steps[0]?.id, "cloudflared");
  assert.equal(plan.steps.find(step => step.id === "access-first")?.automatic, false);
  assert.equal(plan.steps.every(step => !step.automatic), true);
  assert.equal(Object.keys(plan).some(key => /token|secret|key/i.test(key)), false);
  assert.equal(plan.steps.findIndex(step => step.id === "access-first") <
    plan.steps.findIndex(step => step.id === "dns"), true);
});

test("Beginner plan accepts a safe custom subdomain but rejects unsafe input", () => {
  const plan = createProvisioningPreview({
    domain: "example.net", subdomain: "my-mcp",
    allowedEmail: "user@example.net",
  });
  assert.equal(plan.hostname, "my-mcp.example.net");
  const bad = [
    { domain: "https://example.net", allowedEmail: "u@example.net" },
    { domain: "example.net/path", allowedEmail: "u@example.net" },
    { domain: "localhost", allowedEmail: "u@example.net" },
    { domain: "example.net:8401", allowedEmail: "u@example.net" },
    { domain: "example.net", subdomain: "foo.bar", allowedEmail: "u@example.net" },
    { domain: "example.net", subdomain: "www", allowedEmail: "u@example.net" },
    { domain: "example.net", allowedEmail: "not-an-email" },
    { domain: "example.net", allowedEmail: "u@example.net", apiToken: "secret" },
    { domain: "team.cloudflareaccess.com", allowedEmail: "u@example.net" },
  ];
  for (const value of bad) {
    assert.throws(() => createProvisioningPreview(value));
  }
});
