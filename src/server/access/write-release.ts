/**
 * M3.1 — Fail-closed write-release status contract.
 *
 * Presentation/diagnostic ONLY. Never use this as an authorization grant.
 * All mutation permissions are still refused by owner policy APIs and no
 * mutation tool is exposed by the remote or stdio MCP entrypoints.
 *
 * No environment variable, query parameter or client payload may override
 * any gate. Actual release requires audited OS containment and separate
 * server authorization architecture, not toggling the field below.
 */
export const WRITE_RELEASE_BLOCKERS = [
  "descriptor-relative-or-OS-sandboxed-path-containment",
  "root-identity-and-revocation-race-protection",
  "atomic-no-overwrite-and-version-checked-mutations",
  "per-client-per-root-per-tool-authorization",
  "path-bound-short-lived-local-delete-approval",
  "fail-closed-audit-and-adversarial-multi-OS-tests",
] as const;

export type WriteReleaseStatus = {
  available: false;
  mode: "read-only";
  stage: "M3-security-gate";
  blockers: readonly string[];
};

/** Information for a paired owner — never evidence that Write is enabled. */
export function writeReleaseStatus(): WriteReleaseStatus {
  return {
    available: false,
    mode: "read-only",
    stage: "M3-security-gate",
    blockers: [...WRITE_RELEASE_BLOCKERS],
  };
}
