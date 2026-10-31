import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { onboardingDirectory } from "../onboarding/index.ts";

/**
 * Installation-owner pairing foundation.
 *
 * The trusted native launcher (or developer-mode CLI) creates a short-lived,
 * single-use pairing ticket and opens the browser with the secret in a URL
 * fragment, never in the HTTP request URL. The browser redeems it for a
 * HttpOnly SameSite=Strict signed cookie.
 *
 * This defends against other browser origins and accidental exposure. It is
 * NOT a defense against malware already running as the same operating system
 * user, or a substitute for the future packaged native owner process.
 */
const KEY_FILE = "owner-session-key.bin";
const PAIRING_FILE = "owner-pairing.json";
export const OWNER_COOKIE = "local_mcp_owner";
export const PAIRING_TTL_MS = 2 * 60 * 1000;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_PRIVATE_FILE = 1024;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_PATTERN = /^v1\.(\d{13})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/;

async function privateFolder(folder: string): Promise<void> {
  if (!path.isAbsolute(folder)) throw new Error("Owner state path must be absolute.");
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const st = await fs.lstat(folder);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error("Unsafe owner state directory.");
  if (process.platform !== "win32") {
    if (process.getuid && st.uid !== process.getuid()) throw new Error("Owner state directory belongs to another user.");
    await fs.chmod(folder, 0o700);
  }
}

async function readPrivateFile(file: string, limit = MAX_PRIVATE_FILE): Promise<Buffer> {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    const lst = await fs.lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || lst.isSymbolicLink() ||
        stat.size > limit || stat.size === 0) {
      throw new Error("Unsafe owner state file.");
    }
    if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid()))) {
      throw new Error("Owner state file permissions are unsafe.");
    }
    return await handle.readFile();
  } finally { await handle.close(); }
}

function compareStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class OwnerPairingRepository {
  constructor(private readonly folder = onboardingDirectory()) {}

  private async signingKey(): Promise<Buffer> {
    await privateFolder(this.folder);
    const target = path.join(this.folder, KEY_FILE);
    try {
      const handle = await fs.open(target, "wx", 0o600);
      try { await handle.writeFile(randomBytes(32)); }
      finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const key = await readPrivateFile(target, 64);
    if (key.length !== 32) throw new Error("Invalid owner signing key.");
    return key;
  }

  async createTicket(now = Date.now()): Promise<string> {
    await this.signingKey();
    const ticket = randomBytes(32).toString("base64url");
    const target = path.join(this.folder, PAIRING_FILE);
    const expiresAt = now + PAIRING_TTL_MS;
    const body = JSON.stringify({ version: 1,
      digest: createHash("sha256").update(ticket).digest("hex"), expiresAt });
    // Never follow/overwrite an unsafe existing ticket path.
    try {
      await readPrivateFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temp = path.join(this.folder, "owner-pair-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temp, body, { flag: "wx", mode: 0o600 });
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
    return ticket;
  }

  async redeemTicket(ticket: string, now = Date.now()): Promise<string | null> {
    if (!CODE_PATTERN.test(ticket)) return null;
    await privateFolder(this.folder);
    const target = path.join(this.folder, PAIRING_FILE);
    // Atomic claim ensures the ticket is consumable by only one request.
    const claimed = path.join(this.folder, "owner-claim-" + randomUUID() + ".tmp");
    try {
      await fs.rename(target, claimed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      const stat = JSON.parse((await readPrivateFile(claimed)).toString("utf8")) as {
        version?: unknown; digest?: unknown; expiresAt?: unknown;
      };
      if (stat.version !== 1 || typeof stat.digest !== "string" ||
          typeof stat.expiresAt !== "number" ||
          stat.expiresAt <= now || stat.expiresAt > now + PAIRING_TTL_MS) return null;
      const digest = createHash("sha256").update(ticket).digest("hex");
      if (!compareStrings(stat.digest, digest)) return null;
      return await this.issueSession(now);
    } catch {
      return null;
    } finally { await fs.rm(claimed, { force: true }).catch(() => {}); }
  }

  async issueSession(now = Date.now()): Promise<string> {
    const key = await this.signingKey();
    const expiresAt = now + SESSION_TTL_MS;
    const nonce = randomBytes(24).toString("base64url");
    const unsigned = "v1." + expiresAt + "." + nonce;
    const signature = createHmac("sha256", key).update(unsigned).digest("base64url");
    return unsigned + "." + signature;
  }

  async verifySession(session: string | undefined, now = Date.now()): Promise<boolean> {
    if (!session) return false;
    const parts = SESSION_PATTERN.exec(session);
    if (!parts) return false;
    const expires = Number(parts[1]);
    if (!Number.isSafeInteger(expires) || expires <= now || expires > now + SESSION_TTL_MS) return false;
    const key = await this.signingKey();
    const unsigned = "v1." + parts[1] + "." + parts[2];
    const expected = createHmac("sha256", key).update(unsigned).digest("base64url");
    return compareStrings(parts[3], expected);
  }
}
