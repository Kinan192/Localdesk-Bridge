import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { CloudflareCredentialVault } from "../credentials/index.ts";
import { DeploymentRepository, type DeploymentRecord } from "../cloudflare/deployment-state.ts";
import { CloudflareSettingsRepository } from "../cloudflare/index.ts";
import { cloudflareRequest, CloudflareApiError, type CloudflareRequester } from "../cloudflare/provisioning-api.ts";
import { remoteMcpSupervisor, runtimeEnvironment } from "../service/index.ts";
import type { RemoteConfig } from "../mcp/remote-config.ts";

export type TunnelFailureStage =
  | "deployment" | "local-config" | "api-credential" | "tunnel-lookup"
  | "connector-token" | "token-format" | "cloudflared-launch" | "cloudflared-exit";

export type TunnelProcessStatus = {
  state: "stopped" | "starting" | "running" | "stopping" | "error";
  managed: boolean;
  pid: number | null;
  tunnelId: string | null;
  startedAt: string | null;
  lastError: string | null;
  failureStage: TunnelFailureStage | null;
  cloudflareHttpStatus: number | null;
};

class TunnelStartFailure extends Error {
  constructor(
    public readonly stage: TunnelFailureStage,
    public readonly cloudflareHttpStatus: number | null = null,
  ) {
    super("Start Tunnel gagal pada tahap " + stage +
      (cloudflareHttpStatus === null ? "" : " (Cloudflare HTTP " + cloudflareHttpStatus + ")") +
      ". Periksa status Tunnel di Cloudflare, token API, dan proses cloudflared lokal.");
    this.name = "TunnelStartFailure";
  }
}

/** Accept standard padded Base64 as well as URL-safe variants; no whitespace or control characters. */
function validConnectorToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 33 && value.length <= 8192 &&
    new RegExp("^eyJ[A-Za-z0-9+/_.-]+={0,2}$").test(value);
}

// Deliberately never write connector tokens to disk, CLI arguments or logs.
// A remote-managed tunnel token is sensitive; anyone possessing it can run it.
export function connectorEnvironment(token: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!validConnectorToken(token)) {
    throw new Error("Cloudflare returned an invalid Tunnel connector token.");
  }
  return { ...runtimeEnvironment(source), TUNNEL_TOKEN: token };
}

export async function fetchDedicatedTunnelToken(
  record: DeploymentRecord,
  apiToken: string,
  api: CloudflareRequester = cloudflareRequest(),
): Promise<string> {
  if (!record.tunnelId || !record.accessAppId ||
      !["tunnel-ready", "published"].includes(record.phase)) {
    throw new Error("Dedicated Tunnel is not recorded in a provisioned deployment.");
  }
  const target = "/accounts/" + record.accountId + "/cfd_tunnel/" + record.tunnelId;
  let remote: unknown;
  try {
    remote = await api("GET", target, apiToken);
  } catch (error) {
    throw new TunnelStartFailure("tunnel-lookup",
      error instanceof CloudflareApiError ? error.httpStatus : null);
  }
  if (!remote || typeof remote !== "object" || Array.isArray(remote) ||
      !("id" in remote) || remote.id !== record.tunnelId ||
      ("deleted_at" in remote && remote.deleted_at !== null)) {
    throw new Error("Cloudflare Tunnel identity could not be verified.");
  }
  let token: unknown;
  try {
    token = await api("GET", target + "/token", apiToken);
  } catch (error) {
    throw new TunnelStartFailure("connector-token",
      error instanceof CloudflareApiError ? error.httpStatus : null);
  }
  if (!validConnectorToken(token)) {
    throw new TunnelStartFailure("token-format");
  }
  return token;
}

export function assertTunnelLocalConfiguration(
  record: DeploymentRecord | null,
  config: RemoteConfig | null,
  mcpRunning: boolean,
): asserts record is DeploymentRecord {
  if (!record || !record.tunnelId || !record.accessAppId || !record.aud ||
      !["tunnel-ready", "published"].includes(record.phase)) {
    throw new Error("Cloudflare Setup must have a verified Access app and a dedicated Tunnel first.");
  }
  if (!config || config.publicHostname !== record.hostname ||
      config.applicationAudience !== record.aud || config.port !== 8401) {
    throw new Error("Remote MCP config must match this deployment's hostname, Access AUD and port 8401.");
  }
  if (!mcpRunning) {
    throw new Error("Start the protected Remote MCP HTTP service first.");
  }
}

type TunnelDependencies = {
  getDeployment: () => Promise<DeploymentRecord | null>;
  getConfig: () => Promise<RemoteConfig | null>;
  getApiCredential: (accountId: string) => string;
  api: CloudflareRequester;
  isMcpRunning: () => boolean;
  launch: (token: string) => ChildProcess;
  startupDelayMs: number;
};

const defaults: TunnelDependencies = {
  getDeployment: () => new DeploymentRepository().load(),
  getConfig: () => new CloudflareSettingsRepository().load(),
  getApiCredential: accountId =>
    new CloudflareCredentialVault().read({ kind: "cloudflare-api-token", accountId }),
  api: cloudflareRequest(),
  isMcpRunning: () => remoteMcpSupervisor.status().state === "running",
  launch: token => spawn("cloudflared", ["tunnel", "run"], {
    cwd: process.cwd(),
    shell: false,
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: connectorEnvironment(token, process.env),
  } satisfies SpawnOptions),
  startupDelayMs: 1200,
};

