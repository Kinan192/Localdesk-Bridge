# Baseline Audit — Local MCP Manager (v1 release refactor)

**Date:** 2026-10-31  
**Audit status:** Source review only; host tests and TSX visual review not yet executed.  
**Source:** ~/Projects/local-mcp-manager, Arch Local MCP V2. No changes to live credentials, remote resources or file permissions during this audit.

## Product feature inventory

| Domain | Existing implementation / evidence | Observed gap | Owner |
|---|---|---|---|
| Owner browser auth | src/server/owner/index.ts; owner/pair API; launch-dashboard.ts; dashboard-launch.ts | Live npm start / browser end-to-end, replay/expiry/port squat tests require host | M1 |
| Local admin security | src/server/http/local-only.ts and localhost-policy.ts; owner-protected API routes | Verify route coverage and real browser Host/Origin/CSRF behavior | M1 |
| Unified onboarding | src/app/setup-center/page.js, setup progress; src/app/api/local/onboarding | Current Setup Center still redirects to detailed feature routes; full inline wizard needed | M2 |
| Keychain / Cloudflare setup | src/server/credentials, src/server/cloudflare; credential-vault, cloudflare-setup pages | Full live provider recovery and existing deployment upgrade checks | M2 / M5 |
| OAuth / ChatGPT / Claude | oauth-settings route, Cloudflare Access config, remote MCP | Real authenticated client list_roots/read_file must be re-tested independently | M2 / M5 |
| File access | local-policy.ts, PolicyEngine, FileEngine | Read-only API; Write not safe; UI selector misleading | M3 |
| MCP HTTP | src/server/mcp/http.ts, 5 read tools, JWT verification | Write not registered; no guarantee of client connection from 401 | M3 / M5 |
| Service control | src/server/service, src/server/tunnel | Supervisors only track children they own; manual Cloudflared replica must be handled explicitly | M2 / M5 |
| UI / clean code | src/app, src/components, src/features; Tailwind v4 | Inconsistent setup pages, duplicate navigation, unreviewed .tsx components, legacy directories | M4 |
| Audit / release | npm scripts audit:all, release:check, tests/foundation and tests/mcp | No execution evidence in this tool session; missing complete browser E2E and target platform matrix | M5 / M6 |

## Technical debt, risks and migration policy

- **Critical security gate:** parent directory symlink TOCTOU affects path-based file mutation. Never expose remote Write until OS-aware containment is implemented and stress-tested.
- **High UX:** setup flow crosses multiple URLs instead of one inline wizard. In M2 move working controls into the wizard without changing backend protections.
- **High authorization QA:** launcher authenticity check, one-time tickets, cookie/CSRF and local-only enforcement need actual negative integration tests on host.
- **Medium complexity:** duplicated setup routes and unused legacy trees may be removable, but only after import/search/build evidence.
- **Medium quality:** historical docs and status wording may overstate connectivity. The user-visible UI must distinguish configured/listening/connected/verified.
- **Medium deployment:** Cloudflare callback changes must preserve existing Access email policy, AUD, Tunnel and DNS. No automatic recreate/delete in migration.

## Target architecture

Keep the single Next.js application. Thin routes delegate to validated server services; source UI becomes shared AppShell, typed feature view models and reusable components; setup state has one authoritative owner. Keep policy and credentials outside frontend. No arbitrary shell execution from remote MCP. Source structure in PRD section 5 is the target, not an immediate migration command.

## Acceptance traceability

Owner requirement (1) clean code -> FR-12, T-07, M4 after feature bug fixes.
Owner requirement (2) direct single setup flow -> FR-04/05, T-03, M2.
Owner requirement (2.1) safe Read & Write -> FR-07/08/09, T-04, M3.
Owner requirement (3) setup guidance -> FR-06/10, T-03/T-05/T-06, M2.
Owner requirement (4) minimal effective UI -> FR-11, T-07, M4.
Owner requirement (5) AI security audit -> FR-13, T-08, M5.
Owner requirement (6) full QA and pre-GitHub gate -> FR-14/15, T-09, M5/M6.
Prior startup requirement -> FR-01/02/03, T-01/T-02, M1.

## Evidence ledger

- **Verified through file reads:** PRD/README/security review, owner launcher, owner API/pairing, localhost policy, tests and npm scripts exist; Write tools are disabled in remote registry.
- **Not verified by a running test process:** npm typecheck, unit tests, dependency audit, production build, browser first-run, Windows/macOS smoke, live Cloudflare and ChatGPT/Claude OAuth.
- **Uninspected source:** .tsx components, including root dashboard owner banner and File Access UI, due to Arch Local MCP file-type restrictions. Host test suite statically inspects these files, but static checks are not a substitute for a full UI review.
- **Working tree:** pre-existing uncommitted changes in README, PRD, scripts, setup pages, tests. Preserve them; never assume clean working tree.

## M0 decision

The functional specification, baseline risks and traceability matrix are now documented. Source-level M0 work is complete. Host-based verification remains an explicit M1/M5 obligation; lack of host execution is not to be hidden. Continue with **M1 only**, leaving M2-M6 provisional.

## M1 checklist

- Validate npm start source-install entry point and child-listener identity proof.
- Test owner ticket issuance, one use, expiry, browser cookie and malicious/forged Host/Origin/CSRF.
- Fail closed on occupied port, preexisting unmanaged dashboard and crashed child.
- Validate Ctrl+C stops only managed child and never stops the owner's separate MCP/Tunnel service.
- Run TS / unit / integration / production build and real browser tests on host.
- Owner approval before marking M1 complete or starting M2.
