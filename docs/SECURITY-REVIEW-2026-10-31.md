# Security Review — Initial Static Assessment (2026-10-31)

**Reviewer:** AI-assisted source inspection through authorized Arch Local MCP V2.
**Scope:** initial code review, not a penetration test or full release audit.
**Evidence:** `src/server/files/index.ts`, `src/server/access/index.ts`, `src/server/http/local-only.ts`, `src/server/http/local-policy.ts`, `src/server/mcp/http.ts`, `src/server/owner/index.ts`, `src/server/cloudflare/deployment-state.ts`, `src/server/cloudflare/protected-provisioner.ts`, `package.json`, installed Next/React metadata.
**Execution limits:** connector cannot execute shell, compile Next, run tests, or read .tsx source files. No host test results are asserted below.

## Findings, sorted by priority

| ID | Severity | Finding | Evidence | Release decision |
|---|---|---|---|---|
| SEC-01 | Critical for proposed feature | Filesystem parent-symlink TOCTOU still exists. Current read checks and O_NOFOLLOW on leaf do not guarantee descriptor-relative parent containment for remote mutation. | FileEngine comment + `resolve()`, `writeFile()` | **Do not enable remote Write until fixed/tested** |
| SEC-02 | High for UX/integrity | Frontend presents a read/write selector but `addReadOnlyRoot()` creates only `access:"read"`, policy API reports `mode:"read-only"`, and remote MCP registers only 5 read tools. | `src/server/http/local-policy.ts`, `src/app/api/local/policy/route.ts`, `src/server/mcp/http.ts` | Hide/disable unsafe selector and explain future availability |
| SEC-03 | High operational | Source-install startup previously needed a separate `owner:pair` command. Removing pairing without replacement would expose Cloudflare mutation APIs to other local browser processes. | `src/server/owner/index.ts`, `scripts/owner-pair.ts`, owner route | New secure launcher introduced; **requires host QA** |
| SEC-04 | Medium | Production examples and outdated 'alpha/not connected' claims can mislead user about permissions and connection status. | `src/lib/demo.ts`, README, status messages | Sample roots/events now emptied, remaining UI copy must be inspected |
| SEC-05 | Medium | No trustworthy end-to-end verification of client health from dashboard process states; 401 confirms protection, not real client OAuth tool capability. | `src/app/api/local/status/route.ts` | Require real ChatGPT and Claude MCP calls in QA; label status accurately |
| SEC-06 | Medium | Prior remote provisioning/rollback can leave lock after uncertain provider mutations; manual recovery is intentionally fail-closed. | deployment state, OAuth manager | Preserve locks, add safe reconciliation UX; never auto-delete |
| SEC-07 | Medium | Production source includes legacy backups, multiple standalone setup paths, and outdated README, increasing maintainer error. | top-level directory listing and README | Cleanup only after successful tests and backup review |
| SEC-08 | Dependency | Next.js 16 versions below **16.4.1** are affected by October 2026 security advisories. Current installed `node_modules/next` is **16.4.3**, React and ReactDOM **19.3.1**. | Local installed package metadata + Next.js October 14, 2026 advisory | Installed instance meets advisory floor; verify lockfile and npm audit for clean install |
| SEC-09 | Gap | Cross-platform OS-native installer/privilege isolation and security of Windows keychain ACLs not independently validated. | launcher/owner design, README | Do not mark packaged release-ready until tested on target OS |

## Controls already present (preserve)

- Dashboard/API localhost-only checks; credentials and policy mutations require owner cookie and CSRF header.
- Owner cookies are HMAC-signed; tickets are random, short-lived, single use and stored hashed.
- Default MCP policy has zero approved roots and all write tools disabled.
- Remote MCP requires Cloudflare Access JWT verification at the origin and listens on 127.0.0.1:8401, not dashboard port 3100.
- Cloudflare Access is created and verified before Tunnel/DNS publication, with explicit owner approvals.
- API tokens stored in OS Keychain, not sent back to the browser after persistence.
- Remote filesystem enforces root-based permission checks and refuses hidden path parts, symlinks, hardlinks and excessive file content.

## Potential false assurance to avoid

- A running Tunnel, 401 anonymous request, successful DCR or a saved callback does not mean an AI client can execute tools.
- A dropdown displaying Write does not mean the backend can honor or secure it.
- A static source inspection and a passing `npm audit` alone do not establish safety.
- The current Cloudflare API PUT retains application configuration: check payload fields and guard against optimistic-concurrency loss in tests, not by trusting returned HTTP 200 alone.

## Required tests and audit tooling before release

1. `npm run audit:all`: TS, static audit, unit tests, MCP smoke, production Next build.
2. `npm audit --omit=dev --audit-level=high`: verify advisories; never hide high/critical failures.
3. Scan source with `semgrep` or equivalent CWE rules for path traversal, TOCTOU, command injection, CSRF, credential leaks and misconfigured HTTP handlers.
4. Check `git ls-files` and `git status` for secrets, test logs, tmp binaries, `.env` and unexpected changes.
5. E2E browser fresh state: launch, automatic pairing, file access, keychain, Cloudflare preview/approval, MCP start, Tunnel start, ChatGPT & Claude OAuth, authenticated `list_roots`.
6. Negative browser tests from foreign origins, expired/reused ticket, absent cookie, malformed CSRF header and forged owner cookie.
7. Filesystem tests with symlink and hardlink, concurrent parent rename, path traversal, non-UTF8, oversized text, case-insensitive Windows paths, policy overlap and mutation during revocation.
8. Cloudflare simulated errors 400/401/403/5xx/lost response and stale snapshot before any deployment release.
9. Manual QA on clean Windows/macOS/Linux systems for keychain access and browser launcher; do not claim built installers until tested.

## External security references

- Next.js October 2026 patched releases: https://nextjs.org/blog/nextjs-security-update-october-14-2026
- OWASP on race conditions: https://community.owasp.org/pages/vulnerabilities/race_conditions
- Cloudflare Managed OAuth / RFC 8707: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/

**Current verdict:** NOT READY TO PUBLISH. Existing read-only MCP may remain in use under its current restrictions, but expanded write permissions, installer release and production claims remain gated.
