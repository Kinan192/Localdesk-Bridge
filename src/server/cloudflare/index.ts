import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { onboardingDirectory } from "../onboarding/index.ts";
import { parseRemoteConfig, type RemoteConfig, type RemoteConfigEnvironment } from "../mcp/remote-config.ts";

// These are routing identifiers, not authentication secrets.
// Never persist tunnel credentials, API tokens, OAuth tokens or private keys.
export const CloudflareFormSchema = z.object({
  teamDomain: z.string().min(1).max(255),
  applicationAudience: z.string().min(1).max(256),
  publicHostname: z.string().min(1).max(253),
  port: z.number().int().min(1024).max(65535).default(8401),
}).strict();

export type CloudflareForm = z.input<typeof CloudflareFormSchema>;

const CloudflareSettingsSchema = CloudflareFormSchema.extend({
  version: z.literal(1),
}).strict();

export function validateCloudflareForm(input: unknown): RemoteConfig {
  const data = CloudflareFormSchema.parse(input);
  // Reuse the exact fail-closed rules that govern remote listener startup.
  return parseRemoteConfig({
    CF_ACCESS_TEAM_DOMAIN: data.teamDomain,
    CF_ACCESS_AUD: data.applicationAudience,
    MCP_PUBLIC_HOSTNAME: data.publicHostname,
    MCP_HTTP_PORT: String(data.port),
  });
}

export class CloudflareSettingsRepository {
  private readonly folder: string;
  private readonly filename: string;
  constructor(folder: string = onboardingDirectory()) {
    if (!path.isAbsolute(folder)) throw new Error("Cloudflare state directory must be absolute.");
    this.folder = folder;
    this.filename = path.join(folder, "cloudflare.json");
  }
  private async ensureDirectory() {
    await fs.mkdir(this.folder, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid configuration directory.");
    if (process.platform !== "win32") await fs.chmod(this.folder, 0o700);
  }
  async load(): Promise<RemoteConfig | null> {
    await this.ensureDirectory();
    let handle;
    try {
      handle = await fs.open(this.filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      const stat = await handle.stat();
      const link = await fs.lstat(this.filename);
      if (!stat.isFile() || stat.nlink !== 1 || link.isSymbolicLink() || stat.size > 4096) {
        throw new Error("Unsafe Cloudflare settings file.");
      }
      const raw = CloudflareSettingsSchema.parse(JSON.parse(await handle.readFile("utf8")));
      return validateCloudflareForm({
        teamDomain: raw.teamDomain,
        applicationAudience: raw.applicationAudience,
        publicHostname: raw.publicHostname,
        port: raw.port,
      });
    } finally { await handle.close(); }
  }
  async save(input: unknown): Promise<RemoteConfig> {
    const settings = validateCloudflareForm(input);
    await this.ensureDirectory();
    // Refuse an existing symlink/hardlink; never replace an unsafe target.
    try {
      const link = await fs.lstat(this.filename);
      if (!link.isFile() || link.isSymbolicLink() || link.nlink !== 1) {
        throw new Error("Unsafe Cloudflare settings destination.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temp = path.join(this.folder, "cloudflare-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temp, JSON.stringify({ version: 1, ...settings }, null, 2) + "\n", {
        encoding: "utf8", mode: 0o600, flag: "wx",
      });
      await fs.rename(temp, this.filename);
    } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
    return settings;
  }
  async clear(): Promise<void> {
    await this.ensureDirectory();
    try {
      const stat = await fs.lstat(this.filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error("Unsafe Cloudflare settings destination.");
      }
      await fs.unlink(this.filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

// Environment variables override saved settings for advanced users.
// No listener starts without a fully validated effective configuration.
export async function resolveCloudflareConfig(
  env: RemoteConfigEnvironment,
  store: Pick<CloudflareSettingsRepository, "load">,
): Promise<RemoteConfig> {
  const saved = await store.load();
  const effective = {
    CF_ACCESS_TEAM_DOMAIN: env.CF_ACCESS_TEAM_DOMAIN ?? saved?.teamDomain ?? "",
    CF_ACCESS_AUD: env.CF_ACCESS_AUD ?? saved?.applicationAudience ?? "",
    MCP_PUBLIC_HOSTNAME: env.MCP_PUBLIC_HOSTNAME ?? saved?.publicHostname ?? "",
    MCP_HTTP_PORT: env.MCP_HTTP_PORT ?? (saved ? String(saved.port) : "8401"),
  };
  return parseRemoteConfig(effective);
}
