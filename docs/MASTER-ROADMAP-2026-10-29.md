# Local MCP Manager — Master Roadmap to v1.0

**Last reviewed:** 2026-10-30
**Repository:** ~/Projects/local-mcp-manager
**Current version:** 0.3.0 (developer alpha)
**Current active milestone (2026-10-30):** User reports DNS-only resume fails with **`deployment-lock`**, local phase `tunnel-ready`, lock `held`. Read-only Cloudflare diagnosis confirmed Access/OAuth `verified`, existing dedicated Tunnel `present`, hostname DNS `available`. Since the failure occurs BEFORE DNS POST, do **NOT** create a new Tunnel, delete lock, or blindly retry DNS. Cloudflare remote configuration has a published application route `mcptest.kinan19.my.id` → `http://127.0.0.1:8401`; Tunnel Healthy alone doesn't imply DNS publication. **NEW READ-ONLY LOCK DIAGNOSTICS SOURCE IMPLEMENTED, HOST AUDIT PENDING**: `DeploymentRepository.inspectDnsLock()` reports (without filesystem paths, credentials or file contents) state + age of deployment lock, DNS completion guard, and recovery guard; GET `/api/local/cloudflare/dns-finalize` includes `lockDiagnostics` on successful or failed readiness checks. POST errors include safe `DnsCompletionStageError.kind` and allowlisted errno (EACCES/EPERM/etc), plus lock diagnostics; UI renders age/status, guard health, and error kind. Two new regression tests added and security assertions extended; expected ~116 foundation / 3 MCP smoke tests after prior baseline. IMPORTANT: No automatic guard deletion or lock bypass exists; diagnose whether completion guard is held, deployment lock <180 seconds, or filesystem inaccessible, then implement safe targeted recovery only after proving no concurrent action. User must run audit, refresh, click **Cek kelengkapan DNS (read-only)** and report lock diagnostics; do not click final Publish until diagnosis confirms safety. Full ChatGPT/Claude OAuth/MCP not tested.

## Simplified product plan — 4 deliverables (current priority)

| Deliverable | State | Acceptance gate |
| --- | --- | --- |
| 1. Core MCP Manager + Credential Vault | Developer alpha; latest audit PASS | Native read-only tools, owner guard, keychain, paired/unpaired vault screens verified; disposable real token browser lifecycle still needs QA |
| 2. Cloudflare Setup | Dashboard-first user consent code added; audit pending | Owner-only read-only readiness, explicit Access+OAuth approval, then separately explicit Tunnel+DNS approval; no developer flag or shell step |
| 3. ChatGPT/Claude Web Connection | TODO | Real authenticated remote MCP `tools/list` and `tools/call` with a disposable approved folder |
| 4. Installer & Release | TODO | Windows/macOS/Linux users can install, pair automatically, and control Start/Stop without terminal; final QA |

P1A/P1B/P1C/P1D/etc. below are *implementation checklists inside these four deliverables*, not new product phases. **Do not add optional scope** (write tools, SaaS, managed relay, multi-user) to v1.0. UI screenshot/build verifies rendering, not actual Cloudflare token lifecycle. Keep all Cloudflare writes disabled until approved secure provisioning is implemented.

**Source of truth:** This roadmap is a current summary of the code and project docs, not proof that pending runtime tests have passed.

## Product target (v1.0)

An ordinary first-time Windows/macOS user (Linux supported) can install a packaged Local MCP Manager **without installing Node/npm or using the terminal**, explicitly approve local folders, connect Claude Web and/or eligible ChatGPT Web through their own Cloudflare-managed domain, and start/stop access from a local-only dashboard. At no stage should the app expose dashboard port 3100, modify the older local-file-mcp project, or publish an unauthenticated MCP endpoint. No VPS required for bring-your-own-domain mode.

Web MCP is the primary path. Claude Desktop / Claude Code are optional advanced paths. Users without a Cloudflare account and domain would require a future managed relay architecture; that is OUT OF SCOPE for the clone-only v1.0 product.

## Status key

- DONE: implementation exists and its previous host audit is reported passing.
- CODE READY / QA PENDING: implementation exists; needs a new audit or real-world validation.
- TODO: planned, not implemented.
- ALPHA: exists with deliberately limited behavior, not complete production functionality.

