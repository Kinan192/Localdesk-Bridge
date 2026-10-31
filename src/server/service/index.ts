import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CloudflareSettingsRepository, resolveCloudflareConfig } from "../cloudflare/index.ts";
import type { RemoteConfig } from "../mcp/remote-config.ts";

export type ManagedServiceState = "stopped" | "starting" | "running" | "stopping" | "error";
export type ManagedServiceStatus = {
  state: ManagedServiceState;
  managed: boolean;
  pid: number | null;
  startedAt: string | null;
  lastError: string | null;
};

/**
 * The only permitted child process is the MCP HTTP entrypoint inside this
 * installation. No caller-supplied paths, shell arguments, scripts or commands.
 */
export async function resolveManagedLaunch(directory: string, nodeExecutable: string) {
  if (!path.isAbsolute(directory) || !path.isAbsolute(nodeExecutable)) {
    throw new Error("Service installation requires absolute paths.");
  }
  const packageFile = path.join(directory, "package.json");
  const cli = path.join(directory, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(directory, "src", "server", "mcp", "http.ts");
  let packageInfo: { name?: string };
  try {
    const file = await fs.readFile(packageFile, "utf8");
    if (Buffer.byteLength(file, "utf8") > 64 * 1024) throw new Error("Unexpected package file.");
    packageInfo = JSON.parse(file) as { name?: string };
  } catch {
    throw new Error("Local MCP Manager installation not found.");
  }
  if (packageInfo.name !== "local-mcp-manager") {
    throw new Error("Unrecognized Local MCP Manager installation.");
  }
  // Homebrew and system installers may expose Node through a symlink.
  // process.execPath is selected by the runtime, not by an API caller.
  try {
    if (!(await fs.stat(nodeExecutable)).isFile()) throw new Error("Not a Node executable.");
  } catch { throw new Error("Node runtime executable is missing."); }

  for (const filename of [cli, entry]) {
    let stat;
    try { stat = await fs.lstat(filename); }
    catch { throw new Error("Local MCP Manager runtime dependency is missing."); }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Unsafe or missing MCP runtime dependency.");
    }
  }
  return { command: nodeExecutable, args: [cli, entry] as [string, string], cwd: directory };
}

export function runtimeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Only forward variables needed to run Node and resolve the local policy.
  const allowlist = [
    "PATH", "HOME", "USER", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
    "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "SystemRoot", "WINDIR",
    "TMP", "TEMP", "TMPDIR", "LANG", "LC_ALL",
    "LOCAL_MCP_STATE_DIR", "CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD",
    "MCP_PUBLIC_HOSTNAME", "MCP_HTTP_PORT",
  ] as const;
  const selected: NodeJS.ProcessEnv = { NODE_ENV: source.NODE_ENV ?? "production" };
  for (const key of allowlist) if (source[key] !== undefined) selected[key] = source[key];
  return selected;
}

async function probeProtectedMcp(port: number): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:" + port + "/mcp", {
      method: "GET", signal: AbortSignal.timeout(450),
    });
    return response.status === 401;
  } catch { return false; }
}

async function portResponds(port: number): Promise<boolean> {
  // Check any TCP service, not just our MCP endpoint. Refuse startup if bound.
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(400);
    let completed = false;
    const done = (value: boolean) => {
      if (completed) return;
      completed = true;
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(true)); // Unknown: safest to refuse.
  });
}

/**
 * In-process, single-instance alpha supervisor. It owns only child processes
 * it spawned. No PID-file adoption or killing other services.
 *
 * For packaged multi-process releases this must move to an OS-native helper.
 */
export class RemoteMcpSupervisor {
  private state: ManagedServiceState = "stopped";
  private child: ChildProcess | null = null;
  private startedAt: string | null = null;
  private lastError: string | null = null;
  private shutdownHandler: (() => void) | null = null;

  status(): ManagedServiceStatus {
    return {
      state: this.state, managed: this.child !== null,
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt, lastError: this.lastError,
    };
  }

