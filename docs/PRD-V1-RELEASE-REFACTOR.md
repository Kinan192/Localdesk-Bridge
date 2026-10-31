# Local MCP Manager — Release PRD (v1.0 candidate)

**Status:** implementation in progress; NOT approved for public release.
**Date:** 2026-10-31
**Target:** self-hosted local desktop dashboard, initially source-installed; ChatGPT Web + Claude Web through one remotely accessible MCP origin.
**Rules:** dashboard stays bound to 127.0.0.1:3100; MCP origin is 127.0.0.1:8401; Cloudflare Access with email allowlist and origin JWT verification stay enabled; no shell execution from MCP; no secret leakage to browser, URLs, docs, logs, Git, or test fixtures.

## Problem statement

The working proof of concept can authenticate ChatGPT and Claude Web, but setup is scattered across standalone paths. The read/write selector is misleading because the API policy and remote tool registry are read-only. Owner pairing still has a developer command. Some documents and sample UI reflect old alpha milestones rather than actual connected functionality.

## Product outcomes

1. A first-time user can launch the dashboard from a single command, with secure browser authorization that does not require `owner:pair`.
2. The main user journey is a single setup center with explicit progress, inline guidance, validation, and safe recovery. Users should not need to know URL paths.
3. Users can approve selected directories for read-only or read/write individually **only after remote-write security gates pass**.
4. Both ChatGPT Web and Claude Web can connect to the same protected MCP origin, with separate registered clients and callbacks.
5. Installation, dependency prerequisites, Cloudflare token scopes, domain, Access app, dedicated Tunnel, MCP listener, OAuth, and test commands are documented for non-developers.
6. Production UI has no sample analytics or development-only success/error wording; diagnostics are concise, actionable and safe to share.
7. A clean install and upgrade of an existing configuration both pass release test gates; neither creates a second Access app/Tunnel/DNS record when updating callbacks.
8. The GitHub release contains only active source, essential documentation, automated tests, and verified packaging artifacts.

## Acceptance criteria by subsystem

### UX / setup
- One dashboard entry point with progress for System, File Access, Cloudflare credentials, Access/OAuth, Tunnel/DNS, MCP service, Client connections, Verification.
- Existing setups resume from persisted verified state; no unnecessary reprovisioning.
- Destructive remote operations require explicit owner confirmation. Intermediate progress may be saved, but claimed success requires verification.
- Error/warning/success copy uses universal labels (no names, personal account details, example production domains, or stale test references).
- Each step has a back path to the setup center, status, requirements and retry guidance; layout uses shared visual patterns.

### Owner authority
- Developer-only pairing command is NOT part of user startup.
- Server launcher creates a time-limited, one-use ticket bound to the existing owner session scheme; launches the local browser or displays the safe localhost link.
- No anonymous privilege grant via opening the dashboard URL. No permanent pairing bypass; sessions expire.
- Dashboard and all local mutation routes require signed owner session, localhost/Host/Origin protection, CSRF headers and same-site cookies.
- Auto-launch feature may be used by a native installer later; launcher must remain restricted to localhost.

### Read/write
- Default roots remain empty and read-only; global write tools default disabled.
- Per-root Access modes are read or write, enforced server-side on each request.
- Before enabling remote mutation: resist parent-symlink swap/TOCTOU using hardened OS-aware primitives/process isolation; reject symlinks/hardlinks/traversal, system and hidden paths, overlapped roots, and protected credential directories.
- Create/write/edit/rename/delete are separately authorized; edits support expected SHA/optimistic concurrency; no-overwrite by default.
- Delete is opt-in, with local human approval appropriate to the action and audit trail.
- Remote HTTP and stdio registrations must match supported policy; no 'enabled' UI for unimplemented tools.
- MCP request body and response size bounded; calls logged without file contents or credentials.

