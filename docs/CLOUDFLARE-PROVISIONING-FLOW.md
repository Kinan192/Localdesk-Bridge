# Cloudflare Tunnel Provisioning — Existing-Domain Beginner Path

**Product target:** New Windows/macOS user, plus Linux, who already owns a domain and wants ChatGPT Web or Claude Web to read locally approved files through MCP. User is not expected to know cloudflared or Cloudflare Tunnel syntax.

**Architecture decision:** Per-user, **remotely-managed Cloudflare Tunnel** created under the user's Cloudflare account and domain. The app developer does not operate a VPS, DNS, central relay, or shared tunnel. This is not Cloudflare Quick Tunnel.

## Product UI

Install → choose ChatGPT/Claude Web → enter Cloudflare-managed domain and access email → authorize narrowly scoped Cloudflare API operations → review exactly what will change → Protect Access → create tunnel/route/DNS → start local services → verify OAuth and read test → connected.

### Authorizing the user's Cloudflare account

Do **not** claim that opening the Cloudflare login page gives this third-party local app permission to make Cloudflare API calls. Cloudflare's documented path is an **API token** made under the user's account. Cloudflare token template URLs can prepopulate the permission form, but the user must finish creation and copy the one-time token. Never ask for Global API Key. Never embed the developer's API token.

Design an explicit token authorization step using a helper to open an official Cloudflare token template URL with reviewed minimum scopes, then receive the token only in a protected desktop helper/OS keychain. A localhost dashboard without owner authentication should **not** accept Cloudflare secrets.

Suggested permission set to verify against current Cloudflare APIs:
- Account: Cloudflare Tunnel Write (or equivalent Cloudflare One Connector write permission) for creating tunnel and connector credentials
- Zone: DNS Write, restricted to the selected Cloudflare-managed zone
- Account: Access Apps and Policies Write, for a restricted self-hosted Access app
- Zone: Zone Read, for choosing and verifying the domain

Review each permission and minimize its account/zone scope before enabling actual provisioning. Token creation, revocation and secret rotation need their own UI.

Official token template documentation: https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/

## Automated plan and protective ordering

1. Detect OS and architecture, safely install/download authenticated official cloudflared binary if absent after owner confirmation. Never require an interactive terminal for normal use.
2. Verify Cloudflare API token, list accessible accounts and zone(s), confirm that the entered domain is active in Cloudflare. Resolve conflicts if DNS hostname already exists; never overwrite unrelated records.
3. Generate a unique resource name and a safe proposed hostname (for example mcp.example.com) with no existing collision.
4. **Create restricted Access application and an Allow policy for the selected email, enable Managed OAuth and capture team domain/application AUD. No public DNS record exists yet.** Confirm Access policy actually evaluates as required before connecting a public hostname.
5. Create a *new*, dedicated remotely-managed Tunnel through the Cloudflare API, with ingress mapping ONLY the MCP loopback listener `http://127.0.0.1:8401` and a catch-all 404 rule. Do not point anything to dashboard port 3100.
6. Create a proxied CNAME `mcp.example.com -> <new tunnel UUID>.cfargotunnel.com`. Never mutate any pre-existing tunnel or DNS record without explicit opt-in and an ownership check.
7. Save non-secret config (team domain, AUD, hostname) in private per-user state. Save tunnel/API secrets only in OS secret storage; never in browser localStorage, source repo, logs or the permitted MCP filesystem roots.
8. Start the bounded local MCP HTTP listener and cloudflared connector. Track processes separately. Validate unauthorized requests are rejected by the origin and via Cloudflare. Test OAuth discovery and the actual client-mediated `initialize`, `tools/list` and `list_roots` / `read_file` call on a throwaway user-approved folder.
9. Display **Connected** only after a real authenticated tool call from the selected web client. A saved config, healthy tunnel, 401 probe or OAuth browser login alone are intermediate statuses.

**Safe failure and cleanup:** keep the remote listener fail-closed. If any step fails, show the exact owned resources created so far, offer retry or owner-confirmed cleanup. Never delete unrelated customer Cloudflare resources. Separate uninstall of local software from account-side revocation.

## P1A: One-shot Cloudflare API verification (2026-10-29)