/**
 * Owns exactly one child started by this dashboard process; never controls
 * the user's pre-existing cloudflared installation or systemd service.
 * On dashboard exit the child is terminated. No OS boot auto-start.
 */
export class TunnelConnectorSupervisor {
  private readonly deps: TunnelDependencies;
  private child: ChildProcess | null = null;
  private state: TunnelProcessStatus["state"] = "stopped";
  private id: string | null = null;
  private startedAt: string | null = null;
  private lastError: string | null = null;
  private failureStage: TunnelFailureStage | null = null;
  private cloudflareHttpStatus: number | null = null;
  private shutdownHandler: (() => void) | null = null;

  constructor(dependencies: Partial<TunnelDependencies> = {}) {
    this.deps = { ...defaults, ...dependencies };
  }

  status(): TunnelProcessStatus {
    return {
      state: this.state,
      managed: this.child !== null,
      pid: this.child?.pid ?? null,
      tunnelId: this.id,
      startedAt: this.startedAt,
      lastError: this.lastError,
      failureStage: this.failureStage,
      cloudflareHttpStatus: this.cloudflareHttpStatus,
    };
  }

  async start(): Promise<TunnelProcessStatus> {
    if (this.child || this.state === "starting" || this.state === "stopping") {
      throw new Error("This dashboard already manages a Tunnel process.");
    }
    this.state = "starting";
    this.lastError = null;
    this.failureStage = null;
    this.cloudflareHttpStatus = null;
    this.id = null;
    this.startedAt = null;
    let currentStage: TunnelFailureStage = "deployment";
    try {
      const record = await this.deps.getDeployment();
      currentStage = "local-config";
      const config = await this.deps.getConfig();
      assertTunnelLocalConfiguration(record, config, this.deps.isMcpRunning());
      currentStage = "api-credential";
      const apiToken = this.deps.getApiCredential(record.accountId);
      currentStage = "tunnel-lookup";
      const connectorToken = await fetchDedicatedTunnelToken(record, apiToken, this.deps.api);
      currentStage = "cloudflared-launch";
      const child = this.deps.launch(connectorToken);
      this.child = child;
      this.id = record.tunnelId;
      const finish = (unexpected: boolean) => {
        if (this.child !== child) return;
        this.child = null;
        this.id = null;
        this.startedAt = null;
        if (this.shutdownHandler) {
          process.off("exit", this.shutdownHandler);
          this.shutdownHandler = null;
        }
        if (this.state === "stopping") {
          this.state = "stopped";
          this.lastError = null;
          this.failureStage = null;
          this.cloudflareHttpStatus = null;
        } else {
          this.state = unexpected ? "error" : "stopped";
          this.failureStage = unexpected ? (this.failureStage || "cloudflared-exit") : null;
          this.lastError = unexpected
            ? "Cloudflared keluar. Periksa koneksi dan validitas Tunnel Token; Tunnel Healthy mungkin berasal dari replica manual."
            : null;
        }
      };
      child.on("error", () => {
        this.failureStage = "cloudflared-launch";
        finish(true);
      });
      child.on("exit", code => finish(code !== 0));
      this.shutdownHandler = () => { if (this.child === child) child.kill("SIGTERM"); };
      process.once("exit", this.shutdownHandler);

      currentStage = "cloudflared-exit";
      await delay(this.deps.startupDelayMs);
      if (this.child !== child) {
        throw new TunnelStartFailure(this.failureStage || "cloudflared-exit");
      }
      this.state = "running";
      this.failureStage = null;
      this.cloudflareHttpStatus = null;
      this.startedAt = new Date().toISOString();
      return this.status();
    } catch (error) {
      const child = this.child;
      if (child) {
        this.child = null;
        child.kill("SIGTERM");
      }
      if (this.shutdownHandler) {
        process.off("exit", this.shutdownHandler);
        this.shutdownHandler = null;
      }
      this.id = null;
      this.state = "error";
      this.startedAt = null;
      const inferredStage = error instanceof TunnelStartFailure
        ? error.stage : this.failureStage || currentStage;
      this.failureStage = inferredStage;
      this.cloudflareHttpStatus = error instanceof TunnelStartFailure
        ? error.cloudflareHttpStatus : null;
      this.lastError = error instanceof TunnelStartFailure ? error.message :
        "Start Tunnel gagal pada tahap " + inferredStage +
        ". Periksa konfigurasi, izin token, dan cloudflared lokal. Konektor manual mungkin tetap Healthy.";
      throw new Error(this.lastError);
    }
  }

  async stop(): Promise<TunnelProcessStatus> {
    if (this.state === "starting") throw new Error("Tunnel is still starting.");
    const child = this.child;
    if (!child) {
      this.state = "stopped";
      this.lastError = null;
      this.failureStage = null;
      this.cloudflareHttpStatus = null;
      return this.status();
    }
    if (this.state === "stopping") throw new Error("Tunnel is already stopping.");
    this.state = "stopping";
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    await Promise.race([exited, delay(2000)]);
    if (this.child === child) {
      child.kill("SIGKILL");
      await Promise.race([exited, delay(500)]);
    }
    if (this.child === child) throw new Error("Could not confirm managed cloudflared shutdown.");
    return this.status();
  }
}

declare global {
  var __localMcpTunnelSupervisor: TunnelConnectorSupervisor | undefined;
}
export const tunnelConnectorSupervisor = globalThis.__localMcpTunnelSupervisor ??
  (globalThis.__localMcpTunnelSupervisor = new TunnelConnectorSupervisor());
