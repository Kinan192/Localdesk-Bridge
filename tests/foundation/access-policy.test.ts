import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PolicyEngine } from "../../src/server/access/index.ts";
import { defaultPolicy } from "../../src/server/contracts/index.ts";

test("Access policy uses root ownership + tool toggle + read/write permissions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-policy-"));
  try {
    const projects = path.join(dir, "projects");
    const docs = path.join(dir, "docs");
    await fs.mkdir(projects); await fs.mkdir(docs);
    const p = defaultPolicy();
    p.roots = [
      { id: "projects", label: "Projects", absolutePath: projects, access: "write", enabled: true },
      { id: "documents", label: "Docs", absolutePath: docs, access: "read", enabled: true },
    ];
    const auth = await PolicyEngine.create(p);
    assert.equal(auth.enabledRoots().length, 2);
    assert.equal(auth.authorize("read_file", "projects")?.id, "projects");
    assert.throws(() => auth.authorize("write_file", "projects"), /not enabled/i);
    const updated = auth.snapshot();
    updated.tools.write_file = true;
    await auth.update(updated);
    assert.equal(auth.authorize("write_file", "projects")?.id, "projects");
    assert.throws(() => auth.authorize("write_file", "documents"), /read-only/i);
    updated.roots[0].enabled = false;
    await auth.update(updated);
    assert.throws(() => auth.authorize("read_file", "projects"), /not enabled/i);
    assert.throws(() => auth.authorize("read_file", "does-not-exist"), /not enabled/i);
    assert.throws(() => auth.authorize("read_file"), /required/i);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Overlapping or symlink roots are rejected, even if one is disabled", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-overlap-"));
  try {
    const nested = path.join(dir, "nested");
    await fs.mkdir(nested);
    const p = defaultPolicy();
    p.roots = [
      { id: "parent", label: "Parent", absolutePath: dir, access: "read", enabled: true },
      { id: "nested", label: "Nested", absolutePath: nested, access: "write", enabled: false },
    ];
    await assert.rejects(PolicyEngine.create(p), /overlapping/i);
    p.roots = [p.roots[0], { ...p.roots[0], id: "parent" }];
    await assert.rejects(PolicyEngine.create(p), /duplicate/i);
    const linked = path.join(dir, "symlink");
    await fs.symlink(nested, linked);
    p.roots = [{ id: "symlink", label: "Symlink", absolutePath: linked, enabled: true, access: "read" }];
    await assert.rejects(PolicyEngine.create(p), /symlink/i);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Failed policy update does not change the last valid state", async () => {
  const auth = await PolicyEngine.create(defaultPolicy());
  const invalid = auth.snapshot();
  invalid.roots.push({
    id: "missing", label: "Non-existing", absolutePath: "/unlikely/lmm/this-directory-does-not-exist",
    enabled: true, access: "write",
  });
  await assert.rejects(auth.update(invalid));
  assert.deepEqual(auth.snapshot(), defaultPolicy());
});
