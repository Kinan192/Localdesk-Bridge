import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getLocalClientSetup } from "../setup/index.ts";

export const OnboardingSchema = z.object({
  version: z.literal(1),
  step: z.number().int().min(0).max(3),
  mode: z.enum(["local", "new", "existing"]).nullable(),
  dismissed: z.boolean(),
}).strict();
export type OnboardingState = z.infer<typeof OnboardingSchema>;

export const OnboardingPatch = z.object({
  step: z.number().int().min(0).max(3).optional(),
  mode: z.enum(["local", "new", "existing"]).nullable().optional(),
  dismissed: z.boolean().optional(),
}).strict().refine(input => Object.keys(input).length > 0, "Empty setup update");

export function defaultOnboarding(): OnboardingState {
  return { version: 1, step: 0, mode: "new", dismissed: false };
}

export function onboardingDirectory() {
  const configured = process.env.LOCAL_MCP_STATE_DIR?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) throw new Error("LOCAL_MCP_STATE_DIR must be absolute.");
    return configured;
  }
  return path.join(os.homedir(),
    process.platform === "win32" ? "AppData/Local/LocalMCPManager" : ".config/local-mcp-manager");
}

export class OnboardingRepository {
  private readonly folder: string;
  private readonly target: string;

  constructor(folder: string = onboardingDirectory()) {
    if (!path.isAbsolute(folder)) throw new Error("Onboarding storage needs an absolute directory.");
    this.folder = folder;
    this.target = path.join(folder, "onboarding.json");
  }

  private async ensureDirectory() {
    await fs.mkdir(this.folder, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid setup directory.");
    if (process.platform !== "win32") await fs.chmod(this.folder, 0o700);
  }

  async load(): Promise<OnboardingState> {
    await this.ensureDirectory();
    let handle;
    try {
      handle = await fs.open(this.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultOnboarding();
      throw error;
    }
    try {
      const stat = await handle.stat();
      const link = await fs.lstat(this.target);
      if (!stat.isFile() || stat.nlink > 1 || link.isSymbolicLink() || stat.size > 4096) {
        throw new Error("Invalid setup state file.");
      }
      const content = await handle.readFile("utf8");
      return OnboardingSchema.parse(JSON.parse(content));
    } finally { await handle.close(); }
  }

  async patch(value: unknown): Promise<OnboardingState> {
    const change = OnboardingPatch.parse(value);
    const current = await this.load();
    const updated = OnboardingSchema.parse({ ...current, ...change });
    await this.ensureDirectory();
    const temp = path.join(this.folder, "onboarding-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temp, JSON.stringify(updated, null, 2) + "\n", {
        encoding: "utf8", flag: "wx", mode: 0o600,
      });
      await fs.rename(temp, this.target);
    } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
    return updated;
  }
}

async function findCloudflared(): Promise<{ found: boolean; path: string | null }> {
  const windows = process.platform === "win32";
  const sep = windows ? ";" : ":";
  const pathDirs = (process.env.PATH || "").split(sep).filter(Boolean);
  const executable = windows ? "cloudflared.exe" : "cloudflared";
  const candidates = [
    ...pathDirs.map(dir => path.join(dir, executable)),
    ...(process.platform === "darwin"
      ? ["/opt/homebrew/bin/cloudflared", "/usr/local/bin/cloudflared"]
      : process.platform === "linux" ? ["/usr/bin/cloudflared", "/usr/local/bin/cloudflared"] : []),
  ];
  for (const candidate of [...new Set(candidates)].slice(0, 80)) {
    // Presence only, not proof a tunnel is installed, running, or healthy.
    try {
      if ((await fs.stat(candidate)).isFile()) return { found: true, path: candidate };
    } catch { /* Continue searching common locations. */ }
  }
  return { found: false, path: null };
}

export async function getOnboardingSystemCheck() {
  const setup = await getLocalClientSetup();
  const cloudflared = await findCloudflared();
  return {
    platform: process.platform,
    nodeVersion: process.version,
    nodeExecutable: setup.nodeCommand,
    dependenciesReady: setup.dependenciesReady,
    missing: setup.missing,
    cloudflaredPresent: cloudflared.found,
    // No shell commands are executed and no service is installed.
    cloudflaredChecked: "binary-presence-only" as const,
  };
}
