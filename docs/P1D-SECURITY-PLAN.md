# P1D — Native Authorization, Sensitive Read Endpoints & OS Secret Storage

**Created:** 2026-10-29
**Status:** P1D-A developer-alpha gate PASSED. P1D-B native OS credential broker verified with synthetic Secret Service smoke; owner-protected credential API passed prior HTTP 401 check; standalone Credential Vault UI audited 2026-10-29 (96 source files, 60/60 foundation tests, 3/3 MCP smoke tests, TS/build PASS). Browser screenshot and logs confirm `/credential-vault` loads (HTTP 200) and displays paired-owner forms. Actual Cloudflare token lifecycle via browser, unpaired vault screen and Windows/macOS QA remain pending. No Cloudflare provisioning.
**Depends on:** P1C developer-alpha acceptance complete: 89 audited sources, 44/44 foundation tests, 3/3 MCP smoke tests, both TS checks and Next.js build; real browser `paired: true`; live unauthenticated PATCH /api/local/policy returned HTTP 401.

## Scope and threat model

The existing web dashboard at 127.0.0.1:3100 is a local-only management interface. A loopback Host header is not an owner identity. A short-lived pairing ticket and signed owner cookie protect privileged local mutations, but **do not** protect against arbitrary code already running under the same OS identity. P1D must limit accidental leakage to unpaired local callers and store Cloudflare credentials in a managed OS-backed secret store before P1E writes are enabled.

**Non-goals:** no Cloudflare API POST/PATCH/DELETE, no public dashboard, no auto-starting permanent service, no edits to ~/Projects/local-file-mcp, no multi-tenant identity/managed relay, no claim of malware-proof same-user isolation.

## P1D-A: Close sensitive read-only endpoints (first implementation slice)

Review of currently implemented handlers (2026-10-29):

| Endpoint | Current GET behavior | Desired pre-pair behavior |
| --- | --- | --- |
| /api/local/policy | Returns configured root paths, tool settings using only ensureLocalRequest | 401 without owner session; 200 with validated owner session |
| /api/local/cloudflare | Returns non-secret routing identifiers using only ensureLocalRequest | 401 without owner session |
| /api/local/setup | Returns client setup and local executable/config paths using only ensureLocalRequest | 401 without owner session |
| /api/local/activity | Returns audit-event metadata using only ensureLocalRequest | 401 without owner session |
| /api/local/onboarding | Returns onboarding/system metadata and root counts | Split into public, sanitized pre-pair bootstrap or 401 until paired |
| /api/local/service | Returns process/config readiness | Limit to minimal pre-pair status or 401 until paired |
| /api/local/status | Returns local service and remote probe details | Limit to minimal pre-pair status or 401 until paired |
| /api/local/owner | Returns only paired boolean, mode and provisioningEnabled false | Deliberately available before pairing so browser can verify session |
| /api/local/cloudflare/preview | POST pure read-only plan; Host/Origin checks | Assess if can remain pre-pair; do not accept or return secrets |
| /api/local/owner/pair | POST ticket redemption | Must remain usable without an existing owner session; preserve Host, Origin, JSON and custom-header checks |

