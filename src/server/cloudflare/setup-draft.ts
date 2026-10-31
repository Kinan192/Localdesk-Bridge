import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { onboardingDirectory } from "../onboarding/index.ts";
import { createProvisioningPreview } from "./provisioning-plan.ts";

/**
 * Owner-only local draft for passing nonsecret setup fields between pages.
 * This never stores a Cloudflare token, tunnel token or OAuth credential.
 */
const DraftInput = z.object({
  accountId: z.string().regex(/^[a-f0-9]{32}$/i),
  domain: z.string().min(4).max(253),
  subdomain: z.string().min(1).max(40),
  allowedEmail: z.string().email().max(254),
}).strict();
const StoredDraft = DraftInput.extend({ version: z.literal(1) }).strict();
export type SetupDraft = z.infer<typeof StoredDraft>;

function normalized(input: unknown): SetupDraft {
  const data = DraftInput.parse(input);
  const preview = createProvisioningPreview({
    domain: data.domain, subdomain: data.subdomain, allowedEmail: data.allowedEmail,
  });
  return {
    version: 1,
    accountId: data.accountId.toLowerCase(),
    domain: preview.zone,
    subdomain: preview.hostname.slice(0, -(preview.zone.length + 1)),
    allowedEmail: preview.allowedEmail,
  };
}

export class SetupDraftRepository {
  private readonly file: string;
  constructor(private readonly folder: string = onboardingDirectory()) {
    if (!path.isAbsolute(folder)) throw new Error("Draft storage directory must be absolute.");
    this.file = path.join(folder, "cloudflare-setup-draft.json");
  }

  private async ensureDirectory() {
    await fs.mkdir(this.folder, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Unsafe Cloudflare draft directory.");
    }
    if (process.platform !== "win32") await fs.chmod(this.folder, 0o700);
  }

  async load(): Promise<SetupDraft | null> {
    await this.ensureDirectory();
    let handle;
    try {
      handle = await fs.open(this.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Could not read Cloudflare setup draft.");
    }
    try {
      const stat = await handle.stat();
      const link = await fs.lstat(this.file);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4096 || link.isSymbolicLink()) {
        throw new Error("Unsafe Cloudflare setup draft.");
      }
      const parsed = StoredDraft.parse(JSON.parse(await handle.readFile("utf8")));
      return normalized({
        accountId: parsed.accountId, domain: parsed.domain,
        subdomain: parsed.subdomain, allowedEmail: parsed.allowedEmail,
      });
    } finally { await handle.close(); }
  }

  async save(input: unknown): Promise<SetupDraft> {
    const draft = normalized(input);
    await this.ensureDirectory();
    try {
      const stat = await fs.lstat(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error("Unsafe Cloudflare setup draft destination.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temp = path.join(this.folder, "cloudflare-draft-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temp, JSON.stringify(draft) + "\n", {
        encoding: "utf8", mode: 0o600, flag: "wx",
      });
      await fs.rename(temp, this.file);
    } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
    return draft;
  }

  async clearForAccount(accountId: string): Promise<void> {
    if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("Invalid account reference.");
    const draft = await this.load();
    if (!draft || draft.accountId !== accountId.toLowerCase()) return;
    await fs.unlink(this.file);
  }
}
