import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { onboardingDirectory } from "../onboarding/index.ts";
import { ProvisioningError } from "./provisioning-api.ts";

const identifier = z.string().regex(/^[a-f0-9]{32}$/i);
const resourceId = z.string().regex(/^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/i);
export const DeploymentState = z.object({
  version: z.literal(1),
  accountId: identifier,
  zoneId: identifier,
  domain: z.string().min(4).max(253),
  hostname: z.string().min(4).max(253),
  allowedEmail: z.string().email(),
  redirectUris: z.array(z.string().max(300)).min(1).max(8),
  phase: z.enum(["preparing", "access-ready", "tunnel-ready", "published", "needs-review"]),
  accessAppId: resourceId.nullable(),
  aud: z.string().min(1).max(256).nullable(),
  tunnelId: resourceId.nullable(),
  dnsRecordId: z.string().min(1).max(64).nullable(),
}).strict();
export type DeploymentRecord = z.infer<typeof DeploymentState>;

/** Metadata only. NEVER store API tokens, tunnel connector tokens or OAuth grants. */
export class DeploymentRepository {
  private readonly file: string;
  private readonly folder: string;
  constructor(folder: string = onboardingDirectory()) {
    if (!path.isAbsolute(folder)) throw new ProvisioningError("Invalid deployment directory.");
    this.folder = folder;
    this.file = path.join(folder, "cloudflare-deployment.json");
  }
  private async directory() {
    await fs.mkdir(this.folder, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ProvisioningError("Unsafe deployment directory.");
    if (process.platform !== "win32") await fs.chmod(this.folder, 0o700);
  }
  async load(): Promise<DeploymentRecord | null> {
    await this.directory();
    let handle;
    try {
      handle = await fs.open(this.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new ProvisioningError("Could not safely open deployment metadata.");
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8192) {
        throw new ProvisioningError("Unsafe deployment metadata file.");
      }
      return DeploymentState.parse(JSON.parse(await handle.readFile("utf8")));
    } catch {
      throw new ProvisioningError("Deployment metadata is invalid; manual review required.");
    } finally { await handle.close(); }
  }
  async save(record: DeploymentRecord): Promise<void> {
    const safe = DeploymentState.parse(record);
    await this.directory();
    try {
      const stat = await fs.lstat(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new ProvisioningError("Unsafe deployment metadata destination.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temp = path.join(this.folder, "deployment-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temp, JSON.stringify(safe) + "\n", { flag: "wx", mode: 0o600 });
      await fs.rename(temp, this.file);
    } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
  }
  /** Read-only local lock visibility for troubleshooting; never clears a lock. */
  async lockStatus(): Promise<"clear" | "held"> {
    await this.directory();
    const target = path.join(this.folder, "cloudflare-deployment.lock");
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new ProvisioningError("Unsafe deployment lock needs manual review.");
      }
      return "held";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "clear";
      throw error;
    }
  }