Implementation sequence:
1. Initial route classification: `GET /api/local/owner` and `POST /api/local/owner/pair` are public loopback-only pairing/bootstrap; seven metadata GET endpoints are owner-required; Cloudflare preview POST remains a non-secret, pure same-origin preview. A proper sanitized first-run onboarding view before owner pairing remains TODO.
2. **Implemented and audited on 2026-10-29:** `ensureOwnerRequest(request)` protects GET `/api/local/policy`, `/api/local/cloudflare`, `/api/local/setup`, `/api/local/activity`, `/api/local/onboarding`, `/api/local/service`, and `/api/local/status`. Ordinary GET does not need mutation-only CSRF headers. Before pairing, `/api/local/onboarding` will return 401; first-run UX for an unpaired new user needs explicit follow-up review.
3. Explicitly preserve initial unpaired pairing screen and a safe onboarding explanation; no secret data or approved paths sent before pairing.
4. **Implementation audited 2026-10-29:** foundation owner-guard tests check GET no-cookie 401 and paired allow, static owner guard across seven GET handlers, and that pairing bootstrap remains unauthenticated. Real Next.js HTTP checks for newly protected routes and first-run UI regressions are still TODO.
5. **P1D-A developer-alpha accepted:** user supplied paired policy JSON/logs with HTTP 200; seven unpaired GETs returned HTTP 401; an Incognito screenshot showed a clear owner-pairing prompt without exposing sensitive metadata. Full new-user onboarding after pairing and cross-platform UI/accessibility tests remain pending release QA. Audit passed 46/46 foundation and 3/3 MCP tests.

## P1D-B: OS-backed credential broker (no plaintext fallback)

**2026-10-29 foundation VERIFIED on Arch Linux:** npm install reported 0 vulnerabilities (one esbuild postinstall blocked but audit/build succeeded); audit passed 91 sources, 52/52 foundation tests, 3/3 MCP tests, typechecks/build; optional OS Secret Service keyring smoke test PASS for synthetic store/read/rotate/revoke. Windows/macOS and owner-authorized API/UI integration remain pending.
- Added `src/server/credentials/index.ts` with a server-side Cloudflare credential vault that supports `store`, `read`, `rotate`, and `revoke` for validated Cloudflare account-ID references. Native provider errors are replaced with generic, token-free failures. No JSON fallback, no logger, no browser API.
- Added `tests/foundation/credentials.test.ts` to check credential lifecycle with an in-memory test double (not a production fallback), invalid IDs/tokens, absent credentials, sanitized errors, Linux backend pinning and unsupported platform rejection.
- Added `@napi-rs/keyring`; the developer ran `npm install`, updated the lockfile, and confirmed the native keyring works via `npm run keyring:smoke`. No credential from the developer was transmitted in chat.
- The native adapter uses Windows Credential Manager on Windows, Keychain on macOS and **explicit Linux Secret Service only**. The library normally falls back to Linux kernel keyutils; the code opts out by specifying `{linux:{store:"secret-service"}}`. If no persistent Secret Service backend is available, credentials cannot be saved.
- The existing vault foundation does not itself enable a dashboard UI or remote provisioning. Follow-up slices require owner-authorized token save/rotate/revoke APIs and explicit consent; never return token material in GETs.
- Production read returns a token to server-side callers only; the caller must enforce owner authorization. Tokens must never be serialized in a dashboard response. This broker is not a standalone security boundary against processes under the same OS identity.

**Host validation DONE for native vault foundation:** user ran `npm install`, `npm run audit:all` (52/52 foundation tests; 3/3 MCP; build successful), and `npm run keyring:smoke` (PASS). The native keyring works in the tested Arch user session with synthetic credentials. **2026-10-29 API/native addon correction VERIFIED:** `src/server/credentials/actions.ts` and `src/app/api/local/cloudflare/credentials/route.ts` implement owner-guarded explicit POST save, PUT rotate, DELETE revoke; save/rotate verify an active matching Cloudflare zone before writing the native keychain. The user confirmed a real anonymous credential POST returned HTTP 401, native Secret Service smoke PASS, and a new full `npm run audit:all` passed 94 source files, 58/58 foundation, 3/3 MCP smoke tests, TypeScript and production build. Turbopack native `.node` error was fixed by Next.js `serverExternalPackages: ["@napi-rs/keyring"]` with regression coverage.

