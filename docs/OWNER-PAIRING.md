# P1C — Local installation owner pairing (developer alpha)

**Purpose:** prevent a random process or browser origin that can reach http://127.0.0.1:3100 from using Cloudflare token-bearing `/api/local/cloudflare/verify` and `/api/local/cloudflare/preflight` endpoints, even if it can guess Host and Origin headers.

**Status:** source implemented 2026-10-29, **host audit and real browser QA pending**. No Cloudflare write endpoints are enabled. This does not yet store secrets in a keychain or create tunnels.

## Why owner pairing

Hostname, localhost and CSRF checks do not establish that the browser session belongs to the owner. A **trusted local launcher** creates a 256-bit pairing ticket in the user's local private state folder, with only a SHA-256 digest stored in `owner-pairing.json`. The raw pairing ticket is returned directly to the trusted launcher and sent to the browser in a URL **fragment**, which is not included in the HTTP GET request. The browser immediately removes the fragment from its address bar and calls the guarded local pairing endpoint. If valid, the app sets an `HttpOnly; SameSite=Strict` cookie, signed with a private installation key. Tickets expire after two minutes and are consumable once. Browser sessions expire after eight hours.

The pairing key file is private to the user's OS account (POSIX mode 0600 checked; Windows will need proper ACL verification in a future native launcher). A compromised process running as the **same OS user** can still read private state; protecting against such malware requires OS-specific trust/isolation. This pairing protects against unpaired browser sessions and accidental localhost exposure, not malware.

**Local development workflow** (temporary, while installer is not packaged):

1. Run `npm run dev` as usual.
2. In another local terminal, run `npm run owner:pair`.
3. Open the one-time localhost URL displayed. It expires in 2 minutes; don't share it.
4. Dashboard displays `Owner browser paired`. Cloudflare verification and DNS preflight accept requests in this session. Tunnel provisioning remains disabled.

**Future product workflow:** Windows/macOS/Linux packaged launcher calls `OwnerPairingRepository.createTicket()` itself, opens the URL in the default browser, and never displays a terminal. The installer will add native owner authorization and keychain storage before any Cloudflare write API is exposed.

## Files and controls

- `src/server/owner/index.ts`: signed short-lived session and single-use pairing repository
- `src/app/api/local/owner/route.ts`: read pairing status (no token/secret returned)
- `src/app/api/local/owner/pair/route.ts`: one-time pair, cookie is HttpOnly + SameSite Strict
- `src/server/http/local-only.ts`: additional `ensureOwnerRequest` guard
- `src/app/api/local/cloudflare/verify/route.ts` and `preflight/route.ts`: require authenticated pairing
- `scripts/owner-pair.ts`: developer-only pairing launcher
- `src/features/onboarding/owner-pairing-banner.tsx`: fragment redemption/status UI
- `tests/foundation/owner-pairing.test.ts`: valid, expired, single-use, forgery, permissions tests

### Security boundaries and limitations

- Pairing uses existing same-origin Host/Origin/JSON/custom-header restrictions.
- Do not put an API token into the pairing link; pairing link contains a short-lived random ticket only.
- The owner cookie is not marked Secure on **HTTP loopback**. This route must never be exposed to the internet, proxied or used as a public admin surface.
- **Mutating dashboard APIs** (folder policy, MCP service control, saved Cloudflare identifiers, onboarding progress, and the Cloudflare token-bearing preflight/verify routes) now call `ensureOwnerRequest`; an additional test audits these handlers. Some read-only APIs still return local information without owner login. Review the full route inventory and add a native owner boundary before public release.
- P1D before Cloudflare writes: install-scoped native owner service / trusted IPC, OS keychain, lifecycle controls, server-side rate limiting and token revocation, plus end-to-end authenticated Claude Web testing.
