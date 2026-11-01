import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  writeReleaseStatus, WRITE_RELEASE_BLOCKERS,
} from "../../src/server/access/write-release.ts";
import { defaultPolicy } from "../../src/server/contracts/index.ts";

test("M3.1 Write availability is fail-closed with no runtime override or permission upgrade", () => {
  const initial = writeReleaseStatus();
  assert.deepEqual(initial, {
    available: false,
    mode: "read-only",
    stage: "M3-security-gate",
    blockers: [...WRITE_RELEASE_BLOCKERS],
  });
  assert.equal(initial.blockers.length, 6);
  const changed = writeReleaseStatus();
  (changed.blockers as string[]).pop();
  assert.equal(writeReleaseStatus().blockers.length, 6);
  assert.equal(defaultPolicy().roots.length, 0);
  for (const tool of [
    "create_directory", "write_file", "edit_file", "rename_file", "delete_file",
  ] as const) {
    assert.equal(defaultPolicy().tools[tool], false, tool);
  }
});

test("M3.1 policy API returns blocked status without introducing a Write endpoint", async () => {
  const route = await fs.readFile("src/app/api/local/policy/route.ts", "utf8");
  const server = await fs.readFile("src/server/http/local-policy.ts", "utf8");
  assert.match(route, /import \{ writeReleaseStatus \}/);
  assert.equal((route.match(/writeRelease: writeReleaseStatus\(\)/g) || []).length, 4);
  assert.match(route, /mode: "read-only"/);
  assert.match(route, /ensureOwnerRequest\(request\)/);
  assert.equal((route.match(/ensureOwnerRequest\(request, true\)/g) || []).length, 3);
  assert.doesNotMatch(route, /export async function PUT\(/);
  assert.doesNotMatch(route, /mode: "read-write"|mode: "write"/);
  assert.match(server, /access: "read"/);
  assert.match(server, /Write tools remain disabled in the read-only alpha/);
  assert.doesNotMatch(server, /export async function grantWrite|export async function enableWrite/);
});

test("M3.1 remote and local stdio MCP still register read tools only", async () => {
  for (const file of ["src/server/mcp/http.ts", "src/server/mcp/stdio.ts"]) {
    const src = await fs.readFile(file, "utf8");
    for (const tool of ["list_roots", "list_files", "read_file", "search_files", "file_info"]) {
      assert.ok(src.includes('registerTool("' + tool + '"'), "Read tool missing in " + file + ": " + tool);
    }
    for (const tool of [
      "create_directory", "write_file", "edit_file", "rename_file", "delete_file",
    ]) {
      assert.ok(!src.includes('registerTool("' + tool + '"'),
        "Remote Write tool must remain unregistered: " + tool);
    }
  }
});

test("M3.1 write gate remains diagnostic and cannot be toggled by the Setup Wizard", async () => {
  const [gate, panel, wizard, policy] = await Promise.all([
    fs.readFile("src/server/access/write-release.ts", "utf8"),
    fs.readFile("src/features/setup-center/system-folder-panels.js", "utf8"),
    fs.readFile("src/app/setup-center/page.js", "utf8"),
    fs.readFile("src/features/setup-center/folder-policy.ts", "utf8"),
  ]);
  assert.match(gate, /Presentation\/diagnostic ONLY/);
  assert.doesNotMatch(gate, /process\.env|window|localStorage|request\.body/);
  assert.match(panel, /policyResponse\?\.writeRelease\?\.available === false/);
  assert.match(panel, /Mode Write masih dikunci/);
  assert.match(panel, /Read Only/);
  assert.doesNotMatch(panel, /access: "write"/);
  assert.match(wizard, /data\.policy\?\.mode !== "read-only"/);
  assert.doesNotMatch(policy, /access: "write"/);
});
