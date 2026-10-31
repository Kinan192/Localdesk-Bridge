# P1C — Local owner authorization (developer-mode foundation)

**Updated:** 2026-10-29  
**Scope:** Local MCP Manager, dashboard 127.0.0.1:3100.  
**Status:** P1C developer-alpha acceptance PASSED on 2026-10-29: 89 source files, 44/44 foundation tests, 3/3 MCP smoke tests, both TypeScript checks and production build; real browser returned `paired: true`; live unauthenticated PATCH `/api/local/policy` returned HTTP 401 with the expected owner-pairing error. Full native owner/secret isolation and read-only GET protection are separate P1D hardening tasks.

## Threat model and implemented boundary

Being able to POST to `localhost` is not proof that a request came from the application's owner. This stage keeps strict Host, Origin, JSON and `X-Local-MCP-Action` checks, and requires a separate owner-paired cookie for privileged local API actions.

The project uses the existing **OwnerPairingRepository** implementation in `src/server/owner/index.ts`:

1. From a trusted local terminal, `npm run owner:pair` creates a 256-bit single-use pairing ticket (2-minute lifetime). It prints a loopback URL containing the ticket in its **fragment** (`#owner-pair=...`), not as an HTTP query.
2. The owner opens the printed URL locally. Browser pairing must redeem it through `POST /api/local/owner/pair` with the existing same-origin JSON action headers.
3. The server consumes the ticket atomically and issues an eight-hour `HttpOnly`, `SameSite=Strict` signed cookie; the signing key is a private per-user file. The ticket cannot be reused, and expired, forged or malformed sessions are rejected.
4. `GET /api/local/owner` returns only paired status. The endpoint is an informational check, not a Cloudflare authorization token.
5. `ensureOwnerRequest` uses both `ensureLocalRequest` (Host, Origin and CSRF headers) **and** the verified owner cookie.

## Privileged endpoints

Owner pairing is required for:
- `POST/PATCH/DELETE /api/local/policy` (read-root and tool controls)
- `POST /api/local/service` (start/stop managed remote MCP HTTP)
- `PUT/DELETE /api/local/cloudflare` (save/clear local routing config; still no remote write)
- `POST /api/local/cloudflare/verify` and `/preflight` (Cloudflare token input, read-only)
- `PATCH /api/local/onboarding` (saved onboarding state)

`/api/local/cloudflare/preview` remains non-mutating and can generate a sanitized plan without contacting Cloudflare. `POST /api/local/owner/pair` must **not** require an existing owner session, because it is how the first session is established; it still checks same-origin, JSON and the custom header.

## Tests

- `tests/foundation/owner-pairing.test.ts` covers unique short-lived ticket redemption, signed sessions, expiry, replay, and filesystem safety.
- `tests/foundation/owner-route-guard.test.ts` covers unauthorized loopback modification attempts, valid paired sessions, wrong Origin, tampered sessions, and static checks that all listed privileged routes enforce the owner gate and that the root layout mounts the browser pairing handler.
- `npm run audit:all` is the host acceptance gate. If this fails, do **not** enable Cloudflare writes or claim P1C verified.

## Local validation

From `~/Projects/local-mcp-manager`:

```bash
npm run audit:all
npm run dev
```

In a **second local terminal**, run `npm run owner:pair` and open its pairing link in the browser running the dashboard. The link is valid for two minutes and one redemption. Generate a fresh link after starting the dashboard; the first link generated prior to the host audit may have expired.

**2026-10-29 pairing UI fix and QA:** `/api/local/owner` returned `paired: false` after the owner generated new tickets. Inspection of active `src/app/layout.tsx` and `src/app/page.tsx` found neither referenced the existing `OwnerPairingBanner` component. The banner is now explicitly imported and mounted in the root layout. A static regression test was added to `tests/foundation/owner-route-guard.test.ts`. The full host audit subsequently passed (44/44 foundation tests, 3/3 MCP smoke tests and production build). The user confirmed `paired: true` from `/api/local/owner` in the same browser after manually opening a fresh pairing link. The user subsequently verified live unauthenticated HTTP 401. Review of current route source found sensitive read-only local endpoints still guarded only by localhost Host rules; those are recorded for P1D remediation.

Then inspect `GET http://127.0.0.1:3100/api/local/owner` in that same browser. Successful pairing should report `paired: true`.

A POST with valid localhost headers but no signed session must return HTTP **401** from a privileged endpoint. Never send actual Cloudflare credentials in a smoke test. If the browser does not redeem the URL fragment correctly, the UI pairing portion remains unfinished even when backend tests pass.

## Remaining security work before real Cloudflare provisioning (P1D and later)

**Local GET review (2026-10-29):** `GET /api/local/policy` exposes configured filesystem roots and requires a paired owner session before public release; `GET /api/local/cloudflare` returns non-secret routing identifiers; `GET /api/local/setup` can include local paths. Activity, onboarding, service, and status endpoints disclose limited metadata and need an explicit pre-pair policy. Treat these as P1D requirements. This review does NOT mean these endpoints have been changed yet.

- OS-level owner identity/IPC via a trusted Windows/macOS/Linux launcher, with verified installer and controlled session handoff; a local process under the **same OS identity** can read/modify private user state files, so this foundation is **not** strong isolation from same-user malware.
- Native OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service or equivalently protected provider), credential lifetime/revocation and no plaintext token persistence.
- Separate confirmation for each side-effecting Cloudflare operation, Access policy created and verified before DNS publication, safe retry/rollback and no collision/overwrite of unrelated resources.
- Actual end-to-end first-run ChatGPT/Claude Web OAuth and MCP tool call, independent of existing developer infrastructure.

**Provisioning remains disabled.** Do not expose dashboard port 3100 via the tunnel. The only planned origin for external web MCP is the separately authenticated loopback server at 127.0.0.1:8401.