## Master stages

### P0 — Product foundation & web-first dashboard — DONE (with manual UX QA outstanding)
- [x] Next.js 16 / TypeScript / Tailwind single-project app and feature-based UI
- [x] Overview, File Access, MCP Tools, AI Connections, Activity Logs, Settings
- [x] Backend policy/root allowlist and file engine; 5 read-only MCP tools
- [x] MCP stdio and JWT-guarded HTTP foundation; independent loopback listener at 127.0.0.1:8401
- [x] Onboarding wizard, native OS/dependency checks, and Cloudflare configuration preview
- [x] Initial managed MCP HTTP start/stop (process-scoped alpha)
- [x] Latest host audit on 2026-10-29 **after P1C fixes**: 89 source files; 44/44 foundation tests; 3/3 MCP smoke tests; TypeScript foundation/main checks and Next.js 16.4.3 production build all pass (user-supplied terminal output).
- [ ] Visual/browser QA, accessibility and workflow QA on desktop/mobile

### P1A — Read-only Cloudflare account verification — DONE in earlier audit
- [x] One-shot API token verification and zone list via fixed Cloudflare API host
- [x] No token persistence; read-only scope and bounded calls
- [x] API-token creation template (permissions narrowed by user in Cloudflare)

### P1B — Read-only hostname preflight — DONE in earlier audit
- [x] Verify active selected DNS zone and detect exact hostname collision
- [x] Fail closed on errors; no DNS writes; candidate != provisioned

### P1C — Local owner authorization — DONE (developer-alpha scope)
- [x] One-time 2-minute developer pairing ticket and 8-hour signed HttpOnly session
- [x] Owner checks on privileged local API mutations and token-bearing read routes
- [x] Added owner/session/replay/tamper tests
- [x] Ran `npm run audit:all` AFTER P1C: static audit 89 files, 44 foundation tests, 3 smoke tests, foundation/main typechecks and production build all pass on Arch Linux
- [x] Browser owner pairing verified on 2026-10-29: user confirmed `/api/local/owner` returns `{ "paired": true, "mode": "local-owner-pairing", "provisioningEnabled": false }` after opening the one-time URL manually in the same browser. This verifies pairing, **not** Cloudflare provisioning. The full host audit passed all 44 foundation tests, 3 MCP smoke tests, both TypeScript checks and production build.
- [x] Verified privileged PATCH `/api/local/policy` returns HTTP 401 with correct local headers but no owner cookie, with JSON `Owner pairing required`; paired session acceptance is covered by automated guard test and successful live owner status (a paired real PATCH was not necessary for this read-only acceptance test).
- [x] Reviewed all current `/api/local` route handlers on 2026-10-29. **Finding:** `GET /api/local/policy` exposes approved root paths without a session; `GET /api/local/cloudflare` exposes non-secret routing identifiers; `GET /api/local/setup` may expose local binary/config paths; activity/onboarding/status/service GETs expose local metadata. These only use Host checks; prevent unpaired disclosure under P1D and keep a minimal pre-pair bootstrap API. `GET /api/local/owner` intentionally remains available to check whether pairing succeeded. Do NOT enable provisioning before P1D remediation.
- **Gate:** no Cloudflare write operations before P1D trusted owner/credential controls pass. P1C core authorization is validated, but remaining sensitive GET disclosure is specifically scheduled for P1D.

### P1D — Trusted launcher, native owner authority and secret storage — ACTIVE (design + implementation TODO)

