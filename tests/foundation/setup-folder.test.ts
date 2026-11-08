import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  newReadRoot, newFolderRoot, rootEnabledChange, rootAccessChange, rootRemoval,
} from "../../src/features/setup-center/folder-policy.ts";

test("foundation typecheck supports Next.js route imports and browser wizard helpers", async () => {
  const config = JSON.parse(await fs.readFile("tsconfig.foundation.json", "utf8"));
  const compiler = config.compilerOptions;
  assert.equal(compiler.module, "esnext");
  assert.equal(compiler.moduleResolution, "bundler");
  assert.ok(compiler.lib.includes("DOM"));
  assert.ok(compiler.lib.includes("DOM.Iterable"));
  assert.equal(compiler.allowJs, true);
  assert.equal(compiler.paths["@/*"][0], "./src/*");
  assert.equal(compiler.strict, true);
  assert.equal(compiler.noEmit, true);
});

test("M2.2 add-root payload grants no Write permission and trims inputs", () => {
  const value = newReadRoot("  Dokumen kerja  ", "  /home/tester/Projects/kerja  ");
  assert.deepEqual(value, {
    label: "Dokumen kerja", absolutePath: "/home/tester/Projects/kerja",
  });
  assert.equal(Object.hasOwn(value, "access"), false);
  assert.equal(Object.hasOwn(value, "enabled"), false);
  // Server remains responsible for absolute-path/overlap/symlink/hidden checks.
  assert.deepEqual(newReadRoot("Work", "relative/folder"), {
    label: "Work", absolutePath: "relative/folder",
  });
});

test("M2.2 invalid or oversized form fields fail before server request", () => {
  for (const label of ["", "   ", "a".repeat(81)]) {
    assert.throws(() => newReadRoot(label, "/approved"), /Nama folder/);
  }
  for (const path of ["", "  ", "x".repeat(4097)]) {
    assert.throws(() => newReadRoot("Workspace", path), /Path folder/);
  }
  assert.throws(() => newReadRoot(null as unknown as string, "/approved"), /teks/);
});

test("M2.2 root toggle and revoke payloads are strict and contain no access escalation", () => {
  assert.deepEqual(rootEnabledChange("root-id", false), {
    type: "root", id: "root-id", enabled: false,
  });
  assert.deepEqual(rootEnabledChange("root-id", true), {
    type: "root", id: "root-id", enabled: true,
  });
  assert.deepEqual(rootRemoval("root-id"), { id: "root-id" });
  assert.throws(() => rootEnabledChange("", true), /ID folder/);
  assert.throws(() => rootEnabledChange("a".repeat(81), true), /ID folder/);
  assert.throws(() => rootEnabledChange("ok", "write" as unknown as boolean), /Status folder/);
  assert.throws(() => rootRemoval(""), /ID folder/);
});

test("M3 inline panels expose explicit Read Only and Read & Write choices", async () => {
  const page = await fs.readFile("src/app/setup-center/page.js", "utf8");
  const components = await fs.readFile("src/features/setup-center/system-folder-panels.js", "utf8");
  const steps = await fs.readFile("src/features/setup-center/steps.js", "utf8");
  assert.match(page, /<SystemCheckPanel system=\{system\}/);
  assert.match(page, /<FolderAccessPanel policyResponse=\{data\?\.policy\}/);
  assert.match(page, /changeFolder\("POST", payload/);
  assert.match(page, /changeFolder\("PATCH", rootEnabledChange\(/);
  assert.match(page, /changeFolder\("DELETE", rootRemoval\(/);
  assert.match(page, /credentials: "same-origin"/);
  assert.match(page, /"X-Local-MCP-Action": "dashboard"/);
  assert.match(page, /data\?\.paired !== true/);
  assert.match(page, /policyMutationInFlight\.current/);
  assert.match(page, /\["read-only", "read-write"\]\.includes\(value\.mode\)/);
  assert.match(components, /\["read-only", "read-write"\]\.includes/);
  assert.match(components, /const submitting = busy \|\| !available/);
  assert.match(components, /onAccess/);
  assert.match(components, /Read &amp; Write/);
  assert.match(components, /window\.confirm\(/);
  assert.match(components, /File aslinya tidak akan dihapus/);
  assert.match(components, /system\.dependenciesReady/);
  assert.match(components, /system\.cloudflaredPresent/);
  assert.match(components, /Binary Cloudflared yang tersedia belum membuktikan Tunnel Healthy/);
  assert.match(components, /<label htmlFor="setup-root-path"/);
  assert.match(components, /<form/);
  assert.match(steps, /id: "folders".*href: null/);
  assert.doesNotMatch(components, /localStorage|sessionStorage|token=/);
});

test("M3 folder dialog JSX closes correctly and notices distinguish delete, warning, success", async () => {
  const dialog = await fs.readFile("src/components/layout/dashboard-dialogs.tsx", "utf8");
  const setup = await fs.readFile("src/app/setup-center/page.js", "utf8");
  assert.match(dialog, /\{folderError && <p[^>]*>\{folderError\}<\/p>\}/);
  assert.match(setup, /const removingAccess = method === "DELETE"/);
  assert.match(setup, /setNoticeTone\(removingAccess \? "delete" : reducingAccess \? "warning" : "success"\)/);
  assert.match(setup, /Folder beserta file aslinya tetap ada di disk/);
  assert.match(setup, /noticeTone === "delete"/);
  assert.match(setup, /role=\{noticeTone === "warning" \? "alert" : "status"\}/);
  // Refresh must not wipe an error message immediately after a failed mutation.
  assert.match(setup, /if \(approved\) void refresh\(\)/);
  assert.match(setup, /if \(changed\) void refresh\(\)/);
});

test("M2.2 policy mutations stay behind existing owner authorization and filesystem checks", async () => {
  const route = await fs.readFile("src/app/api/local/policy/route.ts", "utf8");
  const service = await fs.readFile("src/server/http/local-policy.ts", "utf8");
  const engine = await fs.readFile("src/server/access/index.ts", "utf8");
  assert.match(route, /ensureOwnerRequest\(request, true\)/);
  assert.match(route, /await addReadOnlyRoot\(/);
  assert.match(route, /await setRootEnabled\(/);
  assert.match(route, /await removeRoot\(/);
  assert.match(service, /access: data\.access/);
  assert.match(service, /NewRoot = z\.object\(/);
  assert.match(service, /\.strict\(\)/);
  assert.match(engine, /Overlapping roots are not supported/);
  assert.match(engine, /not symlinks/);
  assert.match(engine, /Whole-home and whole-disk access are not allowed/);
});
