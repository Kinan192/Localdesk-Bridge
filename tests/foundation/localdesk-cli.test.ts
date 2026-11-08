import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../..", import.meta.url));
const bin = path.join(root, "bin", "localdesk.mjs");

function callCli(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    timeout: 7000,
    env: { ...process.env, LOCAL_MCP_LAUNCH_SECRET: "" },
  });
}

test("localdesk global bin is declared, with a Node.js shebang and not published yet", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.bin.localdesk, "./bin/localdesk.mjs");
  assert.equal(manifest.private, true, "Do not accidentally publish in M1");
  const source = await fs.readFile(bin, "utf8");
  assert.ok(source.startsWith("#!/usr/bin/env node\n"));
});

test("localdesk --help works outside project root without starting or pairing", () => {
  const result = callCli("--help");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /localdesk --manual-services/);
  assert.match(result.stdout, /localdesk --windows-write-preview/);
  assert.doesNotMatch(result.stdout, /#owner-pair=/);
});

test("localdesk --version works outside project root and matches package", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const result = callCli("--version");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), manifest.version);
  assert.doesNotMatch(result.stdout, /#owner-pair=/);
});

test("localdesk refuses startup if installation/build is incomplete", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "localdesk-cli-incomplete-"));
  try {
    const mockBinDir = path.join(tmp, "bin");
    await fs.mkdir(mockBinDir);
    const mockBin = path.join(mockBinDir, "localdesk.mjs");
    await fs.copyFile(bin, mockBin);
    const result = spawnSync(process.execPath, [mockBin], {
      cwd: os.tmpdir(), encoding: "utf8", timeout: 7000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /incomplete or not built/);
    assert.doesNotMatch(result.stderr, /#owner-pair=/);
  } finally {
    await fs.rm(tmp, { force: true, recursive: true });
  }
});

test("localdesk refuses unexpected arguments without touching services", () => {
  const result = callCli("--remote-command", "anything");
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Unknown LocalDesk option/);
  assert.doesNotMatch(result.stderr, /#owner-pair=/);
});

test("localdesk start delegates to existing secure launcher without shell or caller cwd", async () => {
  const source = await fs.readFile(bin, "utf8");
  assert.match(source, /spawn\(process\.execPath/);
  assert.match(source, /tsxCli, launcher/);
  assert.match(source, /cwd: projectRoot, shell: false/);
  assert.match(source, /child\.kill\("SIGTERM"\)/);
  assert.match(source, /\.next", "BUILD_ID"/);
  assert.doesNotMatch(source, /exec\(|execSync\(|spawnSync\(/);
  assert.doesNotMatch(source, /cloudflared tunnel run|owner:pair/);
});
