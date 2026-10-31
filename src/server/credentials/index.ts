import { createRequire } from "node:module";
import { TokenInput } from "../cloudflare/account-connection.ts";

/**
 * P1D-B: server-side-only OS credential storage.
 *
 * Never return a credential through a dashboard GET endpoint or write the
 * token into cloudflare.json, cookies, logs, environment variables, or CLI args.
 * Future owner-protected handlers may call this broker, never browser code.
 */
export const VAULT_SERVICE = "local-mcp-manager.cloudflare.v1";
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
export type CredentialReference = Readonly<{
  kind: "cloudflare-api-token";
  accountId: string;
}>;

export type KeyringEntry = {
  setPassword(value: string): void;
  getPassword(): string;
  deletePassword(): void;
};
export type KeyringFactory = (service: string, account: string) => KeyringEntry;

export class CredentialVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialVaultError";
  }
}

function accountReference(ref: CredentialReference): string {
  if (!ref || typeof ref !== "object" || Object.keys(ref).length !== 2 ||
      ref.kind !== "cloudflare-api-token" || typeof ref.accountId !== "string" ||
      !ACCOUNT_ID.test(ref.accountId)) {
    throw new CredentialVaultError("Invalid credential reference.");
  }
  return "cloudflare-api-token:" + ref.accountId.toLowerCase();
}

function validToken(token: unknown): asserts token is string {
  // No validation exception is allowed to echo token bytes to callers.
  if (!TokenInput.safeParse({ token }).success) {
    throw new CredentialVaultError("Invalid Cloudflare credential format.");
  }
}

// Runtime only; tests inject an isolated fake instead of touching a real vault.
// Use a native API (never macOS security -w or another argv-based secret path).
const loadNative = createRequire(import.meta.url);
export function createNativeKeyringFactory(
  platform: NodeJS.Platform = process.platform,
  load: (specifier: string) => unknown = loadNative,
): KeyringFactory {
  if (platform !== "linux" && platform !== "win32" && platform !== "darwin") {
    throw new CredentialVaultError("Native OS credential storage is unavailable.");
  }
  let Entry: new (
    service: string, account: string,
    options?: { linux: { store: "secret-service" } },
  ) => KeyringEntry;
  try {
    const binding = load("@napi-rs/keyring") as { Entry?: typeof Entry };
    if (!binding || typeof binding.Entry !== "function") {
      throw new Error("Missing native binding.");
    }
    Entry = binding.Entry;
  } catch {
    // Do not log native loader errors; they can contain local file paths.
    throw new CredentialVaultError("Native OS credential storage is unavailable.");
  }
  return (service, account) => {
    try {
      // Enforce persistent Secret Service for Linux, with NO keyutils fallback.
      const options = platform === "linux" ? { linux: { store: "secret-service" as const } } : undefined;
      return new Entry(service, account, options);
    } catch {
      throw new CredentialVaultError("Native OS credential storage is unavailable or locked.");
    }
  };
}

export class CloudflareCredentialVault {
  constructor(private readonly createEntry: KeyringFactory = createNativeKeyringFactory()) {}

  private entry(ref: CredentialReference): KeyringEntry {
    const account = accountReference(ref);
    try {
      return this.createEntry(VAULT_SERVICE, account);
    } catch {
      throw new CredentialVaultError("Native OS credential storage is unavailable or locked.");
    }
  }

  /** Create or replace an installation-scoped token in the native vault. */
  store(ref: CredentialReference, token: unknown): CredentialReference {
    accountReference(ref);
    validToken(token);
    try {
      this.entry(ref).setPassword(token);
    } catch {
      throw new CredentialVaultError("Could not securely store the Cloudflare credential.");
    }
    // Only nonsecret references may escape this module.
    return { kind: "cloudflare-api-token", accountId: ref.accountId.toLowerCase() };
  }

  /**
   * Server-side only. The caller MUST authenticate the owner before invoking
   * this method, and MUST NOT serialize its return value to an API response.
   */
  read(ref: CredentialReference): string {
    try {
      const token = this.entry(ref).getPassword();
      validToken(token);
      return token;
    } catch {
      throw new CredentialVaultError("Cloudflare credential is unavailable or locked.");
    }
  }

  /** Rotation requires a previously readable credential (no implicit create). */
  rotate(ref: CredentialReference, newToken: unknown): CredentialReference {
    accountReference(ref);
    validToken(newToken);
    const entry = this.entry(ref);
    try {
      const current = entry.getPassword();
      validToken(current);
      entry.setPassword(newToken);
    } catch {
      throw new CredentialVaultError("Could not securely rotate the Cloudflare credential.");
    }
    return { kind: "cloudflare-api-token", accountId: ref.accountId.toLowerCase() };
  }

  /** Explicit deletion. Missing or locked entries are errors, never false success. */
  revoke(ref: CredentialReference): void {
    try {
      this.entry(ref).deletePassword();
    } catch {
      throw new CredentialVaultError("Could not securely revoke the Cloudflare credential.");
    }
  }
}
