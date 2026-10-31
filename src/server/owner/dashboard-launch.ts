/** Shared pure launcher helpers. The browser receives a one-use fragment ticket,
 *  never a Cloudflare credential or an admin token in an HTTP request. */
export const DASHBOARD_ORIGIN = "http://127.0.0.1:3100";
export const OWNER_TICKET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

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