  /**
   * Owner-approved recovery of an OLD, uncertain lock. The callback MUST
   * independently verify that no remote write was applied before unlinking.
   * A separate exclusive recovery guard prevents concurrent recovery requests.
   * Cloudflare requests may take ~12s each; never recover a lock younger than
   * three minutes, because another provisioning request may still be running.
   */
  async recoverLockAfter(checkRemoteSafe: () => Promise<void>): Promise<void> {
    await this.directory();
    const guard = path.join(this.folder, "cloudflare-recovery.lock");
    const lockfile = path.join(this.folder, "cloudflare-deployment.lock");
    let handle;
    try {
      handle = await fs.open(guard, "wx", 0o600);
    } catch {
      throw new ProvisioningError("A recovery inspection is already running.");
    }
    try {
      const initial = await fs.lstat(lockfile);
      if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1 ||
          Date.now() - initial.mtimeMs < 180_000) {
        throw new ProvisioningError(
          "Deployment may still be active. Wait three minutes from the failed operation before recovery.",
        );
      }
      const before = await this.load();
      if (!before || before.phase !== "access-ready" || before.tunnelId ||
          before.dnsRecordId || !before.accessAppId || !before.aud) {
        throw new ProvisioningError("This deployment state is not safe for automatic lock recovery.");
      }
      await checkRemoteSafe();
      const after = await this.load();
      const current = await fs.lstat(lockfile);
      if (JSON.stringify(before) !== JSON.stringify(after) ||
          current.ino !== initial.ino || current.mtimeMs !== initial.mtimeMs ||
          !current.isFile() || current.isSymbolicLink() || current.nlink !== 1) {
        throw new ProvisioningError("Deployment state changed during recovery. No lock was cleared.");
      }
      await fs.unlink(lockfile);
    } catch (error) {
      if (error instanceof ProvisioningError) throw error;
      throw new ProvisioningError("Recovery could not verify remote state. Lock remains held.");
    } finally {
      await handle.close();
      await fs.rm(guard, { force: true }).catch(() => {});
    }
  }

  /** Read-only local lock/guard diagnosis; no token, file path or file contents. */
  async inspectDnsLock() {
    await this.directory();
    const inspect = async (name: string) => {
      try {
        const stat = await fs.lstat(path.join(this.folder, name));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
          return { state: "unsafe" as const, ageSeconds: null };
        }
        return {
          state: "held" as const,
          ageSeconds: Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000)),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { state: "clear" as const, ageSeconds: null };
        }
        return { state: "unreadable" as const, ageSeconds: null };
      }
    };
    const [deployment, completion, recovery] = await Promise.all([
      inspect("cloudflare-deployment.lock"),
      inspect("cloudflare-dns-finalize.guard"),
      inspect("cloudflare-recovery.lock"),
    ]);
    return {
      deployment, completion, recovery,
      canAttemptDnsRecovery: (deployment.state === "clear" ||
        (deployment.state === "held" && (deployment.ageSeconds ?? 0) >= 180)) &&
        completion.state === "clear" && recovery.state === "clear",
    };
  }

  /**
   * Finish DNS for an already-created dedicated Tunnel, with owner approval.
   * Never re-runs Tunnel/Access creation. An old publication lock may be
   * reused ONLY after 3 minutes, while a separate recovery guard is held.
   * On ANY uncertainty retain the publication lock for further inspection.
   */
  async exclusiveDnsCompletion<T>(work: () => Promise<T>): Promise<T> {
    await this.directory();
    const guardPath = path.join(this.folder, "cloudflare-dns-finalize.guard");
    const lockPath = path.join(this.folder, "cloudflare-deployment.lock");
    let guard;
    try {
      guard = await fs.open(guardPath, "wx", 0o600);
    } catch {
      throw new ProvisioningError("DNS completion is already running or needs manual review.");
    }
    let ownLock;
    let lockStat: Awaited<ReturnType<typeof fs.lstat>> | null = null;
    try {
      const before = await this.load();
      if (!before || before.phase !== "tunnel-ready" || !before.accessAppId ||
          !before.aud || !before.tunnelId || before.dnsRecordId) {
        throw new ProvisioningError("Only an existing, incomplete dedicated Tunnel can finish DNS.");
      }
      try {
        lockStat = await fs.lstat(lockPath);
        if (!lockStat.isFile() || lockStat.isSymbolicLink() || lockStat.nlink !== 1 ||
            Date.now() - lockStat.mtimeMs < 180_000) {
          throw new ProvisioningError(
            "Earlier deployment may still be active. DNS completion requires a stale lock older than 3 minutes.",
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        ownLock = await fs.open(lockPath, "wx", 0o600);
        lockStat = await fs.lstat(lockPath);
      }
      const unchanged = await this.load();
      const currentLock = await fs.lstat(lockPath);
      if (JSON.stringify(before) !== JSON.stringify(unchanged) || !lockStat ||
          !currentLock.isFile() || currentLock.isSymbolicLink() || currentLock.nlink !== 1 ||
          currentLock.ino !== lockStat.ino || currentLock.mtimeMs !== lockStat.mtimeMs) {
        throw new ProvisioningError("Deployment changed during DNS completion; refusing to publish.");
      }
      const result = await work();
      const after = await this.load();
      if (after?.phase !== "published" || !after.dnsRecordId || after.tunnelId !== before.tunnelId ||
          after.accessAppId !== before.accessAppId || after.hostname !== before.hostname) {
        throw new ProvisioningError("DNS completion was not saved and verified; lock remains.");
      }
      const finalLock = await fs.lstat(lockPath);
      if (!finalLock.isFile() || finalLock.isSymbolicLink() || finalLock.nlink !== 1 ||
          finalLock.ino !== lockStat.ino || finalLock.mtimeMs !== lockStat.mtimeMs) {
        throw new ProvisioningError("Deployment lock changed. Manual review required.");
      }
      await fs.unlink(lockPath);
      return result;
    } finally {
      if (ownLock) await ownLock.close();
      await guard.close();
      await fs.rm(guardPath, { force: true }).catch(() => {});
    }
  }

  /**
   * Cross-process exclusive lock. A crashed deployment intentionally leaves
   * the lock: do not retry uncertain remote writes until manual recovery.
   */
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    await this.directory();
    const lockfile = path.join(this.folder, "cloudflare-deployment.lock");
    let handle;
    try {
      handle = await fs.open(lockfile, "wx", 0o600);
    } catch {
      throw new ProvisioningError("Provisioning is locked or needs manual review.");
    }
    let completed = false;
    try {
      const result = await work();
      completed = true;
      return result;
    } finally {
      await handle.close();
      // If no deployment intent was saved yet, no remote create was attempted.
      // Otherwise retain the lock after an error: the provider may have applied
      // a write despite a lost response.
      let untouched = false;
      if (!completed) {
        try { untouched = (await this.load()) === null; } catch { /* fail closed */ }
      }
      if (completed || untouched) await fs.rm(lockfile, { force: true });
    }
  }
}
