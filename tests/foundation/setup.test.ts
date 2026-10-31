import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLocalClientSetup } from "../../src/server/setup/index.ts";

test("Client setup detects missing dependency paths and does not write config", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-wizard-"));
  try {
    const fakeNode = path.join(directory, "node");
    const cli = path.join(directory, "node_modules", "tsx", "dist", "cli.mjs");
    const entry = path.join(directory, "src", "server", "mcp", "stdio.ts");
    const empty = await getLocalClientSetup({
      projectDirectory: directory,
      nodeExecutable: fakeNode,
      platform: "linux",
      homeDirectory: directory,
    });
    assert.equal(empty.dependenciesReady, false);
    assert.equal(empty.missing.length, 3);
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.mkdir(path.dirname(entry), { recursive: true });
    for (const file of [fakeNode, cli, entry]) await fs.writeFile(file, "");
    const ready = await getLocalClientSetup({
      projectDirectory: directory,
      nodeExecutable: fakeNode,
      platform: "linux",
      homeDirectory: directory,
    });
    assert.equal(ready.dependenciesReady, true);
    assert.deepEqual(ready.args, [cli, entry]);
    assert.equal(ready.desktopConfigFile, path.join(directory, ".config", "Claude", "claude_desktop_config.json"));
    assert.equal(await fs.stat(directory).then(info => info.isDirectory()), true);
  } finally {
    await fs.rm(directory, { force: true, recursive: true });
  }
});

test("Setup wizard supports Windows and macOS config paths", async () => {
  const windows = await getLocalClientSetup({
    platform: "win32",
    projectDirectory: "/does-not-exist",
    nodeExecutable: "/does-not-exist/node",
    homeDirectory: "/fake-home",
    appData: "/winappdata",
  });
  assert.equal(windows.desktopConfigFile, path.join("/winappdata", "Claude", "claude_desktop_config.json"));

  const mac = await getLocalClientSetup({
    platform: "darwin",
    projectDirectory: "/does-not-exist",
    nodeExecutable: "/does-not-exist/node",
    homeDirectory: "/fake-home",
  });
  assert.equal(mac.desktopConfigFile, path.join("/fake-home", "Library", "Application Support", "Claude", "claude_desktop_config.json"));
});