**Active design:** `docs/P1D-SECURITY-PLAN.md`. **P1D-A backend verification PASS** on 2026-10-29: full audit 89 source files, 46/46 foundation tests, 3/3 MCP smoke tests, both TypeScript checks and production build; all seven unauthenticated GET routes returned HTTP 401 in a real curl loop. **Paired-browser GET requests VERIFIED** by user log (`/api/local/policy`, `/api/local/onboarding`, `/api/local/activity`, `/api/local/status`, `/api/local/service`, `/api/local/cloudflare` returned HTTP 200). **Incognito first-run guidance VERIFIED** via screenshot: clear `Owner browser not paired` banner and terminal pairing instructions. P1D-A closes for developer-alpha security/UX scope; broader first-run flow, end-to-end onboarding, Windows/macOS and accessibility remain pending for later QA. Native OS keychain and trusted launcher are not implemented; Cloudflare writes remain disabled.
- [ ] Design per-OS local owner launcher / IPC (Windows/macOS/Linux) and secure browser session bootstrap
- [x] **P1D-B native vault foundation verified on Arch:** `src/server/credentials/index.ts` store/read/rotate/revoke, input validation, sanitized errors, `@napi-rs/keyring` with Linux Secret Service (no plaintext fallback). `npm install` completed with 0 reported vulnerabilities; `audit:all` passed 91 sources, 52/52 foundation, 3/3 MCP, TS/build; `keyring:smoke` PASS using synthetic credentials.
- [x] **P1D-B owner-authorized credential API foundation VERIFIED:** `src/server/credentials/actions.ts`, `src/app/api/local/cloudflare/credentials/route.ts`, regression tests and owner checks. Full audit 94 files, 58/58 foundation, 3/3 MCP tests, TypeScript and Next.js build PASS after `serverExternalPackages` fix; unauthenticated POST returned 401. Save/rotate/revoke remain explicit and never return token bytes. Production end-to-end with actual token not yet tested.
- [x] **P1D-B standalone Credential Vault UI initial audit and owner-browser rendering VERIFIED:** `src/app/credential-vault/page.js`, `tests/foundation/credential-ui.test.ts`; 96 source file static audit, 60/60 foundation tests, 3/3 MCP tests, TypeScript and production build all PASS. Browser screenshot and `GET /credential-vault 200` confirm initial owner-accessible form renders. Security actions are still explicit, no Cloudflare provisioning. Incognito screenshot verified on 2026-10-30: pairing notice appears and token controls are hidden; global pairing banner also appears, causing harmless duplicate guidance. Following successful previous audit, inserted a Vault shortcut in `src/features/connections/connections-page.tsx` using a single JSX fragment around the existing RemoteServicePanel and updated `src/app/credential-vault/page.js` so an Account ID is prefilled after storing, plus concise pairing guidance. Added `tests/foundation/credential-ui.test.ts` regression coverage. NEW CODE IS NOT YET AUDITED. Pending: UI navigation QA, browser save/rotate/revoke with a disposable/revocable token, and cross-platform QA.
- [ ] Narrow privileges, revoke/rotate credentials, enforce session lifecycle and safe logging
- [x] **P1D-A developer-alpha gate:** seven owner-guarded GETs, real 401 without session, real 200 paired, dashboard Incognito owner-pairing notice, audit PASS. Separate release-readiness QA remains needed for full onboarding, Windows/macOS, accessibility and error states. Continue CSRF, replay, symlink/path and local IPC hardening under P1D-B/C.
- [ ] Regression tests across platforms; documented security limitations for same-OS-user malware
- **Gate:** accepted locally authorised and controlled credential handling.

### P1E — Cloudflare provisioning automation (protected-first) — TODO
- [ ] Validate Cloudflare account, domain, exact permissions, collisions and explicit user consent
- [ ] Install/verify cloudflared from trusted source with user approval
- [ ] Create a NEW dedicated remotely-managed tunnel; never modify the developer's old tunnel
- [ ] Create restricted Cloudflare Access app, policies and Managed OAuth before public DNS publication
- [ ] Configure tunnel to 127.0.0.1:8401 ONLY; never route external traffic to dashboard :3100
- [ ] Create exact DNS route only after Access and origin validation succeed
- [ ] Preview planned changes, prompt user approvals, record owned resource IDs
- [ ] Retry/idempotency, rollback, re-connect, revoke and cleanup only app-owned resources
- **Gate:** first fresh domain and account can be provisioned without manual API calls, with no unsafe exposure.

### P2 — Real Claude Web / ChatGPT Web integration (not mock) — TODO
- [ ] Verify public HTTPS endpoint, OAuth metadata/discovery, Access JWT at origin and MCP initialize/tools/list/tools/call
- [ ] Claude Web custom MCP sign-in and read from disposable, explicitly approved test folder
- [ ] ChatGPT Web custom connector test, conditional on the user's account/workspace eligibility
- [ ] Dashboard labels CONNECTED only after authenticated tool invocation
- [ ] Troubleshoot consent denied, bad AUD, expired token, tunnel down, mismatched URL and access revoked
- **Gate:** clean external client successful end-to-end test.

