import { z } from "zod";
import { CloudflareCredentialVault } from "../credentials/index.ts";
import { SavedCloudflarePreflight } from "./saved-preflight.ts";
import { createProvisioningPreview } from "./provisioning-plan.ts";
import { CloudflareRequester, cloudflareRequest, CloudflareApiError, ProvisioningError, requireAccountId, requireResourceId } from "./provisioning-api.ts";
import { DeploymentRepository, type DeploymentRecord } from "./deployment-state.ts";

/**
 * Protected-first, explicitly owner-approved Cloudflare deployment.
 *
 * Phase 1 prepare: Access application + exact email allow policy + Managed OAuth.
 * Phase 2 publish: recheck Access and DNS, create dedicated remote tunnel,
 * configure strictly loopback MCP ingress, then finally write DNS.
 *
 * No existing tunnel/app/DNS is adopted, deleted or overwritten.
 * State locks fail CLOSED after uncertain remote writes; recover manually.
 */
const hex = z.string().regex(/^[a-f0-9]{32}$/i);
const base = z.object({
  accountId: hex, domain: z.string().min(4).max(253),
  subdomain: z.string().min(1).max(40),
  allowedEmail: z.string().email().max(254),
  confirmHostname: z.string().min(4).max(253),
  confirmed: z.literal(true),
}).strict();

const PrepareInput = base.extend({
  action: z.literal("prepare"),
  redirectUris: z.array(z.string().min(12).max(300)).min(1).max(8),
}).strict();
const PublishInput = base.extend({ action: z.literal("publish") }).strict();
const CheckInput = base.omit({ confirmed: true }).extend({
  action: z.literal("check"),
  redirectUris: z.array(z.string().min(12).max(300)).min(1).max(8),
}).strict();
const Input = z.discriminatedUnion("action", [PrepareInput, PublishInput]);
type Prepared = z.infer<typeof PrepareInput>;

export class DeploymentStageError extends ProvisioningError {
  constructor(
    public readonly stage: string,
    public readonly providerStatus: number | null,
  ) {
    const guidance = providerStatus === 403 || providerStatus === 401
      ? "Token Cloudflare tidak diizinkan untuk operasi ini. Periksa scope terkait."
      : providerStatus === 400
        ? "Cloudflare menolak parameter permintaan ini. Periksa implementasi API sebelum mencoba lagi."
        : providerStatus === 404
          ? "Endpoint atau resource Cloudflare tidak ditemukan. Periksa konfigurasi."
          : providerStatus === null
            ? "Operasi tidak terkonfirmasi. Periksa resource Cloudflare sebelum mencoba lagi."
            : "Periksa izin, konfigurasi, dan status layanan Cloudflare.";
    super("Tahap " + stage + " gagal" +
      (providerStatus === null ? "" : " (Cloudflare HTTP " + providerStatus + ")") +
      ". " + guidance + " Jangan ulangi Publish sebelum pemeriksaan read-only.");
    this.name = "DeploymentStageError";
  }
}

export class DnsCompletionStageError extends ProvisioningError {
  public readonly safeCode: string | null;
  public readonly kind: string;
  constructor(public readonly stage: string, origin?: unknown) {
    super("Publikasi DNS gagal pada tahap " + stage +
      ". Belum aman untuk mengulang: periksa DNS dan deployment lock secara read-only.");
    this.name = "DnsCompletionStageError";
    const code = origin && typeof origin === "object" && "code" in origin
      ? origin.code : null;
    this.safeCode = typeof code === "string" &&
      ["EACCES", "EPERM", "EEXIST", "ENOENT", "EBUSY", "ENOTDIR", "EISDIR"].includes(code)
      ? code : null;
    this.kind = origin instanceof TypeError ? "type" :
      origin instanceof ReferenceError ? "reference" :
      this.safeCode ? "filesystem" : "unknown";
  }
}