- New `POST /api/local/cloudflare/verify`: same-origin localhost guarded, read-only `GET /user/tokens/verify` followed by bounded `GET /zones` calls to the fixed Cloudflare API host.
- Requests use an explicit 9-second timeout, no redirects with Authorization, and a bounded response body. Only validated zone IDs, names, account information and status are returned.
- The token is held only for the one-shot request in process memory; **not** written to disk, browser storage, logs, or the response. The browser clears its input immediately on submit. The user must re-enter a token for a later verification.
- This is **not** permission proof for Tunnel/DNS/Access writes, OAuth, or remote connectivity.
- Before enabling persistent credentials and write APIs, implement owner-authenticated localhost UI/helper with CSRF protection, native OS keychain storage, explicit operation approval and Cloudflare API permissions review. An API token entered into a localhost form remains sensitive to malware or other processes with the user's local privileges; do not advertise this read-only preview as a complete credential vault.
- Unit tests for successful verified zone listing, rejected credentials and token-redaction need host audit.

**Warning:** If Cloudflare returns a very large zone list, the preview intentionally caps pagination to five pages (250 zones). It does not scan beyond that.

## P1C kickoff: Official API-token template (2026-10-29)

The Web MCP first-run wizard now opens a Cloudflare **user API-token creation form with Zone Read and DNS Read prefilled** using Cloudflare's documented template URL (pure helper `src/lib/cloudflare-token-template.ts`). This is deliberately limited to verification and hostname preflight—not DNS changes or Tunnel/Access writes.

The token template uses Cloudflare-required scope placeholders `accountId=*` and `zoneId=all`. **The user must narrow the scope in the Cloudflare dashboard before issuing the token** where practical; opening the URL does not create or authorize a token. No secret is embedded in the URL.

This is a preparation step, not a substitute for the still-missing authenticated local owner/session boundary and native keychain. No Cloudflare mutation has been enabled. One new unit test validates the generated template URL, read-only permissions and absence of token parameters. Host audit is pending.

Official format: https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/

## P1B: Hostname preflight (2026-10-29)

Read-only foundation now available:
- `POST /api/local/cloudflare/preflight` requires the one-shot token plus the domain, subdomain, and Access-allowed email. It verifies the token, finds the exact **active** Cloudflare zone, then reads exact DNS records for the proposed MCP hostname via official Cloudflare API GET requests.
- Existing records block the proposed hostname; an empty exact-name lookup marks it only **candidate**, not approved to publish. Wildcard DNS, Access app collisions, tunnel configuration, and write permissions remain unverified. Any DNS query failure blocks setup.
- The wizard uses the same one-time token input to perform either basic domain listing or the stronger preflight (when a setup preview is present). The token is cleared after submission.
- There are no Cloudflare POST/PATCH/DELETE operations. Existing account resources are not touched, and no token/connector secret is persisted.
- Three new deterministic tests cover occupied hostname, candidate, and fail-closed inputs/API errors. **Host audit pending.**
- Current local dashboard protections remain same-origin localhost checks, not true OS owner authentication. **Do not** enable Cloudflare writes or store API tokens before implementing owner authentication and an OS-protected secret store.

Next: a per-installation owner identity and scoped OS keychain/credential handling for Windows/macOS/Linux, followed by explicit owner-authorized provisioning with Access created and confirmed **before** DNS publication. Each action needs safe rollback/reconciliation and unit tests.

## Code implemented as of 2026-10-28

- `src/server/cloudflare/provisioning-plan.ts`: strict, pure validation of `domain`, `subdomain`, `allowedEmail`; planned endpoint and protected-first action preview.
- `src/app/api/local/cloudflare/preview/route.ts`: localhost-only, same-origin guarded preview API. Does **not** call Cloudflare or write secrets.
- `src/features/onboarding/first-run-wizard.tsx`: a beginner form for existing-domain users showing the preview, permissions and required stages, labeled clearly **not executed**.
- `tests/foundation/cloudflare-preview.test.ts`: tests canonical hostname, security ordering, and rejected unsafe inputs.

**Not yet implemented:** API token authorization, Cloudflare account/zone access verification, signed cloudflared installer, actual tunnel/DNS/Access mutations, secure OS keyring and end-to-end authenticated tests. Do not confuse preview with completed provisioning.

## Primary official references

- Cloudflare Tunnel remotely managed: https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/
- Create tunnel via API and publish routes: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/
- Protect self-hosted apps first: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- Managed OAuth: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- API token creation: https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/