**New standalone browser UI (source created after that passing audit):** `src/app/credential-vault/page.js` provides owner-gated browser token verification, account selection, explicit consent for save/rotate, and separate confirmation for local revocation. It clears in-memory token state following save/rotate and does not persist token to browser storage. The Arch MCP file connector disallows `.tsx` edits; a Next.js `.js` page with JSX was created instead. New static tests `tests/foundation/credential-ui.test.ts` and updated package test script were audited successfully: 96 source files, 60/60 foundation tests, 3/3 MCP smoke tests, both TS checks and Next.js production build PASS. Browser screenshot confirmed owner-accessible form layout, and `/credential-vault` returned HTTP 200. Screen reachable at `http://127.0.0.1:3100/credential-vault`; AI Connections navigation link was added and audited successfully in the later 61/61 foundation, 3/3 MCP and build audit on Arch. Paired and Incognito unpaired UI screenshots passed. A real end-to-end credential lifecycle through the browser has NOT been tested. No Cloudflare API token, Tunnel, DNS or Access resources were changed. Do not put a real token on a command line or in logs/chat.

**2026-10-30 next Cloudflare Setup source slice (NEW, HOST AUDIT PENDING):** added `src/server/cloudflare/saved-preflight.ts`, POST-only owner-protected API `/api/local/cloudflare/preflight/saved`, tests `tests/foundation/saved-preflight.test.ts`, and a read-only hostname check form on the Vault page. The server reads a stored token via OS Keychain reference, calls the existing zone+DNS GET preflight and checks account ownership, returning only nonsecret zone/status information. No token needs to be entered twice or echoed in API output. Added `scripts/credential-flow-smoke.ts` and `npm run credential-flow:smoke` to test save/rotate/revoke with synthetic credentials in the real OS keychain, substituting a deterministic mock for Cloudflare verification (no network, no Cloudflare writes). The real browser token lifecycle and protected Cloudflare provisioning remain separate later tasks. Run a fresh host audit after these changes.


- Define a small interface for an installation-scoped credential store, with write, retrieve-by-reference, rotate and revoke; do not expose raw tokens through GET APIs.
- Target native providers: Windows Credential Manager, macOS Keychain, and Linux Secret Service or a documented equivalent that does not silently downgrade to plaintext.
- Use an authenticated local helper/launcher for secret access and OS-specific API calls. Where unavailable or locked, fail closed with an actionable error, never a JSON or browser localStorage fallback.
- Avoid including token bytes in stdout, audit events, exception messages, config files, browser history or query strings.
- Keep public routing metadata separate from secret credential references and audit these paths with unit/integration tests.
- Ensure credentials are narrowly scoped to an approved Cloudflare account and domain; provide explicit revoke/rotate and uninstall cleanup.

## P1D-C: Trusted launcher, owner handoff & lifecycle

- Prepare a lightweight, per-installation trusted launcher with OS-specific IPC and securely provisioned user-only state.
- For developer alpha, keep npm run owner:pair manual and loopback-only. Production launcher should automatically open a short-lived, one-time pairing link.
- Preserve replay protection, 2-minute pairing TTL, 8-hour session TTL, and secure cookie expectations; revisit session revocation after launcher support.
- Do not claim a native credential vault isolates from malware with the same account privilege. Document same-user OS trust assumptions.
- No shell execution or general file executor in the web dashboard. Manual Start/Stop remains the default; OS auto-start, if offered later, must require opt-in.

## P1D completion gate before P1E provisioning

- [ ] All owner-sensitive GET APIs enforce session or only return a deliberately sanitized bootstrap.
- [ ] No regression in browser pairing or first-run onboarding on Linux/Windows/macOS.
- [x] Arch Linux native Secret Service foundation verified with disposable create/read/rotate/revoke smoke test; no plaintext fallback. Windows/macOS and new owner-authorized HTTP API still need verification.
- [ ] Native launcher trust, session handoff, and account identity limits are documented and tested.
- [ ] No Cloudflare write endpoint or DNS publication is enabled before the gates above.
- [ ] Native vault foundation previously passed all 52 foundation, 3 MCP and build checks. Re-run full audit after owner-authorized API changes; review new HTTP auth regression and browser UI before release.
