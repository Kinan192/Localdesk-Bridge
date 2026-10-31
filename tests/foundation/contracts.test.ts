import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPolicy, PolicySchema, RootConfigSchema, PatchToolRequestSchema,
  TOOL_NAMES, ActivityQuerySchema,
} from "../../src/server/contracts/index.ts";

test("Default policy is safe, strictly typed, and includes ten tool IDs", () => {
  const policy = PolicySchema.parse(defaultPolicy());
  assert.equal(policy.roots.length, 0);
  assert.equal(TOOL_NAMES.length, 10);
  assert.deepEqual(TOOL_NAMES.filter(tool => policy.tools[tool]), TOOL_NAMES.slice(0, 5));
  assert.equal(PolicySchema.safeParse({ ...policy, injected: true }).success, false);
  assert.equal(PolicySchema.safeParse({ ...policy, tools: { ...policy.tools, run_shell: true } }).success, false);
});
test("Root IDs and API requests reject invalid or extra fields", () => {
  const root = { id: "workspace_1", label: "Workspace", absolutePath: "/tmp/workspace", enabled: true, access: "read" };
  assert.equal(RootConfigSchema.safeParse(root).success, true);
  assert.equal(RootConfigSchema.safeParse({ ...root, id: "../../etc" }).success, false);
  assert.equal(RootConfigSchema.safeParse({ ...root, secret: "wrong" }).success, false);
  assert.equal(PatchToolRequestSchema.safeParse({ enabled: true, arbitrary: true }).success, false);
  assert.equal(ActivityQuerySchema.safeParse({ limit: "999" }).success, false);
  assert.equal(ActivityQuerySchema.parse({ limit: "25" }).limit, 25);
});
