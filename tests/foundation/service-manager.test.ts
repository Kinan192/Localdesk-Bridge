import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RemoteMcpSupervisor, resolveManagedLaunch, runtimeEnvironment } from "../../src/server/service/index.ts";

test("Service manager starts stopped and never adopts or kills an unmanaged process", async () => {
  const supervisor = new RemoteMcpSupervisor();
  assert.deepEqual(supervisor.status(), {
    state: "stopped", managed: false, pid: null, startedAt: null, lastError: null,
  });
  const stopped = await supervisor.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.managed, false);
});

test("Managed launcher has fixed node/tsx/MCP HTTP arguments, no shell or custom command", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lmm-managed-launch-"));
  const node = path.join(folder, "mock-node");
  try {
    await fs.mkdir(path.join(folder, "node_modules", "tsx", "dist"), { recursive: true });
    await fs.mkdir(path.join(folder, "src", "server", "mcp"), { recursive: true });
    await fs.writeFile(path.join(folder, "package.json"), JSON.stringify({ name: "local-mcp-manager" }));
    await fs.writeFile(node, "");
    await fs.writeFile(path.join(folder, "node_modules", "tsx", "dist", "cli.mjs"), "");
    await fs.writeFile(path.join(folder, "src", "server", "mcp", "http.ts"), "");
    const launch = await resolveManagedLaunch(folder, node);
    assert.equal(launch.command, node);
    assert.equal(launch.cwd, folder);
    assert.deepEqual(launch.args, [
      path.join(folder, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(folder, "src", "server", "mcp", "http.ts"),
    ]);
    assert.equal(launch.args.some(arg => arg.includes("sh -c")), false);
    if (process.platform !== "win32") {
      // macOS/Homebrew commonly exposes Node via a symlink.
      const linkedNode = path.join(folder, "linked-node");
      await fs.symlink(node, linkedNode);
      assert.equal((await resolveManagedLaunch(folder, linkedNode)).command, linkedNode);
      // Project entrypoints must still be real files, not redirected symlinks.
      const entry = path.join(folder, "src", "server", "mcp", "http.ts");
      await fs.rm(entry);
      await fs.symlink(node, entry);
      await assert.rejects(() => resolveManagedLaunch(folder, node), /Unsafe/);
      await fs.unlink(entry);
      await fs.writeFile(entry, "");
    }
    await fs.writeFile(path.join(folder, "package.json"), JSON.stringify({ name: "untrusted" }));
    await assert.rejects(() => resolveManagedLaunch(folder, node), /Unrecognized/);
    await fs.writeFile(path.join(folder, "package.json"), JSON.stringify({ name: "local-mcp-manager" }));
    await fs.rm(path.join(folder, "src", "server", "mcp", "http.ts"));
    await assert.rejects(() => resolveManagedLaunch(folder, node), /missing/);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("Service process environment drops unexpected secrets and command injection variables", () => {
  const environment = runtimeEnvironment({
    NODE_ENV: "test", PATH: "/bin",
    HOME: "/tmp", LOCAL_MCP_STATE_DIR: "/tmp/state",
    CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    CF_ACCESS_AUD: "some-audience",
    LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL: "1",
    NODE_OPTIONS: "--require malicious-script",
    CLOUDFLARE_API_TOKEN: "secret", OTHER_APP_PRIVATE_KEY: "secret",
  });
  assert.equal(environment.PATH, "/bin");
  assert.equal(environment.LOCAL_MCP_STATE_DIR, "/tmp/state");
  assert.equal(environment.CF_ACCESS_AUD, "some-audience");
  assert.equal(environment.LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL, "1");
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(environment.OTHER_APP_PRIVATE_KEY, undefined);
  assert.equal(environment.NODE_ENV, "test");
});