export type ProvisioningStore = Pick<DeploymentRepository, "load" | "save" | "exclusive">;
export type CredentialReader = Pick<CloudflareCredentialVault, "read">;
export type Preflight = Pick<SavedCloudflarePreflight, "check">;
const origin = "http://127.0.0.1:8401";

export function callbackUris(uris: string[]): string[] {
  return uris.map(raw => {
    try {
      const wildcard = raw.endsWith("/*");
      const uri = new URL(wildcard ? raw.slice(0, -1) : raw);
      if (uri.protocol !== "https:" || uri.username || uri.password || uri.hash ||
          uri.port || uri.hostname === "localhost" || uri.hostname === "127.0.0.1" ||
          uri.search || raw.length > 300 || raw.includes("%") ||
          (raw.includes("*") && !wildcard)) throw new Error("Unsafe callback");
      return raw;
    } catch {
      throw new ProvisioningError("OAuth callback URLs must be explicit HTTPS redirect URIs.");
    }
  });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProvisioningError("Cloudflare returned an invalid resource.");
  }
  return value as Record<string, unknown>;
}
export function checkAccess(value: unknown, hostname: string, email: string, uris?: string[], policyList?: unknown) {
  const app = object(value);
  if (app.type !== "self_hosted" || app.domain !== hostname) {
    throw new ProvisioningError("Access application is not for the approved hostname.");
  }
  const oauth = object(app.oauth_configuration);
  if (oauth.enabled !== true) throw new ProvisioningError("Managed OAuth is not enabled.");
  const dcr = object(oauth.dynamic_client_registration);
  if (dcr.enabled !== true || dcr.allow_any_on_localhost === true ||
      dcr.allow_any_on_loopback === true) {
    throw new ProvisioningError("Managed OAuth dynamic client settings are unsafe.");
  }
  if (uris) {
    const returned = Array.isArray(dcr.allowed_uris) ? dcr.allowed_uris : [];
    if (uris.length !== returned.length || uris.some(uri => !returned.includes(uri))) {
      throw new ProvisioningError("Managed OAuth redirect allowlist was not confirmed.");
    }
  }
  const policies = policyList ?? app.policies;
  if (!Array.isArray(policies) || policies.length !== 1) {
    throw new ProvisioningError("Access email-only policy was not confirmed.");
  }
  const policy = object(policies[0]);
  if (policy.decision !== "allow" || !Array.isArray(policy.include) ||
      policy.include.length !== 1 || object(object(policy.include[0]).email).email !== email) {
    throw new ProvisioningError("Access policy does not restrict access to the approved email.");
  }
  if (!Array.isArray(policy.exclude) && policy.exclude !== undefined) {
    throw new ProvisioningError("Unexpected Access exclusions.");
  }
  const aud = app.aud;
  if (typeof aud !== "string" || !/^[A-Za-z0-9_-]{8,256}$/.test(aud)) {
    throw new ProvisioningError("Access application audience is unavailable.");
  }
  return { id: requireResourceId(String(app.id)), aud };
}

export class ProtectedCloudflareProvisioner {
  constructor(
    private readonly store: ProvisioningStore = new DeploymentRepository(),
    private readonly vault: CredentialReader = new CloudflareCredentialVault(),
    private readonly preflight: Preflight = new SavedCloudflarePreflight(),
    private readonly api: CloudflareRequester = cloudflareRequest(),
  ) {}

  private async preflightCandidate(data: { accountId: string; domain: string; subdomain: string; allowedEmail: string }) {
    const result = await this.preflight.check(data);
    if (result.preflight.status !== "candidate" || result.preflight.zoneActive !== true ||
        result.preflight.dnsScanTruncated || result.preflight.accountId !== data.accountId.toLowerCase()) {
      throw new ProvisioningError("Hostname is occupied or Cloudflare preflight is inconclusive.");
    }
    return result.preflight;
  }

