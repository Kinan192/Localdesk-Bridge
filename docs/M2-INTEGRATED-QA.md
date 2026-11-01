# M2.7 — Integrated Setup QA & Acceptance Matrix

**Date:** 2026-11-01  
**Project:** LocalDesk Bridge, Arch Linux source installation  
**Status (2026-11-01):** ALL AUTOMATED GATES PASS on the owner's Arch Linux host. Manual narrow/mobile + keyboard accessibility and independent ChatGPT/Claude authenticated tool-call gates remain pending. This is NOT a release certification.

## A. Automated gates (must all PASS)

Run from `~/Projects/local-mcp-manager`:

```bash
npm run test:integrated && npm run test:setup && npm run audit:all
```

- Integrated contract suite: all eight inline step panels present, user resume restores only selected step ID, and owner pairing is mandatory.
- Scenario matrix: brand-new unconfigured install; returning owner with published Cloudflare deployment and working managed processes; Cloudflare partial failures or missing Keychain token; unknown service states; manually-run/unmanaged cloudflared.
- Server actions: POST/PUT/PATCH/DELETE require real owner session, same-origin/CSRF guard; no access escalation through wizard.
- Secret discipline: localStorage limited to selected step ID, API tokens are transient input, OS Keychain remains authoritative, no token in URL/log, no dashboard ingress on public Tunnel.
- Callbacks: read provider state; preserve existing OAuth redirect URLs and reject stale snapshots rather than blind overwrite.
- Build/static: project audits, tests, MCP smoke, TypeScript checks, and optimized Next.js build.
- No attempt to start/stop production services or modify Cloudflare during these tests.

**Actual host evidence (2026-11-01):** `npm run test:integrated` **8/8 PASS**; `npm run test:setup` **48/48 PASS**; `npm run audit:all` static audit **153 source files PASS**, foundation typecheck PASS, foundation **193/193 PASS**, MCP smoke **3/3 PASS**, application typecheck PASS, Next.js **16.4.3** optimized production build PASS, all **9/9 static pages generated**. There are **196 distinct tests in the full audit**; integrated and focused setup tests are subsets of the foundation tests and were also run separately. No automatic test failure remains in this supplied log.

The static UI/accessibility assertions are **not** a substitute for interactive browser, keyboard, mobile, or real client OAuth testing. Prior browser screenshots validated M2.1–M2.6 on the active Linux installation (including MCP/Tunnel status and ChatGPT/Claude URL display), but **the full M2.7 interactive browser sweep is not yet evidenced**.

## B. Owner browser QA (non-destructive, use same browser profile)

Stop the previous `localdesk` process with Ctrl+C before rebuilding; after all tests and build finish, restart with `localdesk`. Owner pairing uses a private URL that must not be shared.

| Step | Acceptance evidence (read only unless otherwise indicated) |
|---|---|
| 1. System | Shows real local platform/Node/dependencies/cloudflared; Refresh updates truthfully and does not install/start anything |
| 2. Folder | Displays actual approved read roots; previously tested add/toggle/revoke on disposable folder; Write controls remain disabled until M3 |
| 3. Credential | Shows status of Keychain credential associated with draft (or “unknown” without draft); token input remains blank; never rotate/revoke live token for QA |
| 4. Access & Tunnel | Shows existing published deployment. Read-only status works; no duplicate Access, Tunnel, DNS, callback or recovery action |
| 5. MCP settings | Saved hostname, audience, team domain and port remain unchanged and immediately visible, even if Cloudflare import-preview stalls |
| 6. OAuth callbacks | Both existing callbacks loaded from actual Cloudflare response; unchanged list cannot be resubmitted; never remove a live redirect solely for QA |
| 7. MCP & Tunnel services | Real managed/unmanaged process states; Start disabled for running processes; Stop only for LocalDesk-owned child; no operation necessary for QA |
| 8. ChatGPT & Claude | HTTPS MCP URL shown only from published valid hostname; copy button works; panel accurately labels local listener, Cloudflare Healthy and AI tool login as separate checks |

Additional browser checks: Back/Next through all 8 steps; refresh and restart preserve selected step in the same browser; no new pairing/permission granted by resume state. At narrow/mobile viewport, no clipped inputs/buttons; keyboard Tab/Shift+Tab, focus indication, labels and Enter submit operate as intended. Confirm older routes `/credential-vault`, `/cloudflare-setup`, `/cloudflare-config`, `/oauth-settings`, and `/tunnel-control` still render and show the same data. Preserve production server/client configuration.

## C. Distinct external connection acceptance (not inferred by LocalDesk)

1. Verify Tunnel **Healthy** and DNS published hostname match in Cloudflare's official dashboard; LocalDesk process `running` or local MCP 401 is insufficient.
2. In ChatGPT, check existing custom MCP connection with authorized Cloudflare Access sign-in; run `list_roots`, `list_files`, `read_file` on a non-sensitive read-only fixture folder. Do not disclose fixture secrets in chat.
3. In Claude, repeat Cloudflare Access sign-in and the same three tool calls using the Claude connector and callback.
4. Record success/failure **independently per client**. Do not mark an untested client Connected. OAuth login success without a tool call is not full tool verification.

This externally authenticated check might need the actual chat application/plugin to be available and signed in. **A pass in all automated tests does not prove this external gate.**

## D. Release decision

- **M2.7 automated code QA PASS (2026-11-01):** all supplied host tests, typechecks and production build passed. Full interactive browser QA is still pending and must not be inferred from static test checks.
- **Full M2 acceptance:** all code QA checks plus actual external client checks for the claimed supported connectors, or clearly document the client(s) whose end-to-end verification remains pending rather than implying success.
- **Commit/push of verified automated-QA slice:** owner supplied successful host logs. This slice may be committed with manual/mobile/client E2E explicitly documented as remaining gates; the Git commit is NOT a claim that external tools are verified. Exclude `next-env.d.ts`, `.env*` except safe templates, Cloudflare secrets, OS keychain state, logs and test fixtures.
- **Next project scope:** M3 Secure Read & Write behind separate authorization/security gate; M4 cleanup/refactor of duplicate configuration pages after migration compatibility checks. Do not enable Write or delete existing routes as an incidental M2 change.