  async start(): Promise<ManagedServiceStatus> {
    if (this.child || this.state === "starting" || this.state === "stopping") {
      throw new Error("MCP HTTP service is already managed or changing state.");
    }
    this.state = "starting";
    this.lastError = null;
    this.startedAt = null;
    let spawned: ChildProcess | null = null;
    try {
      const config: RemoteConfig = await resolveCloudflareConfig({
        CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
        CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
        MCP_PUBLIC_HOSTNAME: process.env.MCP_PUBLIC_HOSTNAME,
        MCP_HTTP_PORT: process.env.MCP_HTTP_PORT,
      }, new CloudflareSettingsRepository());
      const launch = await resolveManagedLaunch(process.cwd(), process.execPath);
      if (await portResponds(config.port)) {
        throw new Error("MCP HTTP port is already in use; refusing to modify an unmanaged process.");
      }
      const child = spawn(launch.command, launch.args, {
        cwd: launch.cwd, shell: false, detached: false, windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: runtimeEnvironment(process.env),
      });
      spawned = child;
      this.child = child;
      const onChildExit = (code: number | null) => {
        if (this.child !== child) return;
        this.child = null;
        if (this.shutdownHandler) {
          process.off("exit", this.shutdownHandler);
          this.shutdownHandler = null;
        }
        this.startedAt = null;
        if (this.state === "stopping") {
          this.state = "stopped";
          this.lastError = null;
        } else {
          this.state = "error";
          this.lastError = code === 0 ? "MCP HTTP server exited." : "MCP HTTP server stopped unexpectedly.";
        }
      };
      child.on("exit", onChildExit);
      child.on("error", () => onChildExit(1));
      child.stderr?.on("data", () => {
        // Deliberately do not retain process output or potentially sensitive details.
      });
      this.shutdownHandler = () => { if (this.child === child) child.kill("SIGTERM"); };
      process.once("exit", this.shutdownHandler);

      for (let i = 0; i < 40; i++) {
        if (this.child !== child) throw new Error("MCP HTTP server exited during startup.");
        if (await probeProtectedMcp(config.port)) {
          this.state = "running";
          this.startedAt = new Date().toISOString();
          return this.status();
        }
        await delay(125);
      }
      throw new Error("MCP HTTP did not reach a protected 401 response.");
    } catch (error) {
      if (spawned && this.child === spawned) {
        this.child = null;
        spawned.kill("SIGTERM");
      }
      if (this.shutdownHandler) {
        process.off("exit", this.shutdownHandler);
        this.shutdownHandler = null;
      }
      this.state = "error";
      this.startedAt = null;
      this.lastError = error instanceof Error ? error.message : "MCP start failed.";
      throw error;
    }
  }

  async stop(): Promise<ManagedServiceStatus> {
    if (this.state === "starting") throw new Error("MCP is still starting.");
    const child = this.child;
    if (!child) {
      if (this.state === "error") this.state = "stopped";
      this.lastError = null;
      return this.status();
    }
    if (this.state === "stopping") throw new Error("MCP is already stopping.");
    this.state = "stopping";
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    try { child.kill("SIGTERM"); }
    catch { /* Resolve via exit/timeout below. */ }
    await Promise.race([exited, delay(1800)]);
    if (this.child === child) {
      child.kill("SIGKILL");
      await Promise.race([exited, delay(700)]);
    }
    if (this.child === child) {
      throw new Error("Could not confirm MCP process termination.");
    }
    return this.status();
  }
}

declare global {
  // Across Next.js dev hot reloads in the same Node process.
  // Not a distributed process supervisor or persistence mechanism.
  var __localMcpSupervisor: RemoteMcpSupervisor | undefined;
}

export const remoteMcpSupervisor = globalThis.__localMcpSupervisor ??
  (globalThis.__localMcpSupervisor = new RemoteMcpSupervisor());