  /**
   * Dashboard-only readiness check. Performs GET requests only.
   * Does not create Access, OAuth, tunnel, DNS, or persistent deployment state.
   * Mutations independently repeat these checks under the exclusive lock.
   */
  async checkSetup(raw: unknown) {
    const parsed = CheckInput.safeParse(raw);
    if (!parsed.success) throw new ProvisioningError("Lengkapi akun, hostname, email, dan callback OAuth yang valid.");
    const input = parsed.data;
    const plan = createProvisioningPreview({
      domain: input.domain,
      subdomain: input.subdomain,
      allowedEmail: input.allowedEmail,
    });
    if (plan.hostname !== input.confirmHostname) {
      throw new ProvisioningError("Konfirmasi hostname harus sama persis dengan hostname tujuan.");
    }
    callbackUris(input.redirectUris);
    if (await this.store.load()) {
      throw new ProvisioningError("Sudah ada deployment. Periksa statusnya sebelum memulai setup baru.");
    }
    const accountId = requireAccountId(input.accountId);
    const token = this.vault.read({ kind: "cloudflare-api-token", accountId });
    const preflight = await this.preflightCandidate({
      accountId, domain: plan.zone, subdomain: input.subdomain,
      allowedEmail: plan.allowedEmail,
    });
    let applications: unknown;
    try {
      applications = await this.api("GET", "/accounts/" + accountId + "/access/apps?per_page=100&page=1", token);
    } catch (error) {
      const status = error instanceof CloudflareApiError ? error.httpStatus : null;
      const guidance = status === 401
        ? "Autentikasi token ditolak. Periksa token tersimpan di Credential Vault."
        : status === 403
          ? "Akses ditolak. Periksa Account ID, Account Resources, dan izin Access: Apps and Policies."
          : status === 400 || status === 404
            ? "Periksa Account ID dan endpoint Access API yang digunakan."
            : status === 429
              ? "Cloudflare membatasi permintaan. Ulangi setelah beberapa saat."
              : "Periksa koneksi, respons Cloudflare, dan credential tersimpan.";
      throw new ProvisioningError(
        "Tidak dapat membaca Access apps" +
        (status === null ? "" : " (Cloudflare HTTP " + status + ")") +
        ". " + guidance,
      );
    }
    if (!Array.isArray(applications) || applications.length >= 100 ||
        applications.some(app => object(app).domain === plan.hostname)) {
      throw new ProvisioningError("Hostname sudah digunakan Access atau pemeriksaan aplikasi belum tuntas.");
    }
    return {
      ready: true as const,
      accountId,
      hostname: plan.hostname,
      zoneId: requireAccountId(preflight.zoneId),
      oauthRedirects: input.redirectUris,
      checks: {
        tokenFromKeychain: true as const,
        zoneActive: true as const,
        dnsHostnameAvailable: true as const,
        accessApplicationAvailable: true as const,
      },
      requiresApproval: true as const,
      cloudflareMutated: false as const,
    };
  }

  async execute(raw: unknown) {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ProvisioningError("Invalid or unconfirmed Cloudflare deployment request.");
    const input = parsed.data;
    // ProvisioningPreviewInput is strict: pass only the three preview fields.
    // Owner approval, account ID and OAuth callbacks belong to Input, not this schema.
    const plan = createProvisioningPreview({
      domain: input.domain,
      subdomain: input.subdomain,
      allowedEmail: input.allowedEmail,
    });
    if (plan.hostname !== input.confirmHostname) {
      throw new ProvisioningError("Approval must contain the exact target hostname.");
    }
    return this.store.exclusive(async () => {
      const existing = await this.store.load();
      const accountId = requireAccountId(input.accountId);
      const token = this.vault.read({ kind: "cloudflare-api-token", accountId });
      if (input.action === "prepare") {
        if (existing) throw new ProvisioningError("A deployment already exists; review it before creating another.");
        return this.prepare(input, plan.hostname, plan.zone, accountId, token);
      }
      if (!existing || existing.phase !== "access-ready" ||
          existing.accountId !== accountId || existing.hostname !== plan.hostname ||
          existing.allowedEmail !== input.allowedEmail.toLowerCase() ||
          existing.domain !== plan.zone) {
        throw new ProvisioningError("Verified Access preparation for this hostname is required before publication.");
      }
      return this.publish(existing, token);
    });
  }

