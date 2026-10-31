import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultPolicy, PolicySchema, type Policy } from "../contracts/index.ts";

/**
 * Storage adapter interface; allows replacing JSON with SQLite later without
 * coupling policy/agent code to a specific database.
 */
export interface PolicyRepository {
  load(): Promise<Policy>;
  save(candidate: unknown): Promise<Policy>;
}

export class MemoryPolicyRepository implements PolicyRepository {
  private current: Policy = defaultPolicy();
  async load(): Promise<Policy> { return structuredClone(this.current); }
  async save(candidate: unknown): Promise<Policy> {
    const validated = PolicySchema.parse(candidate);
    this.current = structuredClone(validated);
    return this.load();
  }
}

/**
 * Config-only bootstrap adapter, not a credentials database.
 * Directory must be a user-local private app directory chosen by the launcher.
 * Never use this adapter for OAuth tokens, admin secrets, or private keys.
 */
export class JsonPolicyRepository implements PolicyRepository {
  private readonly directory: string;
  private readonly filename: string;

  constructor(directory: string) {
    if (!path.isAbsolute(directory)) throw new Error("State directory must be absolute.");
    this.directory = path.resolve(directory);
    this.filename = path.join(this.directory, "policy.json");
  }

  private async ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Local state directory must be a real directory.");
    }
    await fs.chmod(this.directory, 0o700);
  }

  async load(): Promise<Policy> {
    await this.ensureDirectory();
    let text: string;
    try {
      const stat = await fs.lstat(this.filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
        throw new Error("Invalid local policy file.");
      }
      text = await fs.readFile(this.filename, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultPolicy();
      throw error;
    }
    return PolicySchema.parse(JSON.parse(text));
  }

  async save(candidate: unknown): Promise<Policy> {
    const clean = PolicySchema.parse(candidate);
    await this.ensureDirectory();
    const temp = path.join(this.directory, "policy-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temp, JSON.stringify(clean, null, 2) + "\n", {
        mode: 0o600, flag: "wx", encoding: "utf8",
      });
      await fs.rename(temp, this.filename);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
    return structuredClone(clean);
  }
}
