import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Dashboard policy API preserves read-only defaults and explicitly gated Write permissions", async () => {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-policy-test-"));
  const approved = path.join(state, "approved");
  await fs.mkdir(approved);
  const previous = process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR = state;
  try {
    const api = await import("../../src/server/http/local-policy.ts");
    const start = await api.getPolicy();
    assert.equal(start.roots.length, 0);
    assert.equal(start.tools.read_file, true);

    const added = await api.addReadOnlyRoot({ label: "Workspace", absolutePath: approved });
    assert.equal(added.roots.length, 1);
    assert.equal(added.roots[0].access, "read");
    assert.equal((await api.getPolicy()).roots.length, 1);
    const id = added.roots[0].id;

    // M2.2 inline wizard uses the same backend. Client-side form checks must
    // never bypass server-side root safety, overlap and read-only enforcement.
    const nested = path.join(approved, "nested");
    const hidden = path.join(state, ".hidden");
    await fs.mkdir(nested);
    await fs.mkdir(hidden);
    await assert.rejects(api.addReadOnlyRoot({ label: "Duplicate", absolutePath: approved }), /already approved/);
    await assert.rejects(api.addReadOnlyRoot({ label: "Nested", absolutePath: nested }), /Overlapping roots/);
    await assert.rejects(api.addReadOnlyRoot({ label: "Hidden", absolutePath: hidden }), /Hidden\/system/);
    await assert.rejects(api.addReadOnlyRoot({ label: "Relative", absolutePath: "relative/folder" }), /absolute/);
    await assert.rejects(api.addReadOnlyRoot({ label: "Home", absolutePath: os.homedir() }), /Whole-home/);
    if (process.platform !== "win32") {
      const alias = path.join(state, "alias");
      await fs.symlink(approved, alias, "dir");
      await assert.rejects(api.addReadOnlyRoot({ label: "Symlink", absolutePath: alias }), /symlinks/);
    }
    assert.equal((await api.getPolicy()).roots.length, 1);

    const disabled = await api.setRootEnabled({ type: "root", id, enabled: false });
    assert.equal(disabled.roots[0].enabled, false);

    const toolChanged = await api.setToolEnabled({ type: "tool", tool: "read_file", enabled: false });
    assert.equal(toolChanged.tools.read_file, false);
    const { writeBackendAvailable } = await import("../../src/server/files/secure-write.ts");
    for (const tool of ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"]) {
      if (writeBackendAvailable()) {
        const enabled = await api.setToolEnabled({ type: "tool", tool, enabled: true });
        assert.equal(enabled.tools[tool as keyof typeof enabled.tools], true);
        await api.setToolEnabled({ type: "tool", tool, enabled: false });
      } else {
        await assert.rejects(api.setToolEnabled({ type: "tool", tool, enabled: true }),
          /bubblewrap|Read Only/i);
      }
    }
    await assert.rejects(
      api.addReadOnlyRoot({ label: "No implicit escalation", absolutePath: approved, access: "write" }),
    );
    if (writeBackendAvailable()) {
      const upgraded = await api.setRootEnabled({ type: "root", id, enabled: true, access: "write" });
      assert.equal(upgraded.roots[0].access, "write");
      assert.equal(upgraded.roots.length, 1, "updating access must never add a duplicate folder");
      const downgraded = await api.setRootEnabled({ type: "root", id, access: "read" });
      assert.equal(downgraded.roots[0].access, "read");
    } else {
      await assert.rejects(
        api.setRootEnabled({ type: "root", id, enabled: true, access: "write" }),
        /bubblewrap|Read Only/i,
      );
    }

    const removed = await api.removeRoot({ id });
    assert.equal(removed.roots.length, 0);
    assert.equal((await api.getPolicy()).roots.length, 0);
    const remote = await fs.readFile("src/server/mcp/http.ts", "utf8");
    assert.match(remote, /if \(writeBackendAvailable\(\)\)/);
    for (const tool of ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"]) {
      assert.match(remote, new RegExp('server\\.registerTool\\("' + tool + '"'));
    }
  } finally {
    if (previous === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = previous;
    await fs.rm(state, { force: true, recursive: true });
  }
});
