# Local MCP Manager — PRD v1.0 (Release Refactor)

**Status:** requirement baseline defined; product NOT approved for public release.
**Updated:** 2026-10-31.
**Platform:** one local-first Next.js application, source-installed on Windows/macOS/Linux first. Installer binaries are a later deliverable and MUST NOT be claimed available until tested.
**Clients:** ChatGPT Web and Claude Web, using one Cloudflare-protected MCP HTTPS origin.
**Implementation order:** work on ONE milestone at a time, perform its acceptance tests, record evidence, request owner review, then move to the next. Earlier changes made in multiple milestones are provisional, not implicitly accepted.

## 1. Problem and goals

The project already has a working read-only MCP proof of concept and Cloudflare/owner security foundations, but source layout and setup paths are fragmented. Setup currently redirects across several individual routes. The read/write selector cannot actually grant Write. New pages are visually inconsistent. User-facing installation guidance, security review, and final regression evidence need improvement.

**Success means:** a non-developer can start the local server with one command, finish one guided in-page setup, authorize only selected local folders, connect ChatGPT Web and Claude Web, and independently confirm real MCP calls. Product UI must be minimal, accessible, secure, honest about status, and maintainable. Read & Write is a release requirement, but MUST remain blocked until filesystem isolation and attack tests pass.