### P3 — Lifecycle, installers and no-terminal onboarding — TODO
- [ ] Persistent background lifecycle helper; manual Start/Stop always available, autostart opt-in only
- [ ] Package runtime + verified cloudflared; Windows installer and macOS app; Linux distribution supported
- [ ] Trusted automatic browser pairing by launcher instead of developer CLI `owner:pair`
- [ ] Reconnect after restarts, update strategy, service health, controlled uninstall/credential revocation
- [ ] Fresh-install user tests without Node/npm/Git knowledge
- **Gate:** new Windows/macOS user completes installation + Web MCP onboarding with only the UI.

### P4 — v1.0 reliability and usability polish — TODO
- [ ] Replace misleading demo metrics/states with clearly labeled or real telemetry
- [ ] File-browser permissions UX; root approval, deny-by-default, audit log, clear remote exposure status
- [ ] Cross-platform accessibility, UI regression and fault-injection scenarios
- [ ] Security review, dependency audit, reproducible build, rollback and troubleshooting docs
- [ ] User-ready docs, screenshots, FAQ, release notes
- **Gate:** no release-blocking security failures; complete acceptance checklist.

### P5 — v1.0 beta & release — TODO
- [ ] Test on clean Windows + macOS and Linux, not just developer's Arch machine
- [ ] Test with a new Cloudflare account/domain and a separate real person
- [ ] Publish versioned GitHub releases, installers, checksums and clear prerequisites
- [ ] Record issues, fix blockers, tag v1.0
- **Gate:** public release demonstrates full install -> approve roots -> provision Access-protected tunnel -> authenticated read-only MCP call -> stop/revoke.

## After v1.0 — optional features, not release blockers
- [ ] Safe write/edit/rename/delete tools with per-root opt-in, explicit approvals and hardened filesystem race defenses (target v1.1).
- [ ] Managed relay for users without their own Cloudflare domain (requires a new hosted multi-tenant architecture and operating costs).
- [ ] More complex multi-agent orchestration, live sync or enterprise administration.

## What to do next, precisely

1. `npm run audit:all` **PASSED** on Arch Linux on 2026-10-29; `npm run dev` reports ready at 127.0.0.1:3100.
2. Create a NEW pairing ticket while the dashboard is running: `npm run owner:pair` from another terminal. The earlier ticket was generated before audit and may be expired after 2 minutes; never reuse or paste its secret in chat.
3. Browser pairing **VERIFIED** (`paired: true`) when the user manually opened the one-time URL in the same browser.
4. **P1C DONE:** verified a real unauthenticated privileged PATCH returned HTTP 401; completed a source review of sensitive GET endpoints and transferred remaining read disclosure safeguards to P1D.
5. **Cloudflare dashboard-first consent implementation awaiting host audit:** old 76/76 tests plus 5 setup draft tests and 2 readiness mock tests target 83/83 foundation, 3 MCP smoke, TypeScript/build. Real user completed Cloudflare read-only zone/DNS check and confirmed saved metadata. New UX: `Cek kesiapan (read-only)` checks server via owner-protected POST action=check and GET Cloudflare calls only; if it succeeds, the user can expressly approve Access+OAuth creation. No terminal environment flag. For insufficient Access token scope, rotate token in Credential Vault (user UI). Do not create resources before reviewing live token scope and callback URL. Stage 2 remains separately consented and after Access verification. Real-world Access/Managed OAuth compatibility needs independent QA. See `docs/CLOUDFLARE-AUTO-SETUP.md`.

## Stable invariants

- Never modify `~/Projects/local-file-mcp/` or expose local dashboard :3100.
- No plaintext Cloudflare secrets in repository, API output, browser localStorage or logs.
- No Cloudflare writes without authenticated owner, explicit approval, and verified Access-first safeguards.
- Never call local 401, a healthy tunnel or a saved config proof of actual client connectivity.
- Arch Local MCP file connector can edit/read code but cannot run terminal commands; actual host audits need user execution.
- Older documents may contain historical outdated phase labels; this is the active consolidated plan as of 2026-10-29.