### Cloudflare/clients
- Credentials remain in OS Keychain and never reach the browser after save.
- No anonymous or unprotected tunnel to dashboard.
- Callback changes are read->compare->update->verify on the existing Access app; preserve email policy, AUD, DNS, Tunnel, and other callbacks.
- Cloudflare config check distinguishes token-scope failure, DNS conflict, Access policy mismatch, tunnel stopped, remote listener stopped, and client OAuth failures.
- Authentication with ChatGPT Web and Claude Web is retested independently.

### Release quality
- No mock/sample/demo data in production UI; keep tests and synthetic fixtures in test folders.
- TypeScript, lint/static audit, security unit tests, MCP smoke tests, Next build, npm dependency audit and browser E2E must pass on a clean environment.
- Manual threat tests: unauthenticated dashboard, localhost CSRF, expired ticket/session, malicious relative path, symlink/hardlink, concurrent writers, stale OAuth snapshot, lost Cloudflare write response, invalid Access JWT, client revocation.
- CI validates Linux at minimum; packaging/manual QA on Windows/macOS when installer is implemented.
- Neither source credentials nor real account/domain/email/callback IDs are committed.

## Milestones (sequential gates)

| ID | Deliverable | Gate | Status |
|---|---|---|---|
| M0 | Inventory, PRD, security risk register, baseline report | Review source and protect current working config | In progress |
| M1 | Secure one-command local launcher and owner browser pairing | No separate `owner:pair`; session still enforced | In progress |
| M2 | Unified setup center + universal UX messaging and documentation | New install + resume flow demonstrable | Pending |
| M3 | Safe write subsystem, policy UI, per-tool approvals | Filesystem attack suite must pass | BLOCKED until security design proven |
| M4 | Clean code refactor and UI migration | Existing contracts preserved; no breaking MCP tools | Pending |
| M5 | Static/dynamic security review + staged release QA | Full audit, build, E2E & fresh-install approval | Pending |
| M6 | GitHub release preparation and cleanup | Signed-off release checklist + no secrets/legacy | Pending |

## Out of scope unless explicitly authorized

- Exposing local dashboard/admin port publicly.
- Remote shell execution, arbitrary commands, auto-run AI mutations.
- Multi-user cloud accounts, hosted SaaS, permanent systemd daemon.
- Removing security tests to make a release smaller.
- Automatically deleting user's previous Cloudflare/Tunnel resources or local project backups.

## Release blockers observed from source

**SEC-01 (high):** FileEngine warns parent-directory TOCTOU can escape root, so remote Write MUST stay unavailable until hardened and tested.

**SEC-02 (high):** Existing frontend offers read/write selector while API only supports addReadOnlyRoot and remote MCP advertises five read-only tools. UI must explicitly say unavailable rather than suggest a permission change was applied.

**UX-01:** `npm run dev` plus `npm run owner:pair` is development-only startup; use a trusted launcher with the existing ticket mechanism.

**UX-02:** Standalone cloudflare-setup, cloudflare-config, credential-vault, tunnel-control, oauth-settings and main onboarding lack one unified navigation and status flow.

**REL-01:** README still contains outdated claims such as 'Claude Web has not been tested' and lists sample/mock data. It must be reconciled against real code and actual user tests before release.

**REL-02:** `apps/`, `packages/`, `reference-v4/` are declared legacy in README, but removal requires verifying active imports, build and backup policy.

**TEST-01:** Arch Local MCP file connector can edit .ts/.js/.md but refuses to read .tsx; it cannot execute shell. Full TSX/UI audit, automated test runs and packaging must be verified on the host before declaring release-ready.

## Change policy

- Never put real Cloudflare API tokens, Access JWTs, client secrets, private keys, pairing tickets or actual personal identifiers into PRD or fixtures.
- Backup/commit before migrations and record test outcomes, not guesses.
- Prefer small reversible commits with tests after each milestone.
- Never silently convert an existing root from read to write; require new explicit approval.