**Explicit priorities from the owner:**
1. Fix features and bugs first, then perform a whole-project clean-code refactor, preserving working contracts.
2. Eliminate unnecessary jumps between setup URLs.
3. Finish folder Read & Write securely instead of offering a nonfunctional selector.
4. Provide beginner-friendly, contextual installation instructions for API token, Cloudflare, MCP, ChatGPT and Claude.
5. Make all pages minimal, consistent, effective, responsive, and easy to navigate.
6. Run AI-assisted security review and final major tests, including clean install and existing-user upgrade, before publishing.
7. Provide an installed global terminal command `localdesk` that starts the local dashboard and presents a 9router-style interactive terminal menu (not a shell alias tied to a developer's project directory).

## 2. Scope and constraints

**In scope:** first-run and subsequent launch, local owner authorization, onboarding wizard, explicit folder policy, read/write MCP tools after security approval, native OS keychain, Cloudflare Access + dedicated Tunnel, callback management, local service controls, status and activity, diagnostics, UI/design system, source architecture cleanup, tests, docs, and release checklist.

**Out of scope for v1 source install:** SaaS/multi-tenant, remote admin dashboard, arbitrary shell commands, automatic systemd/launchd/service installation, autonomous destructive operations, unapproved arbitrary filesystem access, and unattended Cloudflare resource deletion. Packaged .exe/.dmg and automatic dependency installation are separate release targets unless explicitly prioritized.

**Non-negotiable boundaries:**
- Admin dashboard binds ONLY to 127.0.0.1:3100; remote MCP listens ONLY on 127.0.0.1:8401. Never route Tunnel ingress to the admin dashboard.
- Remote transport stays behind Cloudflare Access; origin independently verifies Access JWT. Configuring DNS/Tunnel alone never proves authorization.
- Default approved folder roots = []; default Write tools = disabled. Home, secrets, hidden/system paths, symlinks, hardlinks, escapes, and unapproved roots are not implicitly accessible.
- API tokens, Access JWTs, tunnel connector tokens, owner pairing secrets, and private keys must not appear in Git, browser-visible API responses, logs or documentation.
- Existing operational Cloudflare Access app, AUD, Tunnel, DNS and callbacks must be preserved by default. Updates require read/compare/approve/update/verify, safe recovery on partial failure, and no silent reprovisioning.
- The Arch Local MCP development connector is NOT the product’s own remote MCP: do not confuse their capabilities or security boundaries.

## 3. Functional requirements and acceptance criteria

All MUST rows are required for v1 release. Acceptance requires runtime evidence, not a source-code assertion alone.

| ID | Priority / milestone | Requirement | Testable acceptance criteria |
|---|---|---|---|
| FR-01 | MUST / M1 | Single-command local startup | After a completed source install and production build, npm start binds to loopback, launches browser automatically or prints a safe local recovery path, and grants owner session without running owner:pair manually. After successful pairing, existing verified MCP+Tunnel services may auto-start in dependency order; a manual-start option exists; startup never reprovisions Cloudflare or bypasses Access. |
| FR-02 | MUST / M1 | Secure owner authorization | One-use, short-lived ticket in URL fragment; signed HttpOnly SameSite cookie; expiry/replay/forgery refused; localhost Host/Origin/CSRF checks; no anonymous privilege escalation; shutdown cleans managed child. |
| FR-03 | MUST / M1 | Authentic launcher ownership | Launcher checks its own child listener before issuing ticket; occupied port, spoofed response and crash fail closed without issuing ticket. Child readiness and startup errors are actionable. |
| FR-04 | MUST / M2 | One unified setup wizard | Primary journey stays within ONE Setup Center page. System -> Folder -> API credential -> Access/Tunnel -> MCP -> client authorization -> Verification can be completed with inline controls, Back/Next, progress, retry and contextual help. No required redirect to an unrelated setup route. |
| FR-05 | MUST / M2 | Persistent/resumable setup | Refresh/restart preserves safe progress, verifies existing deployment, resumes without duplicate resources or misleading completed states; advanced routes may remain for optional expert settings only. |
| FR-06 | MUST / M2 | Step-by-step installation guidance | Inline walkthrough covers Node/npm, cloudflared, Cloudflare account/active zone, scoped User API Token, secret vault, Access protection, Tunnel/DNS, OAuth callbacks, ChatGPT and Claude connection, first tool call, failure recovery; no fabricated client-specific callback URLs. |
| FR-07 | MUST / M3 | Per-folder permissions | UI and server support explicit Read or Read & Write per folder only when safe Write is released; changing permission requires local owner approval; revocation takes effect before the next request. All roots are denied by default. |
| FR-08 | MUST / M3 | Real secure mutation tools | create_directory, write_file, edit_file, rename_file, delete_file each enforce root, tool and client permissions; no overwrite by default; edit uses expected version/hash; delete requires local path-specific confirmation; activity is auditable. |
| FR-09 | MUST / M3 | Hardened filesystem containment | Proven OS-aware defenses for parent-symlink swaps/TOCTOU, traversal, hardlinks, reparse points, overlaps, root replacement and concurrent mutation. Do not register remote Write before adversarial tests pass on each supported OS. |
| FR-10 | MUST / M2, M5 | Cloudflare and OAuth connection | Access-first provisioning, least privilege API scopes, Keychain storage, reuse existing deployment, explicit approval for provider changes, verified configured client callbacks; ChatGPT/Claude each successfully invoke list_roots/read_file. |
| FR-11 | MUST / M4 | Minimal, consistent responsive UX | One shared shell/nav, coherent page hierarchy, consistent typography and controls; responsive and keyboard usable; no link-only feature stubs, duplicate workflows, meaningless status cards or mock production successes. |
| FR-12 | MUST / M4 | Maintainable clean-code architecture | After feature bugs are fixed, refactor into clear domain modules with typed API contracts, isolated business logic/data access, small reusable UI components, no dead demo/legacy imports, no duplicate setup services; behavior preserved by regression tests. |
| FR-13 | MUST / M5 | AI-assisted security review | Inspect threat model, dependencies, filesystem, web/CSRF/session, JWT/OAuth, provider mutations, secrets and deployment. Document findings with severity, evidence, remediation and retest. AI/skill audit supplements, never replaces, execution-based verification. |
| FR-14 | MUST / M5 | Complete clean-install and upgrade simulation | Execute automated unit/integration/MCP smoke/typecheck/lint/static/dependency/build/browser E2E on clean state and separate existing-user upgrade. Validate rollback, Cloudflare failure paths and client tool calls. |
| FR-15 | MUST / M6 | Release-ready repository | No accidental secrets, stale mock/demo in production, false documentation or unreferenced legacy folders. GitHub release only after all required gates pass; commit/push solely when owner approves. |
| FR-16 | MUST / M1 (runtime) + M4 (terminal UX) + M6 (distribution) | Global `localdesk` CLI with interactive menu | After documented installation, `localdesk` works from any working directory without `cd`/`npm start`, reuses the secure launcher, starts the local dashboard and opens an interactive keyboard-controlled terminal menu showing actual dashboard/MCP/Tunnel status. Menu offers Open Web UI, Terminal UI (full-screen terminal monitoring/control), Start/Stop/Restart managed services, Show Status, Run in Background (when supported), and Exit/Stop with explicit process-lifecycle semantics. Non-interactive `localdesk --help`, `--version`, and actionable errors must work; on missing configuration remain local and guide setup. No public dashboard bind, unapproved daemonization, unauthenticated file mutation, or premature claims of system tray support. |

### 3.1 Terminal experience — global localdesk command

**Reference:** the user-provided 9router terminal screenshot is a layout/interaction reference, NOT a dependency on 9router.

**Target behavior:** from any directory, the user types `localdesk`. It launches (or safely reuses) exactly one local dashboard on 127.0.0.1:3100. Owner pairing remains required. Once previously configured and owner-authorized, protected Remote MCP and Cloudflare Tunnel start in order. The terminal shows a compact interactive menu with live, non-fabricated states:

```text
LocalDesk  v1.0
Dashboard   http://127.0.0.1:3100   [Running]
Remote MCP  127.0.0.1:8401         [Protected / Stopped / Error]
Tunnel      Cloudflare             [Running / Stopped / Error]
Clients     ChatGPT / Claude       [Verified / Not verified / Unknown]

  > Web UI (Open in Browser)
    Terminal UI (In-Terminal Control)
    Show Status & Diagnostics
    Start / Stop / Restart Services
    Run in Background (when available)
    Settings & Setup
    Exit (Stop Managed Services)
```

**Required details:** Terminal UI runs entirely inside the current terminal (no browser needed for read-only operational status), while owner-authorized configuration remains protected in the web wizard. Arrow-up/down and Enter keyboard navigation with an accessible numeric/non-TTY fallback; clear status distinctions (listening != authenticated client verified); safe one-instance/port-collision handling; no credential/owner ticket shown in general status; no arbitrary command input; failures do not bypass Access. A newly installed/partially configured user sees 'Setup required' and can open the local wizard. Starting a second `localdesk` should show status/open the existing instance rather than kill/reprovision it.

**Lifecycle:** user explicitly chooses whether Exit shuts down owned processes or leaves them running in background. Background mode, if shipped, requires a managed child/PID identity, secure local control, clean stop, and no orphaned processes; it is NOT equivalent to an OS boot-time service. A real system-tray icon is a separate desktop/native packaging feature and should NOT be faked in a terminal-only source install.

**Distribution:** development may use `npm link` or equivalent to expose the `localdesk` binary locally. Release must document a reproducible global installation or native bundle, ensure executable paths resolve independently of the current working directory, and verify Windows/macOS/Linux launch. Preserve the existing `npm start` route as a compatibility fallback. Do not imply npm-registry publication or native installers exist before release.

## 4. UX specification and design system requirements (M2 and M4)

### 4.1 Information architecture
- **Primary:** Dashboard (real status), Setup Center (single first-run flow), File Access, Activity & Diagnostics, Settings (advanced).
- Setup Center is the canonical journey. Its required form actions display inline; clicking Back/Next changes the wizard step rather than navigating to a different URL.
- Each step shows title, purpose, prerequisites, current verified status, task form, validation, safe next action, concise help and recovery. Protect any partially edited secret data against accidental exposure.
- File Access exposes root name/path, current permission, revoke action, and precisely what can be read/written. Unsupported Write is visibly unavailable without implying it works.
- Contextual settings are advanced drawers/panels, not mandatory routes. Existing standalone pages may remain during migration but should not be the final primary flow.

### 4.2 Visual system
- Design direction: minimal, clear, compact yet readable, restrained color, consistent spacing, typography, iconography, border radius, shadows and semantic status colors; use Tailwind CSS v4 and existing design tokens.
- Define reusable components for AppShell, WizardStepper, StepPanel, FormField, SecretInput, PermissionsTable, ServiceControl, Status, EmptyState, ConfirmDialog, ErrorNotice and HelpPanel where appropriate.
- **Mandatory React file convention:** all application pages, layouts, and components containing JSX use `.tsx`; non-JSX hooks, domain logic, contracts, and utilities use `.ts`. Existing `.js` JSX files are temporary migration debt, not the final architecture. Framework/tool configuration files can remain `.js`/`.mjs` where appropriate.
- Keep page.tsx files thin: route boundary + assembled feature screen, not a 200–500-line implementation. Repeated navigation, status badges, forms, and request code belong to shared or feature-scoped modules.
- Standard states: loading/skeleton, empty, ready, incomplete, failure, verification required, offline/unknown, and partial success. Never substitute guessed values or green "connected" badges for failed/unverified checks.
- Accessibility: semantic headings/labels, tab/focus order, visible focus state, keyboard-operable controls, appropriate alerts and confirm dialog, adequate contrast, meaningful disabled explanations.
- Responsive: usable mobile/tablet/desktop layout without horizontal content overflow except intentionally scrollable code/output; wizard remains linear.
- A feature page must do its actual primary task: not merely list links. No production mock/demo data. Keep synthetic fixtures in tests only.

### 4.3 Task efficiency acceptance
- A new user can follow the setup from one entry page without needing to know any route names.
- A step requiring external Cloudflare/ChatGPT/Claude navigation explains exactly why, provides a safe open-external action, then returns to the same wizard state.
- Existing users skip previously verified prerequisites; they are not required to re-create the Cloudflare App or Tunnel.
- Success is based on measured local/provider status and authenticated client tool invocation, not the presence of config files alone.

## 5. Clean-code target architecture and migration rules (M4)

Target within ONE Next.js repository:
- src/app: Next.js App Router route entry points only (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and thin API `route.ts` handlers). Avoid large stateful JSX files in `app`.
- src/components/ui and src/components/layout: `.tsx` reusable accessible UI primitives and shared navigation, with typed props, no feature-specific API side effects.
- src/features/{setup,files,connections,activity,settings}: `components/*.tsx`, `hooks/*.ts`, `services/*.ts`, `schemas/*.ts`, `types.ts` (folders where useful), feature-level screens and view models with a single responsibility. Do not create unnecessary folders for one-off trivial components.
- src/server/{owner,access,files,cloudflare,credentials,mcp,service,tunnel,audit}: `.ts` validated domain logic, integrations and repositories. No browser imports in server code. Explicit `server-only` boundary where supported.
- React components with state/events/effects use the minimal required `"use client"` boundary; prefer server-rendered route shells when possible and never ship native credential code to browser bundles.
- One typed, reusable owner-authorized client request layer where useful, with standardized response and error contracts instead of repeating fetch/CSRF/JSON logic across pages.
- src/contracts or existing src/server/contracts: stable Zod schemas and typed request/response/tool contracts.
- tests/unit, tests/integration, tests/mcp, tests/e2e: tests colocated by purpose (keep existing tests until migration verified).
- docs: current installation/operations, ADRs, security and release evidence; archive historical milestones separately if needed.

**Sequencing:** identify bugs -> fix/verify functionality -> add regression coverage -> refactor one module at a time -> re-run tests, typecheck and build -> compare behavior. Remove legacy apps/packages/reference-v4 and redundant pages only after reference/import/history review and explicit safe backup. Avoid big-bang deletion.

**Definition of clean:** one owner for each configuration state; no cyclic imports, unused exports or duplicate API fetch business logic; small named functions; typed inputs and standardized errors; predictable file naming; limited side effects; no mock production state. Prefer readability over abstraction.

**Mandatory TypeScript migration acceptance (M4):**
- No active `.js` files containing JSX under `src/app`, `src/components`, or `src/features`; convert currently known `page.js`, `setup-navigation.js`, and `steps.js` to typed `.tsx`/`.ts` as appropriate.
- All active React components declare meaningful prop types, and API response payloads are validated at trust boundaries (Zod or typed validated contracts). Avoid indiscriminate `any`, type-check suppression and non-null assertions without reason.
- Convert each route incrementally: extract feature screen -> components -> hooks/services -> typed route entry -> adjust imports/tests -> run typecheck/tests/build before moving to the next route.
- Verify no duplicate route files (`page.js` alongside `page.tsx` for the same path), broken CSS Tailwind imports, client/server boundary violations, or changes to existing authorization behavior.
- UI must be reusable, but avoid premature generic abstractions; each component should own a clear responsibility.
- Code migration is complete only when `npm run typecheck`, lint/static audit, foundation/integration tests, MCP smoke tests, production build, and browser regression of affected screens pass on the host.

## 6. Security test and release validation matrix

| Test ID | Maps to | Required evidence / pass condition |
|---|---|---|
| T-01 | FR-01..03, FR-16 | Fresh isolated-state npm start and installed localdesk binary -> browser pairing -> paired owner; no owner:pair; protected MCP starts before Tunnel when configured; manual-start mode skips both; failures remain fail-closed; stop/restart; port occupied; child crash/spoof challenge refused. Localdesk menu navigation, status, non-TTY fallback and duplicate instance checks pass. |
| T-02 | FR-02, FR-13 | Replay, expiry, forged cookie, missing/duplicate cookie, malicious Origin/Host, CSRF header, cross-origin POST all rejected; owner-only API remains protected. |
| T-03 | FR-04..06 | Browser E2E from blank install: completes full inline wizard without forced path jumps; refresh/resume; empty/errors/retry; actual client instructions. |
| T-04 | FR-07..09 | Each tool/root/read/write permission matrix, deny-by-default, revoke race, symlink/hardlink, parent swap, traversal, overlap, UTF-8, size limits, no overwrite, concurrent edits, local delete approval. |
| T-05 | FR-10 | Scoped API token, Keychain roundtrip with disposable test credential, Access-first, invalid audience/JWT, callback compare-and-verify, DNS conflict, stale snapshot and provider 400/401/403/5xx/timeouts. |
| T-06 | FR-10 | Live ChatGPT and Claude separately authenticate and call list_roots/read_file via protected hostname; 401 from anonymous origin is NOT proof. |
| T-07 | FR-11..12 | UI/keyboard/responsive/empty/loading/error review; TS/JS/static/lint checks; no legacy imports, no dead production demo; regression tests before/after refactor. |
| T-08 | FR-13 | AI-assisted code review + optional security skill/tool, dependency audit and source scanner (Semgrep or equivalent); risk register; no unresolved critical/high issues. |
| T-09 | FR-14..15 | npm ci, full audit, production build, clean onboarding, upgrade preserving old state, rollback, secrets scan, supported-OS smoke, release review signed off. |

**Test safety:** disposable state dir and synthetic provider mocks for negative testing. Do not erase live policy, vault or working Cloudflare deployment; never test destructive provider operations on the owner's working account without explicit approval. Log pass/fail and command/output summaries; do not invent results.

## 7. Milestones — strict sequential gates

| Milestone | Scope | Exit criterion | Current state |
|---|---|---|---|
| M0 — PRD + baseline audit | Complete traceable PRD, inventory, findings, risks, migration plan | Docs reviewed; known gaps and unverified host checks explicitly recorded | PRD updated; source-only baseline, host checks outstanding |
| M1 — Startup + owner security | Secure launcher, owner pairing lifecycle, remote service startup; establish global CLI entry foundation | T-01 and T-02 pass on target host, including basic localdesk invocation once implemented; full menu polish in M4 | **ACCEPTED — Arch Linux source-install:** `localdesk` via user-owned npm prefix, owner pairing, MCP/Tunnel auto-start and scoped Ctrl+C shutdown; 32/32 focused tests passed; typecheck/build pass reported by owner. Public npm, Windows/macOS and full client E2E not yet claimed. |
| M2 — Unified Setup Wizard | All setup forms and instructions in one flow, resume/recovery, cloud providers | T-03 + relevant T-05; no mandatory deep-page navigation | **M2.1–M2.3 ACCEPTED on Arch Linux:** inline System Check, Read-Only Folder Access, and Credential Vault. M2.3: 170/170 foundation + 3/3 MCP tests, typechecks/build PASS; non-destructive browser refresh/Keychain status confirmed; live token rotation/revoke intentionally not performed. M2.4–M2.7 pending; full M2 NOT accepted. |
| M3 — Safe Read & Write | Root policy, isolated mutation engine, confirmations, audit, client registry | T-04 + platform containment review; Write disabled until gate | BLOCKED; design only |
| M4 — UI + architecture refactor | Shared UI shell, clean modules, CLI/TUI menu polish, delete only proven-unused legacy/mock | T-07 + interactive terminal usability tests and all previously passing tests | Not accepted |
| M5 — Security + release QA | AI audit, threat tests, dependency, browser/client, clean/upgrade | T-05..09 all pass; zero unresolved critical/high | Not executed |
| M6 — GitHub publication | Global localdesk distribution, docs/changelog, commit review, approval, release | Global command works from any directory on supported OS; owner approves specific commit/release; no secrets | Not started |

**Gate policy:** do not mix work from future milestones into the current iteration. Any previous cross-milestone changes remain provisional and must be re-reviewed at their designated milestone. If host execution is unavailable, explicitly record M1 or any later milestone as **blocked pending host evidence**, not "done." Do not remove backups, change live Cloudflare assets, or enable Write during documentation/audit work. Stage/commit/push only after the relevant slice passes acceptance and sensitive-file review, under the owner's standing approval below.

## 8. Known baseline findings / risk register

| ID | Impact | Evidence | Required action |
|---|---|---|---|
| SEC-01 | Critical if remote Write exposed | FileEngine pathname validation + leaf O_NOFOLLOW does not solve parent symlink TOCTOU | Implement/test OS-aware containment in M3. Write remains off. |
| SEC-02 | High misleading UX | Policy API accepts read roots only; remote HTTP registers 5 read tools | Replace misleading selector after safe implementation; never silently enable. |
| SEC-03 | High local authorization | owner pairing launch proof and CSRF/session behavior need runtime checks | M1 independent host integration and attack tests. |
| UX-01 | High setup friction | Standalone Cloudflare, vault, OAuth and tunnel routes | M2 required inline wizard, keep advanced only. |
| UX-02 | Medium visual inconsistency | Newer standalone pages do not share complete design system | M4 consistent shared shell and controls. |
| ENG-01 | Medium maintainability | Old apps/packages/reference and scattered page/business logic | M4 reference-aware refactor after tests. |
| QA-01 | Release blocker | No confirmed clean-state E2E, TSX audit or Windows/macOS packaged tests | M5; verify on host and do not guess pass. |
| SEC-04 | Provider mutation risk | Existing Access/Tunnel/OAuth state and rollback lock | Preserve current resources; test stale state and partial failures. |

## 9. Baseline evidence and work permissions

Current known code includes scripts/launch-dashboard.ts; src/server/owner; src/server/http/local-only.ts; src/app/api/local/owner; src/app/setup-center/page.js; src/server/http/local-policy.ts; src/server/mcp/http.ts; tests/foundation and tests/mcp. See SECURITY-REVIEW-2026-10-31.md, WRITE-SECURITY-DESIGN-V1.md, BASELINE-AUDIT-V1.md, M1-STARTUP-ACCEPTANCE.md and NEXTJS-COMPONENT-ARCHITECTURE.md.

**Verification limitation:** Arch Local MCP V2 can read/write permitted .ts, .js, .md files but currently cannot inspect .tsx or execute host shell/tests. Statements about npm audit, live browser/Cloudflare, platform packaging, and production compilation require separate evidence from the host.

**Change control (owner update, 2026-10-31):** The owner explicitly authorizes a Git commit and push to the verified GitHub `origin` when **each completed, tested stage** passes acceptance, without requesting approval again. Before every push: inspect changes and staged paths; exclude incomplete future-stage work, credentials, secrets, local state and generated artifacts; confirm the origin remote/branch and never force-push. If tests/remote verification are unavailable, keep changes local and report the blocker. No secret files in tests. Never silently upgrade read-only folders to Write.

