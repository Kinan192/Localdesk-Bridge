# M2 Implementation Plan — One-Page Setup Wizard

**Date:** 2026-10-31  
**Status:** M2.1 ACCEPTED on user's Arch Linux (2026-10-31); M2.2–M2.7 are not yet implemented/accepted.  
**M1 gate:** accepted on user's Arch Linux after global `localdesk` command, scoped shutdown, and 32/32 focused startup tests.  
**Scope:** FR-04, FR-05, FR-06 and M2 portion of FR-10 in `docs/PRD-V1-RELEASE-REFACTOR.md`.

## Current source inspection

- `src/app/setup-center/page.js` currently shows 8 steps and a progress count, but required configuration forms are behind **links to other routes**. Back/Next only changes the displayed explainer panel, so the main requirement to configure entirely in one page is **NOT met**.
- `src/features/setup-center/steps.js` defines the eight steps, but the `href` property makes external internal-page navigation necessary for most configuration tasks. Existing user guidance is useful for the new inline wizard.
- `src/features/setup-center/progress.ts` derives step status exclusively from trusted server facts, but the active step exists only in React memory and resets on page refresh. Verification in ChatGPT/Claude is correctly left as `verify-in-client`.
- `src/components/setup-navigation.js` still links six distinct setup routes. Keep them for compatibility during migration, but never require them in the primary wizard.
- Existing owner-protected API surface includes policy, Cloudflare credential/deployment/preflight/preview/setup-draft/verify/DNS/OAuth/config and local service/Tunnel endpoints. These must be reused through least-privilege, owner-guarded calls; **no API endpoint or provider write can be bypassed**.

## Sequential work slices (one at a time)

1. **M2.1 — Wizard state/resume:** validate current step against the 8 known IDs; persist non-secret progress in an owner-protected local storage contract (or existing trusted server state); derive verified completion only from server facts. Introduce an inline step container and Back/Next. Tests: invalid step, refresh/restart, expired pairing, no token/cookie leakage; no change to Cloudflare.
2. **M2.2 — System + Folder panels:** display actual requirements and current approved roots inline; allow only safe existing read-only root actions through the owner-policy contract. Unsupported Write remains disabled. Tests: denied roots, empty state, revoke, owner-only enforcement, keyboard flow.
3. **M2.3 — Cloudflare credentials:** inline API token verification/vault workflow, with token kept only in ephemeral protected form state and OS Keychain; never persist raw token in progress or URL; preserve existing credentials.
4. **M2.4 — Cloudflare Access/Tunnel:** inline account/zone selection, preflight, preview, explicit approval, execution/recovery and DNS finalization using existing protected server endpoints. No implicit creation or overwrite; preserve existing Access app, Tunnel, DNS and callbacks; ownership and stale-lock checks.
5. **M2.5 — MCP and callback settings:** import verified Cloudflare deployment configuration, save safely, review/edit OAuth callbacks without replacing existing values or inventing client callbacks.
6. **M2.6 — Local services + AI client verification:** show supervised MCP/Tunnel states and provide owner-only start/stop; label local process vs Cloudflare Healthy vs client tool verification separately. Show exact MCP HTTPS URL and verifiable ChatGPT/Claude steps. Never mark verified from a healthy connector alone.
7. **M2.7 — Integrated wizard QA:** owner protections, CSRF, strict form validation, no inline secret persistence, mobile/keyboard behavior, non-destructive existing-user resume, partial Cloudflare failures, full tests/typechecks/build and manual browser E2E on Arch Linux.

## Implementation guardrails

- Only migrate **one step** at a time; keep standalone pages accessible as compatibility until their inline replacement passes tests. Delete or refactor old pages later in M4.
- `src/app/setup-center/page.js` is temporary migration debt. The final M4 architecture uses thin `.tsx` route pages and reusable typed components; avoid duplicating business logic while implementing M2.
- Never expose dashboard port 3100 publicly, disable Cloudflare Access, enable remote Write, print secrets, automatically reprovision cloud resources, or kill the separately managed Arch MCP V2 Tunnel.
- The owner granted standing approval to commit/push each completed, tested slice after reviewing staged paths and ensuring no sensitive/incomplete changes are included. Never force-push.

## M2 acceptance

A first-time or returning owner can complete the full Setup Center journey from **one browser page** using inline controls and Back/Next; refresh/restart preserves safe state; live status labels are honest; existing Cloudflare resources are not silently replaced; authenticated ChatGPT/Claude client tool calls still need later full client E2E gates. A completed visual progress counter alone is not acceptance.

**M2.1 changes (2026-10-31):** added `src/features/setup-center/navigation.ts` with strict 8-step IDs and safe browser-only persistence of the selected step ID; updated `steps.js` with matching IDs; `setup-center/page.js` now resumes that step only after owner pairing and uses validated Back/Next. The owner-protected APIs remain the sole source of configuration truth; no provider operations were added. Added `tests/foundation/setup-navigation.test.ts` and `npm run test:setup` for invalid/tampered browser state, blocked storage, unrelated-directory resume tests, and step consistency. Existing step panels still link to standalone pages; those forms are M2.2–M2.6. **Accepted:** host test/typecheck/build and manual browser refresh/restart passed; owner authorization/replay protections remain covered in startup regressions. Persisted position is not access authorization or a claim of provider configuration.

**M2.1 restart UX finding (2026-10-31):** User confirmed refresh on the selected OAuth step works, but restarting `localdesk` opens the root Dashboard rather than directly restoring the wizard view. This is expected from the current secure launcher: it must open root `/#owner-pair=...` to redeem the owner ticket; the wizard's last step is stored only for `/setup-center` in the same browser profile. To avoid mistaken progress-loss reports, launcher now prints a non-secret `/setup-center` resume link after the private pairing URL, and the wizard explains that after restart users should visit Setup Center in the same browser. No untested changes to the HMAC-verified pairing route or root TSX component. **Manual browser PASS (user-confirmed 2026-10-31):** after restarting `localdesk`, completing owner pairing, and reopening `/setup-center` in the same browser profile, the previously selected **OAuth callbacks** step was restored; refresh preservation also passed. **Final host evidence (user terminal, 2026-10-31):** `npm run test:setup` **14/14 PASS**; `npm run test:startup` **32/32 PASS**; `npm run typecheck` completed with no errors; `npm run build` Next.js **16.4.3** compiled successfully and generated all 9 static pages. Manual same-browser refresh and LocalDesk restart both restored OAuth step. M2.1 is accepted; M2 as a whole remains open. Automatic post-pair navigation to Setup Center is not implemented. No Git push until M2.1 acceptance.

**Immediate next acceptance:** test M2.1 only, then implement inline System + Folder panels (M2.2).
