import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { writeReleaseStatus } from "../../src/server/access/write-release.ts";
import { writeBackendAvailable } from "../../src/server/files/secure-write.ts";
import { defaultPolicy } from "../../src/server/contracts/index.ts";

test("Write release never enables permissions by default and requires a working sandbox", () => {
  const status = writeReleaseStatus();
  assert.equal(status.available, writeBackendAvailable());
  assert.equal(status.mode, status.available ? "read-write" : "read-only");
  assert.equal(defaultPolicy().roots.length, 0);
  for (const name of ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"] as const) {
    assert.equal(defaultPolicy().tools[name], false);
  }
  if (!status.available) assert.ok(status.blockers.length > 0);
});

test("Write policy API stays protected by local owner and CSRF checks", async () => {
  const [route, policy, panel] = await Promise.all([
    fs.readFile("src/app/api/local/policy/route.ts", "utf8"),
    fs.readFile("src/server/http/local-policy.ts", "utf8"),
    fs.readFile("src/features/setup-center/system-folder-panels.js", "utf8"),
  ]);
  assert.equal((route.match(/ensureOwnerRequest\(request, true\)/g) || []).length, 3);
  assert.match(route, /writeReleaseStatus\(\)\.mode/);
  assert.match(policy, /requireWritableBackend\(\)/);
  assert.match(policy, /data\.access === "write"/);
  assert.match(panel, /Read &amp; Write/);
  assert.match(panel, /onAccess/);
  assert.match(panel, /onApproveDelete/);
});

test("MCP write tools are only registered behind a supported sandbox capability", async () => {
  const http = await fs.readFile("src/server/mcp/http.ts", "utf8");
  const stdio = await fs.readFile("src/server/mcp/stdio.ts", "utf8");
  for (const name of ["list_roots", "list_files", "read_file", "search_files", "file_info"]) {
    assert.match(http, new RegExp('registerTool\\("' + name + '"'));
    assert.match(stdio, new RegExp('registerTool\\("' + name + '"'));
  }
  assert.match(http, /if \(writeBackendAvailable\(\)\)/);
  for (const name of ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"]) {
    assert.match(http, new RegExp('registerTool\\("' + name + '"'));
  }
});

test("M3 dashboard renders saved Write tool switches instead of forcing them OFF", async () => {
  const dashboard = await fs.readFile("src/context/dashboard-context.tsx", "utf8");
  const toolsPage = await fs.readFile("src/features/mcp-tools/tools-page.tsx", "utf8");
  const policyService = await fs.readFile("src/server/http/local-policy.ts", "utf8");

  // After a PATCH response and after page refresh, both Read and Write state
  // must come from the saved policy. Previously every Write switch was
  // hardcoded false despite a successful PATCH.
  assert.match(dashboard, /enabled:\s*policy\.tools\[tool\.id\] === true/);
  assert.doesNotMatch(dashboard, /enabled:\s*tool\.kind === "read"\s*\?/);
  assert.match(dashboard, /changePolicy\("PATCH",\s*\{ type: "tool", tool: id, enabled \}\)/);
  assert.match(dashboard, /policyMatchesChange\(updated, method, body\)/);
  assert.match(dashboard, /const persisted = await policyRequest\("GET"\)/);
  assert.match(dashboard, /policyMatchesChange\(persisted, method, body\)/);
  assert.doesNotMatch(dashboard, /Local policy saved\. MCP changes take effect on the next client connection\./);
  assert.match(toolsPage, /onChange=\{value => \{ void updateTool\(tool\.id, value\); \}\}/);
  assert.match(policyService, /policy\.tools\[data\.tool\] = data\.enabled/);
});

