import { z } from "zod";
import { cloudflareGet, verifyCloudflareTokenAndZones } from "./account-connection.ts";
import { createProvisioningPreview } from "./provisioning-plan.ts";

/**
 * Cloudflare P1B: READ-ONLY hostname collision preflight.
 * This verifies the selected zone and queries DNS. It deliberately does not
 * create/modify Access, Tunnel, DNS, connector processes, or credentials.
 */
export const PreflightInput = z.object({
  token: z.string().min(20).max(256).regex(/^[A-Za-z0-9_-]+$/),
  domain: z.string().min(4).max(253),
  subdomain: z.string().min(1).max(40),
  allowedEmail: z.string().email().max(254),
}).strict();

const DNSList = z.object({
  success: z.boolean(),
  result: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
  }).passthrough()),
  result_info: z.object({ total_pages: z.number().int().nonnegative().optional() }).passthrough().optional(),
}).passthrough();

type DNSRecord = { id: string; name: string; type: string };
type Fetcher = typeof fetch;

export async function preflightCloudflareHostname(input: unknown, fetcher: Fetcher = fetch) {
  const request = PreflightInput.parse(input);
  const plan = createProvisioningPreview({
    domain: request.domain, subdomain: request.subdomain, allowedEmail: request.allowedEmail,
  });
  const discovery = await verifyCloudflareTokenAndZones({ token: request.token }, fetcher);
  const zone = discovery.zones.find(item => item.name === plan.zone);
  if (!zone) {
    throw new Error(discovery.truncated
      ? "Domain not found in the first 250 visible Cloudflare zones; narrow token scope."
      : "Domain was not found in the zones visible to this token.");
  }
  if (zone.status !== "active") {
    throw new Error("Cloudflare zone is not active. Complete domain activation first.");
  }
  // Fixed origin and validated zone ID. Never accept user-defined API hosts or
  // arbitrary paths, including ID slashes or control characters.
  if (!/^[a-f0-9]{32}$/i.test(zone.id)) {
    throw new Error("Cloudflare zone identifier is invalid.");
  }

  const records: DNSRecord[] = [];
  const perPage = 100;
  let truncated = false;
  for (let page = 1; page <= 5; page++) {
    const query = new URLSearchParams({
      name: plan.hostname, per_page: String(perPage), page: String(page),
    });
    const dns = DNSList.parse(await cloudflareGet(
      "/zones/" + zone.id + "/dns_records?" + query, request.token, fetcher,
    ));
    if (!dns.success) throw new Error("Cloudflare DNS lookup failed. Token must allow DNS Read or DNS Write.");
    for (const record of dns.result) {
      if (record.name.toLowerCase() === plan.hostname) {
        records.push({ id: record.id, name: record.name.toLowerCase(), type: record.type });
      }
    }
    const total = dns.result_info?.total_pages;
    if (total !== undefined ? page >= total : dns.result.length < perPage) break;
    if (page === 5) truncated = true;
  }

  const blocked = records.length > 0 || truncated;
  return {
    verified: discovery.verified,
    tokenStatus: discovery.tokenStatus,
    zones: discovery.zones,
    truncated: discovery.truncated,
    credentialStored: false as const,
    canProvision: false as const,
    preflight: {
      zoneId: zone.id,
      accountId: zone.accountId,
      domain: plan.zone,
      hostname: plan.hostname,
      endpoint: plan.endpoint,
      zoneActive: true as const,
      status: (blocked ? "blocked" : "candidate") as "blocked" | "candidate",
      dnsRecords: records,
      dnsScanTruncated: truncated,
      accessPolicyChecked: false as const,
      tunnelChecked: false as const,
      note: blocked
        ? "Hostname cannot be safely provisioned as proposed. Choose another subdomain or inspect existing DNS records."
        : "No exact DNS record found. NOT ready to publish: Access policies, tunnel, wildcard DNS and write permissions are unverified; recheck before any mutation.",
    },
  };
}
