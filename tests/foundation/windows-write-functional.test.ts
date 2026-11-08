import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { defaultPolicy } from "../../src/server/contracts/index.ts";
import { PolicyEngine } from "../../src/server/access/index.ts";
import { authorizedMutation, writeBackendAvailable } from "../../src/server/files/secure-write.ts";
import { FileEngine } from "../../src/server/files/index.ts";

test("Windows capability probe validates actual mutations before Write activation", {
  skip: process.platform !== "win32" || process.env.LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL !== "1",
}, () => {
  assert.equal(writeBackendAvailable(), true, "Windows write worker self-test failed");
});

test("Windows MCP Write respects approved root, paths, version checks and reparse points", {
  skip: process.platform !== "win32" || process.env.LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL !== "1",
}, async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "localdesk-win-write-test-"));
  try {
    const root = path.join(base, "Approved Folder");
    const outside = path.join(base, "Outside Folder");
    await fs.mkdir(root);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "outside.txt"), "NEVER MODIFY");
    const policy = defaultPolicy();
    policy.roots = [
      { id: "allowed", label: "Allowed", absolutePath: root, enabled: true, access: "write" },
      { id: "outside", label: "Outside", absolutePath: outside, enabled: false, access: "read" },
    ];
    for (const tool of ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"] as const)
      policy.tools[tool] = true;
    const engine = await PolicyEngine.create(policy);
    const files = new FileEngine(engine);

    await authorizedMutation(engine, "allowed", { tool: "create_directory", path: "Project Code" });
    await authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "Project Code\\index.astro", content: "---\\n---\\n<h1>Works</h1>\\n",
    });
    // Dotfile allowlist and common frontend file types must work without
    // exposing hidden secrets or arbitrary dotfiles.
    await authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "Project Code\\.gitignore", content: "node_modules/\n",
    });
    await authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "Project Code\\favicon.svg",
      content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "Project Code\\.env", content: "SECRET=never",
    }));
    const read = await files.readFile("allowed", "Project Code\\index.astro");
    assert.equal(read.content, "---\\n---\\n<h1>Works</h1>\\n");
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "Project Code\\index.astro", content: "overwrite",
    }));
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "..\\Outside Folder\\outside.txt", content: "escape",
    }));
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "C:\\Windows\\escape.txt", content: "escape",
    }));
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "edit_file", path: "Project Code\\index.astro", content: "wrong revision",
      expectedSha256: "0".repeat(64),
    }));
    const newContent = "# updated\\n";
    await authorizedMutation(engine, "allowed", {
      tool: "edit_file", path: "Project Code\\index.astro",
      content: newContent, expectedSha256: read.sha256,
    });
    assert.equal((await files.readFile("allowed", "Project Code\\index.astro")).content, newContent);

    await fs.writeFile(path.join(root, "Project Code", "existing.md"), "PRESERVE");
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "rename_file", path: "Project Code\\index.astro",
      destination: "Project Code\\existing.md",
    }));
    await authorizedMutation(engine, "allowed", {
      tool: "rename_file", path: "Project Code\\index.astro",
      destination: "Project Code\\renamed.astro",
    });

    await fs.symlink(outside, path.join(root, "linked"), "junction");
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "linked\\should-not-exist.md", content: "unsafe",
    }));

    const hard = path.join(root, "Project Code", "hard.txt");
    await fs.link(path.join(outside, "outside.txt"), hard);
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "edit_file", path: "Project Code\\hard.txt", content: "unsafe",
      expectedSha256: createHash("sha256").update("NEVER MODIFY").digest("hex"),
    }));
    assert.equal(await fs.readFile(path.join(outside, "outside.txt"), "utf8"), "NEVER MODIFY");
    assert.equal(await fs.readFile(path.join(root, "Project Code", "existing.md"), "utf8"), "PRESERVE");

    const downgraded = engine.snapshot();
    downgraded.roots[0].access = "read";
    await engine.update(downgraded);
    await assert.rejects(authorizedMutation(engine, "allowed", {
      tool: "write_file", path: "Project Code\\blocked.md", content: "deny",
    }), /read-only|permission/i);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