  private async prepare(input: Prepared, hostname: string, zone: string, accountId: string, token: string) {
    const callbacks = callbackUris(input.redirectUris);
    const preflight = await this.preflightCandidate({
      accountId, domain: input.domain, subdomain: input.subdomain, allowedEmail: input.allowedEmail,
    });
    // No adoption or mutation of pre-existing Access applications on this hostname.
    const apps = await this.api("GET", "/accounts/" + accountId + "/access/apps?per_page=100&page=1", token);
    if (!Array.isArray(apps) || apps.length >= 100 || apps.some(app => object(app).domain === hostname)) {
      throw new ProvisioningError("Access application collision or inconclusive listing.");
    }
    const record: DeploymentRecord = {
      version: 1, accountId, zoneId: requireAccountId(preflight.zoneId),
      domain: zone, hostname, allowedEmail: input.allowedEmail.toLowerCase(),
      redirectUris: callbacks,
      phase: "preparing", accessAppId: null, aud: null, tunnelId: null, dnsRecordId: null,
    };
    // Save intention BEFORE any remote write; crashes cannot silently retry it.
    await this.store.save(record);
    const application = await this.api("POST", "/accounts/" + accountId + "/access/apps", token, {
      name: "Local MCP Manager - " + hostname,
      type: "self_hosted",
      domain: hostname,
      app_launcher_visible: false,
      session_duration: "24h",
      policies: [{
        name: "Allow only " + record.allowedEmail,
        decision: "allow",
        include: [{ email: { email: record.allowedEmail } }],
      }],
      oauth_configuration: {
        enabled: true,
        dynamic_client_registration: {
          enabled: true,
          allow_any_on_localhost: false, allow_any_on_loopback: false,
          allowed_uris: callbacks,
        },
        grant: { access_token_lifetime: "15m", session_duration: "168h" },
      },
    });
    // Persist returned ID immediately. If verification fails, manual review can
    // identify this resource; never blindly issue a second create request.
    const created = object(application);
    const appId = requireResourceId(String(created.id));
    record.accessAppId = appId;
    await this.store.save(record);
    const verified = await this.api("GET", "/accounts/" + accountId + "/access/apps/" + appId, token);
    const linkedPolicies = await this.api("GET", "/accounts/" + accountId + "/access/apps/" + appId + "/policies", token);
    const result = checkAccess(verified, hostname, record.allowedEmail, callbacks, linkedPolicies);
    if (result.id !== appId) throw new ProvisioningError("Access application identity changed.");
    record.aud = result.aud;
    record.phase = "access-ready";
    await this.store.save(record);
    return this.publicResult(record);
  }

