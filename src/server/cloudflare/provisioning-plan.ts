import { z } from "zod";

/**
 * Read-only Cloudflare setup preview for first-time Web MCP users.
 *
 * This does not contact Cloudflare, verify zone ownership, issue tokens,
 * mutate DNS, enable Access, or start any process. Network provisioning
 * needs separate explicit authorization and protected credentials.
 */
export const ProvisioningPreviewInput = z.object({
  domain: z.string().trim().toLowerCase().min(4).max(253),
  subdomain: z.string().trim().toLowerCase().min(1).max(40).default("mcp"),
  allowedEmail: z.string().trim().toLowerCase().email().max(254),
}).strict();

export type ProvisioningPreview = {
  status: "preview-only";
  zone: string;
  hostname: string;
  endpoint: string;
  origin: "http://127.0.0.1:8401";
  allowedEmail: string;
  prerequisite: string;
  requiredPermissions: readonly string[];
  steps: readonly { id: string; label: string; automatic: boolean }[];
};

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function createProvisioningPreview(input: unknown): ProvisioningPreview {
  const data = ProvisioningPreviewInput.parse(input);
  if (!data.domain.includes(".") || data.domain.endsWith(".cloudflareaccess.com") ||
      data.domain.endsWith(".cfargotunnel.com")) {
    throw new Error("Enter your actual domain hosted in Cloudflare DNS.");
  }
  const labels = data.domain.split(".");
  if (labels.length < 2 || labels.some(label => !DNS_LABEL.test(label)) ||
      labels[labels.length - 1]!.length < 2 || !/^[a-z]{2,63}$/.test(labels[labels.length - 1]!)) {
    throw new Error("Enter a valid domain without https://, port, spaces, or a URL path.");
  }
  if (!DNS_LABEL.test(data.subdomain) || data.subdomain === "www") {
    throw new Error("Use a single safe subdomain label, such as mcp or ai-mcp.");
  }

  const hostname = data.subdomain + "." + data.domain;
  return {
    status: "preview-only",
    zone: data.domain,
    hostname,
    endpoint: "https://" + hostname + "/mcp",
    origin: "http://127.0.0.1:8401",
    allowedEmail: data.allowedEmail,
    prerequisite: "The domain must already be an active Cloudflare DNS zone. Ownership is NOT verified by this preview.",
    requiredPermissions: [
      "Cloudflare Tunnel Write (account)",
      "DNS Write (selected zone)",
      "Access Apps and Policies Write (account)",
      "Zone Read (selected zone)",
    ],
    steps: [
      { id: "cloudflared", label: "Install and verify cloudflared for this operating system", automatic: false },
      { id: "authorize", label: "Authorize Cloudflare with a narrowly scoped API token", automatic: false },
      { id: "verify-zone", label: "Confirm domain and account ownership through Cloudflare API", automatic: false },
      { id: "access-first", label: "Create Access app, restrict allowed identity, enable Managed OAuth BEFORE publishing the hostname", automatic: false },
      { id: "tunnel", label: "Create a dedicated remotely-managed Tunnel and route it to the protected local MCP listener", automatic: false },
      { id: "dns", label: "Publish the selected MCP DNS hostname to the new tunnel", automatic: false },
      { id: "connect", label: "Start MCP HTTP and cloudflared, verify Access JWT and actual Web MCP OAuth", automatic: false },
    ],
  };
}
