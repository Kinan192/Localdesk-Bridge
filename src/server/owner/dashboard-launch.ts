import { createHmac, timingSafeEqual } from "node:crypto";

export const LAUNCH_SECRET_ENV = "LOCAL_MCP_LAUNCH_SECRET";
export const AUTO_SERVICES_ENV = "LOCAL_MCP_AUTO_START_SERVICES";
const LAUNCH_PROOF_DOMAIN = "local-mcp-manager-launch-ready-v1";
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The launcher authenticates its own child listener before issuing an owner ticket.
 * An unrelated process that claims port 3100 cannot provide this HMAC proof.
 * This is a local process-identity check, NOT a defense against same-OS-user malware. */
export function launcherReadyProof(secret: string | undefined, challenge: string | null): string | null {
  if (!secret || !NONCE_PATTERN.test(secret) || !challenge || !NONCE_PATTERN.test(challenge)) return null;
  return createHmac("sha256", secret).update(LAUNCH_PROOF_DOMAIN + ":" + challenge).digest("base64url");
}

export function verifyLauncherReadyProof(secret: string, challenge: string, actual: string | null): boolean {
  const expected = launcherReadyProof(secret, challenge);
  if (!expected || !actual || !NONCE_PATTERN.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

/** Shared pure launcher helpers. The browser receives a one-use fragment ticket,
 *  never a Cloudflare credential or an admin token in an HTTP request. */
export const DASHBOARD_ORIGIN = "http://127.0.0.1:3100";
export const OWNER_TICKET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/**
 * POSIX launcher owns one new process group started with spawn(detached:true).
 * It may signal that group, but must never target an external or unknown PID.
 * Windows has no POSIX group signals and requires separate process-tree QA.
 */
export function ownedProcessGroupId(platform: NodeJS.Platform, childPid: number | undefined): number | null {
  if (platform === "win32" || !Number.isSafeInteger(childPid) || childPid === undefined || childPid <= 1) return null;
  return childPid;
}

/** Unexpected signal termination must not masquerade as a successful start. */
export function managedDashboardExitCode(
  code: number | null,
  requestedStop: boolean,
): number {
  if (requestedStop) return 0;
  return code ?? 1;
}

export function ownerLaunchUrl(ticket: string): string {
  if (!OWNER_TICKET_FORMAT.test(ticket)) throw new Error("Invalid owner launch ticket.");
  return DASHBOARD_ORIGIN + "/#owner-pair=" + ticket;
}

export function browserOpenCommand(platform: NodeJS.Platform, url: string): {
  command: string;
  args: string[];
} {
  if (!url.startsWith(DASHBOARD_ORIGIN + "/#owner-pair=") ||
      !OWNER_TICKET_FORMAT.test(url.slice((DASHBOARD_ORIGIN + "/#owner-pair=").length))) {
    throw new Error("Refusing to open an untrusted URL.");
  }
  if (platform === "win32") return { command: "explorer.exe", args: [url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}