  private async publicationStep<T>(stage: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DeploymentStageError) throw error;
      throw new DeploymentStageError(stage,
        error instanceof CloudflareApiError ? error.httpStatus : null);
    }
  }

  private async publish(record: DeploymentRecord, token: string) {
    const accountId = record.accountId;
    if (!record.accessAppId) throw new ProvisioningError("Access application identity is missing.");
    const app = await this.publicationStep("access-read",
      () => this.api("GET", "/accounts/" + accountId + "/access/apps/" + record.accessAppId, token));
    const policies = await this.publicationStep("access-policies-read",
      () => this.api("GET", "/accounts/" + accountId + "/access/apps/" + record.accessAppId + "/policies", token));
    const verified = await this.publicationStep("access-verify",
      async () => checkAccess(app, record.hostname, record.allowedEmail, record.redirectUris, policies));
    if (verified.aud !== record.aud) throw new DeploymentStageError("access-audience", null);

    await this.publicationStep("dns-preflight", () => this.preflightCandidate({
      accountId, domain: record.domain,
      subdomain: record.hostname.slice(0, -(record.domain.length + 1)),
      allowedEmail: record.allowedEmail,
    }));

    // Always record the remote tunnel ID before configuring ingress or DNS.
    // A lost create response leaves the lock held for explicit inspection.
    const tunnel = object(await this.publicationStep("tunnel-create",
      () => this.api("POST", "/accounts/" + accountId + "/cfd_tunnel", token, {
        name: "local-mcp-manager-" + record.hostname.replace(/\./g, "-"),
        config_src: "cloudflare",
      })));
    record.tunnelId = requireResourceId(String(tunnel.id));
    record.phase = "tunnel-ready";
    await this.publicationStep("tunnel-record", () => this.store.save(record));
    await this.publicationStep("tunnel-configure",
      () => this.api("PUT", "/accounts/" + accountId + "/cfd_tunnel/" + record.tunnelId + "/configurations",
        token, { config: { ingress: [
          { hostname: record.hostname, service: origin, originRequest: {} },
          { service: "http_status:404" },
        ] } }));

    // Recheck protected-first invariants immediately before DNS publication.
    const checked = await this.publicationStep("access-recheck",
      () => this.api("GET", "/accounts/" + accountId + "/access/apps/" + record.accessAppId, token));
    const currentPolicies = await this.publicationStep("access-policies-recheck",
      () => this.api("GET", "/accounts/" + accountId + "/access/apps/" + record.accessAppId + "/policies", token));
    const protectedAccess = await this.publicationStep("access-reverify",
      async () => checkAccess(checked, record.hostname, record.allowedEmail,
        record.redirectUris, currentPolicies));
    if (protectedAccess.aud !== record.aud) throw new DeploymentStageError("access-audience-recheck", null);

    const dns = object(await this.publicationStep("dns-create",
      () => this.api("POST", "/zones/" + record.zoneId + "/dns_records", token, {
        type: "CNAME", name: record.hostname,
        content: record.tunnelId + ".cfargotunnel.com", proxied: true,
      })));
    if (dns.name !== record.hostname || dns.type !== "CNAME") {
      throw new DeploymentStageError("dns-verify", null);
    }
    record.dnsRecordId = String(dns.id);
    record.phase = "published";
    await this.publicationStep("dns-record", () => this.store.save(record));
    return this.publicResult(record);
  }

  /**
   * Read-only readiness for a partially completed Tunnel; never creates a
   * second Tunnel or overwrites an existing DNS record.
   */
  private async inspectDnsCompletion(record: DeploymentRecord, token: string) {
    if (!record.accessAppId || !record.aud || !record.tunnelId ||
        record.phase !== "tunnel-ready" || record.dnsRecordId) {
      throw new ProvisioningError("DNS can only be completed for an existing, incomplete dedicated Tunnel.");
    }
    const prefix = "/accounts/" + record.accountId;
    const access = await this.publicationStep("dns-access-read",
      () => this.api("GET", prefix + "/access/apps/" + record.accessAppId, token));
    const policy = await this.publicationStep("dns-policy-read",
      () => this.api("GET", prefix + "/access/apps/" + record.accessAppId + "/policies", token));
    const inspected = await this.publicationStep("dns-access-verify",
      async () => checkAccess(access, record.hostname, record.allowedEmail,
        record.redirectUris, policy));
    if (inspected.id !== record.accessAppId || inspected.aud !== record.aud) {
      throw new DeploymentStageError("dns-access-mismatch", null);
    }

    const tunnel = object(await this.publicationStep("dns-tunnel-read",
      () => this.api("GET", prefix + "/cfd_tunnel/" + record.tunnelId, token)));
    if (tunnel.id !== record.tunnelId || tunnel.config_src !== "cloudflare" ||
        (tunnel.account_tag !== undefined && tunnel.account_tag !== record.accountId) ||
        tunnel.deleted_at != null) {
      throw new DeploymentStageError("dns-tunnel-mismatch", null);
    }
    const configuration = object(await this.publicationStep("dns-ingress-read",
      () => this.api("GET", prefix + "/cfd_tunnel/" + record.tunnelId + "/configurations", token)));
    const ingress = object(configuration.config).ingress;
    if (!Array.isArray(ingress) || ingress.length !== 2 ||
        object(ingress[0]).hostname !== record.hostname ||
        object(ingress[0]).service !== origin ||
        object(ingress[1]).service !== "http_status:404" ||
        object(ingress[1]).hostname != null) {
      throw new DeploymentStageError("dns-ingress-mismatch", null);
    }
    const subdomain = record.hostname.slice(0, -(record.domain.length + 1));
    const preflight = await this.publicationStep("dns-collision-check", () => this.preflightCandidate({
      accountId: record.accountId, domain: record.domain, subdomain,
      allowedEmail: record.allowedEmail,
    }));
    if (preflight.zoneId !== record.zoneId || preflight.hostname !== record.hostname) {
      throw new DeploymentStageError("dns-zone-mismatch", null);
    }
    return { hostname: record.hostname, tunnelId: record.tunnelId,
      target: record.tunnelId + ".cfargotunnel.com" };
  }

  async checkDnsCompletion() {
    if (!(this.store instanceof DeploymentRepository)) {
      throw new ProvisioningError("DNS completion is only available in the local repository.");
    }
    const record = await this.store.load();
    if (!record || record.phase !== "tunnel-ready") {
      throw new ProvisioningError("No incomplete dedicated Tunnel is eligible for DNS completion.");
    }
    const token = this.vault.read({ kind: "cloudflare-api-token", accountId: record.accountId });
    const verified = await this.inspectDnsCompletion(record, token);
    return {
      ready: true as const,
      cloudflareMutated: false as const,
      hostname: verified.hostname, target: verified.target,
      tunnelId: verified.tunnelId,
      lock: await this.store.lockStatus(), requiresApproval: true as const,
    };
  }

  async finalizeDns(raw: unknown) {
    const payload = z.object({
      confirmed: z.literal(true),
      confirmHostname: z.string().min(4).max(253),
    }).strict().safeParse(raw);
    if (!payload.success) {
      throw new ProvisioningError("Completing DNS requires explicit owner consent and exact hostname.");
    }
    if (!(this.store instanceof DeploymentRepository)) {
      throw new ProvisioningError("DNS finalization requires a real local deployment repository.");
    }
    // Do not expose unknown native or provider exception text to the browser.
    // Label only the current safe stage. Any failed mutation keeps the lock.
    let stage = "deployment-lock";
    try {
      return await this.store.exclusiveDnsCompletion(async () => {
        stage = "deployment-read";
        const record = await this.store.load();
        if (!record || record.hostname !== payload.data.confirmHostname ||
            record.phase !== "tunnel-ready" || !record.tunnelId || record.dnsRecordId) {
          throw new ProvisioningError("Existing dedicated Tunnel / hostname does not match the approved DNS request.");
        }
        stage = "credential-read";
        const token = this.vault.read({ kind: "cloudflare-api-token", accountId: record.accountId });
        stage = "remote-check";
        const verified = await this.inspectDnsCompletion(record, token);
        stage = "dns-create";
        const created = object(await this.publicationStep("dns-resume-create", () =>
          this.api("POST", "/zones/" + record.zoneId + "/dns_records", token, {
            type: "CNAME", name: record.hostname, content: verified.target, proxied: true,
          })));
        const dnsId = typeof created.id === "string" && /^[a-f0-9]{32}$/i.test(created.id)
          ? created.id : null;
        if (!dnsId) {
          throw new DeploymentStageError("dns-resume-response", null);
        }
        stage = "dns-verify";
        const confirmed = object(await this.publicationStep("dns-resume-verify", () =>
          this.api("GET", "/zones/" + record.zoneId + "/dns_records/" + dnsId, token)));
        if (confirmed.id !== dnsId || confirmed.type !== "CNAME" ||
            confirmed.name !== record.hostname ||
            String(confirmed.content).toLowerCase() !== verified.target.toLowerCase() ||
            confirmed.proxied !== true) {
          throw new DeploymentStageError("dns-resume-mismatch", null);
        }
        stage = "deployment-save";
        record.dnsRecordId = dnsId;
        record.phase = "published";
        await this.publicationStep("dns-resume-save", () => this.store.save(record));
        stage = "lock-commit";
        return { ...this.publicResult(record), dnsCompleted: true as const };
      });
    } catch (error) {
      if (error instanceof ProvisioningError) throw error;
      throw new DnsCompletionStageError(stage, error);
    }
  }

  private publicResult(record: DeploymentRecord) {
    return {
      phase: record.phase, hostname: record.hostname, accountId: record.accountId,
      allowedEmail: record.allowedEmail, redirectUris: record.redirectUris,
      accessAppId: record.accessAppId, accessAudience: record.aud,
      tunnelId: record.tunnelId, dnsRecordId: record.dnsRecordId,
      managedOAuthEnabled: record.phase !== "preparing",
      emailRestricted: record.phase !== "preparing",
      mcpOrigin: origin,
      connectorRunning: false, // Connector start/stop is a separate stage.
      clientConnected: false,
    };
  }

  /**
   * Explicit owner-approved LOCAL lock recovery; never changes Cloudflare.
   * Only supports access-ready with no recorded Tunnel/DNS and a stale lock.
   * Repeats all remote reads within the exclusive recovery guard.
   */
  async recover(raw: unknown) {
    const parsed = z.object({
      action: z.literal("recover"),
      confirmed: z.literal(true),
      confirmHostname: z.string().min(4).max(253),
    }).strict().safeParse(raw);
    if (!parsed.success) throw new ProvisioningError("Recovery needs exact hostname and explicit consent.");
    const repository = this.store;
    if (!(repository instanceof DeploymentRepository)) {
      throw new ProvisioningError("Recovery is unavailable outside the local deployment store.");
    }
    const record = await repository.load();
    if (!record || record.phase !== "access-ready" ||
        record.hostname !== parsed.data.confirmHostname || !record.accessAppId ||
        !record.aud || record.tunnelId || record.dnsRecordId) {
      throw new ProvisioningError("The recorded deployment is not eligible for safe recovery.");
    }
    await repository.recoverLockAfter(async () => {
      const inspected = await this.diagnose();
      const matchingHostname = "hostname" in inspected &&
        inspected.hostname === record.hostname;
      const noTunnelId = "tunnelId" in inspected && inspected.tunnelId === null;
      if (inspected.phase !== "access-ready" || !matchingHostname ||
          inspected.lock !== "held" || inspected.access !== "verified" ||
          inspected.tunnel !== "absent" || inspected.dns !== "available" ||
          !noTunnelId) {
        throw new ProvisioningError(
          "Cloudflare resources cannot be proven safe. Recovery refused; lock remains held.",
        );
      }
    });
    return {
      recovered: true as const,
      phase: "access-ready" as const,
      hostname: record.hostname,
      cloudflareMutated: false as const,
      next: "Refresh Cloudflare readiness and confirm Tunnel Write + DNS Edit before publishing.",
    };
  }

  /**
   * Safe inspection after an uncertain Cloudflare write. GET requests only:
   * do NOT clear a deployment lock, adopt an existing tunnel, or retry a POST.
   * Results never contain OS keychain tokens or arbitrary Cloudflare errors.
   */
  async diagnose() {
    const record = await this.store.load();
    if (!record) {
      return { phase: "not-started" as const, lock: "clear" as const,
        access: "not-created" as const, tunnel: "not-created" as const,
        dns: "not-created" as const, canRetry: false as const };
    }
    const lock = this.store instanceof DeploymentRepository
      ? await this.store.lockStatus()
      : "unknown" as const;
    let token: string;
    try {
      token = this.vault.read({ kind: "cloudflare-api-token", accountId: record.accountId });
    } catch {
      return { phase: record.phase, lock, access: "unverified" as const,
        tunnel: "unverified" as const, dns: "unverified" as const,
        notes: ["Token Cloudflare tidak dapat dibaca dari OS Keychain."],
        canRetry: false as const };
    }

    let access: "verified" | "unverified" = "unverified";
    let dns: "available" | "occupied" | "unverified" = "unverified";
    let tunnel: "absent" | "present" | "unverified" = "unverified";
    let tunnelId: string | null = record.tunnelId;
    const notes: string[] = [];

    if (record.accessAppId) {
      try {
        const app = await this.api("GET",
          "/accounts/" + record.accountId + "/access/apps/" + record.accessAppId, token);
        const policies = await this.api("GET",
          "/accounts/" + record.accountId + "/access/apps/" + record.accessAppId + "/policies", token);
        const verified = checkAccess(app, record.hostname, record.allowedEmail, record.redirectUris, policies);
        if (verified.id === record.accessAppId && verified.aud === record.aud) access = "verified";
        else notes.push("Access audience tidak sesuai dengan metadata lokal.");
      } catch {
        notes.push("Konfigurasi Access/OAuth belum dapat diverifikasi. Periksa Access Apps and Policies.");
      }
    } else notes.push("Belum ada ID aplikasi Access yang dikonfirmasi.");

    try {
      const subdomain = record.hostname.slice(0, -(record.domain.length + 1));
      const result = await this.preflight.check({
        accountId: record.accountId, domain: record.domain, subdomain,
        allowedEmail: record.allowedEmail,
      });
      dns = result.preflight.dnsScanTruncated
        ? "unverified"
        : result.preflight.status === "candidate" ? "available" : "occupied";
      if (dns === "occupied") notes.push("DNS hostname sudah ada. Jangan buat record duplikat.");
    } catch {
      notes.push("DNS hostname belum bisa diperiksa. Periksa izin Zone/DNS Read.");
    }

    try {
      const expected = "local-mcp-manager-" + record.hostname.replace(/\./g, "-");
      const found = await this.api("GET", "/accounts/" + record.accountId +
        "/cfd_tunnel?name=" + expected + "&per_page=100&page=1", token);
      if (!Array.isArray(found) || found.length >= 100) {
        notes.push("Daftar tunnel tidak lengkap. Jangan mengulang pembuatan.");
      } else {
        const matches = found.filter(value => object(value).name === expected &&
          object(value).deleted_at == null);
        if (matches.length === 0) {
          tunnel = "absent";
          if (record.tunnelId) notes.push("Tunnel ID tersimpan tetapi tunnel tidak ditemukan.");
        } else if (matches.length === 1) {
          tunnel = "present";
          tunnelId = requireResourceId(String(object(matches[0]).id));
        } else {
          notes.push("Ada lebih dari satu tunnel dengan nama yang sama. Tinjau di Cloudflare.");
        }
      }
    } catch {
      notes.push("Daftar tunnel tidak bisa dibaca. Token memerlukan Cloudflare Tunnel Read/Write.");
    }
    if (lock === "held") notes.push(
      "Deployment lock aktif. Jangan ulangi Publish sebelum resource yang mungkin dibuat diperiksa.",
    );
    return {
      phase: record.phase, hostname: record.hostname, lock,
      access, tunnel, tunnelId, dns, notes, canRetry: false as const,
    };
  }

  async status() {
    const record = await this.store.load();
    return record ? this.publicResult(record) : { phase: "not-started" as const,
      connectorRunning: false, clientConnected: false };
  }
}