test("M3 Add Folder reuses an already approved folder and updates its permission", async () => {
  const dashboard = await fs.readFile("src/context/dashboard-context.tsx", "utf8");
  const dialog = await fs.readFile("src/components/layout/dashboard-dialogs.tsx", "utf8");
  const policy = await fs.readFile("src/server/http/local-policy.ts", "utf8");
  assert.match(dashboard, /const current = await policyRequest\("GET"\)/);
  assert.match(dashboard, /const existing = current\.roots\.find\(/);
  assert.match(dashboard, /normalize\(root\.absolutePath\) === normalize\(absolutePath\)/);
  assert.match(dashboard, /await changePolicy\("PATCH", \{/);
  assert.match(dashboard, /type: "root", id: existing\.id, access: folderAccess, enabled: true/);
  assert.match(dashboard, /await changePolicy\("POST", \{ label, absolutePath, access: folderAccess \}\)/);
  assert.match(dialog, /existingFolder/);
  assert.match(dialog, /Update permission/);
  assert.match(policy, /Folder already approved\./);
});

test("M3 folder modal JSX parses and shows clear duplicate and error feedback", async () => {
  const ts = await import("typescript");
  const dialog = await fs.readFile("src/components/layout/dashboard-dialogs.tsx", "utf8");
  const result = ts.transpileModule(dialog, {
    fileName: "dashboard-dialogs.tsx",
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
  });
  const errors = (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  assert.match(dialog, /\{folderError && <p[^>]*role="alert"[^>]*>\{folderError\}<\/p>\}/);
  assert.match(dialog, /Update permission/);
});

test("M3 notifications differentiate success, revocation warnings and actual errors", async () => {
  const dashboard = await fs.readFile("src/context/dashboard-context.tsx", "utf8");
  const shell = await fs.readFile("src/components/layout/app-shell.tsx", "utf8");
  const css = await fs.readFile("src/styles/features.css", "utf8");
  const setup = await fs.readFile("src/app/setup-center/page.js", "utf8");
  assert.match(dashboard, /toastTone,folderModal/);
  assert.match(dashboard, /setToastTone\(tone\)/);
  assert.match(dashboard, /Akses folder dicabut dari MCP\. Folder dan file asli di disk tidak dihapus\./);
  assert.match(dashboard, /notify\("Gagal memperbarui izin: "[^;]*"error"\)/);
  assert.match(shell, /toastTone === "error" \? "toast-error"/);
  assert.match(shell, /toastTone === "warning" \? <AlertTriangle/);
  assert.match(shell, /role=\{toastTone === "error" \? "alert" : "status"\}/);
  assert.match(css, /\.toast-warning \{/);
  assert.match(css, /\.toast-error \{/);
  assert.match(setup, /setNoticeTone\(removingAccess \? "delete" : reducingAccess \? "warning" : "success"\)/);
  assert.match(setup, /Folder beserta file aslinya tetap ada di disk/);
  assert.match(setup, /noticeTone === "delete"/);
  assert.match(setup, /File BELUM dihapus/);
});

test("Remote MCP audit records outcome after mutation instead of claiming success early", async () => {
  const http = await fs.readFile("src/server/mcp/http.ts", "utf8");
  const writeFunction = http.slice(http.indexOf("async function writeOperation("),
    http.indexOf("async function record("));
  assert.match(writeFunction, /return authorizedMutation\(policy, rootId, intent\)/);
  assert.doesNotMatch(writeFunction, /result: "allowed"/);
  assert.match(http, /const value = await operation\(\)/);
  assert.match(http, /await record\(tool, rootId, "allowed"\)/);
});

test("Sandbox accepts only a single approved writable mount and does not execute shell commands", async () => {
  const src = await fs.readFile("src/server/files/secure-write.ts", "utf8");
  const worker = await fs.readFile("src/server/files/write-worker.mjs", "utf8");
  assert.match(src, /"--ro-bind", "\/", "\/"/);
  assert.match(src, /"--bind", "\/proc\/self\/fd\/3", "\/tmp\/localdesk-root"/);
  assert.match(src, /shell: false/);
  assert.match(worker, /O_EXCL/);
  assert.doesNotMatch(worker, /child_process|exec\(|spawn\(/);
});

