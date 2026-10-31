# Cloudflare Setup — Access-first automation (developer alpha)

**Code date:** 2026-10-30
**Status:** User reports live Cloudflare Access application and audience created successfully with local phase `access-ready`. Subsequent operation failed with generic message (failed action uncertain); **do not retry until inspected**. New read-only diagnosis of Access/OAuth, tunnel, DNS, and local deployment lock is implemented in source; fresh host audit PENDING. Live OAuth client login and Tunnel/DNS publication are not yet confirmed.
**Four product goals:** Core MCP Manager → Cloudflare Setup → AI Web Connect → Installer.

## What is implemented

- Owner-only local API at `/api/local/cloudflare/deployment`:
  - `GET` reads nonsecret deployment metadata and phase; rejects unpaired requests. `GET ?inspect=1` additionally performs read-only Access + policies, exact-name tunnel listing and DNS preflight, shows lock status; NEVER clears locks, creates resources, or returns tokens.
  - `POST action=prepare` creates a **new** Cloudflare self-hosted Access application on an unused hostname, an inline **allow only this one email** policy, and Managed OAuth with the explicitly supplied HTTPS callback allowlist. It verifies the application, its Access audience, its policy via the application policies list API, and OAuth configuration. No DNS publication or tunnel creation occurs in this first step.
  - `POST action=publish` only accepts a verified `access-ready` record with matching account/hostname/email and exact typed hostname confirmation. It rereads Access + policy + OAuth, reruns zone/DNS preflight, creates a **new remotely-managed tunnel**, sets a single ingress mapping to `http://127.0.0.1:8401` and a 404 fallback, rereads Access, and **creates DNS CNAME last**. This does NOT start cloudflared.
- **NEW owner-approved DNS completion for an interrupted `tunnel-ready` deployment (host audit pending):** `GET /api/local/cloudflare/dns-finalize` checks existing Access + OAuth + strict email policy, exact Tunnel ID, cloud-managed ingress to `http://127.0.0.1:8401`, and absence of DNS collisions via read-only Cloudflare API calls. `POST` requires owner pairing, same-origin mutation headers, exact hostname confirmation and a separate dashboard checkbox; it rechecks all prerequisites and creates **only one DNS CNAME**, verifies it with GET, persists `published`, and clears a safe publication lock. It **never creates a second Tunnel/Access**. For a stale lock from a previous failed publish, the lock must be older than three minutes, and a separate exclusive guard blocks concurrent completion; any uncertainty leaves the lock held. Existing hostname conflicts are not overwritten or adopted. Cloudflare DNS Write permission is required; no raw tokens/provider errors reach the browser. UI: **Cek kelengkapan DNS (read-only)** → **Selesaikan Publikasi DNS** only when `tunnel-ready`. This requires fresh host `npm run audit:all` before real-case use.
- Frontend at `http://127.0.0.1:3100/cloudflare-setup`, also linked from the Credential Vault. Owner only. Requires explicit separate checkboxes for Access/OAuth creation, Tunnel/DNS publication, and DNS recovery if an already created Tunnel exists.
- **Setup draft UX (new / audit pending):** successful read-only saved-keychain hostname preflight now saves Account ID, domain, subdomain and Access email to a nonsecret local `cloudflare-setup-draft.json` file. The Vault shows `Lanjut ke Cloudflare Setup`; `/cloudflare-setup` restores those fields for paired owner. Token remains only in OS Keychain, is never returned by draft GET, and is never put into sessionStorage/localStorage. Redirect URIs remain separately configured; Access/Tunnel writes are still OFF by default. If upgrading from the older version, re-run `Cek hostname & simpan konfigurasi (read-only)` ONCE to create this draft.
- **Dashboard-first user approval:** there is NO developer environment flag. The user first clicks **Cek kesiapan (read-only)**, which checks saved credential, active zone, DNS hostname availability, Access app collision and callback validity with GET requests only. When successful, the Stage 1 consent checkbox becomes available. Stage 1 requires explicit checkbox, exact hostname confirmation and owner pairing; Stage 2 requires a separate checkbox after Access verification. The backend independently rechecks Cloudflare before all writes and fails closed if unsafe. Do not click a creation button until the user intentionally authorizes actual changes.
- Cloudflare API token comes from OS keychain on the server by account reference; never from JSON API bodies and never copied into deployment metadata.
- Deployment metadata in `cloudflare-deployment.json` is limited to account/zone/resource IDs, approved hostname/email, callback URLs and phase. An exclusive `cloudflare-deployment.lock` stops duplicate concurrent runs. If an external action may have applied before an error, the lock remains intentionally; **inspect resources manually before clearing**. Do not delete state just to try again.
- Safety: fixed Cloudflare API origin, timeouts, bounded responses, blocked redirects, exact hostname match, preflight collision check, fail-closed verification, no adoption/overwriting of existing Access apps/tunnels/DNS.
- `POST` routes require owner session, local Host/Origin checks, JSON and custom CSRF header. The API cannot be reached from another machine unless the dashboard was unsafely exposed (do not expose :3100).

## Required Cloudflare API token scopes

- Zone Read on the selected zone.
- DNS Read **and Write** on the selected zone.
- Access: Apps and Policies Read/Write on the chosen account.
- Cloudflare Tunnel Write (or equivalent Cloudflare One Connectors Write permission).

The earlier read-only token template is not sufficient for creation. Use a short-lived, narrowly-scoped deployment token and revoke it when finished. The OS vault can replace it with explicit user consent.

A real Cloudflare DNS zone and an enabled Access identity method are required. Managed OAuth is supported only by compatible clients (including clients supporting OAuth resource indicators per RFC 8707); actual ChatGPT/Claude compatibility is NOT asserted by this build.

## Critical distinction: code vs real test

Live Stage 1 reported `access-ready` and user then saw a failed operation. The real GET-only diagnosis reported Access `verified`, Tunnel `absent`, DNS `available`, lock `held`. Do not retry Publish while locked. NEW dashboard-only controlled recovery (host audit pending) offers `Periksa ulang & pulihkan lock lokal` after the safe diagnostic. Recovery requires explicit owner consent, exact hostname, lock age at least three minutes, local access-ready state with no tunnel/DNS IDs, repeat GET verification of Access/OAuth/policy, exact-name tunnel and DNS availability, a separate recovery guard, and unchanged state. If checks fail, the lock remains. Recovery NEVER creates/deletes Cloudflare resources. After success, run a fresh Inspect, then ensure Cloudflare Tunnel Write and Zone DNS Edit token permissions before separate Stage 2 approval.

The two stages call Cloudflare and may create billable or persistent resources. Each action is an explicit user approval; code does NOT perform real Cloudflare operations automatically when starting the app.

## Real-case verification order — execute one by one later

1. Run `npm run audit:all`, inspect `/cloudflare-setup` in paired and Incognito browsers. Confirm :3100 stays loopback-only. From the browser click **Cek kesiapan (read-only)**; the check itself must never create resources. A deliberate user approval in the dashboard, not a terminal command or environment flag, is the only way to start the Access step.
2. Create/rotate a short-lived token in OS Keychain and use **read-only hostname preflight**. No writes.
3. Review chosen hostname, exact allowed email, HTTPS redirect URLs, scopes, and prior Access apps. Explicitly click **Siapkan Access + Managed OAuth**. Stop and verify Access application/policy/audience/OAuth in Cloudflare dashboard.
4. Independently verify OAuth metadata and policy behavior before publishing anything. If Access/OAuth cannot be confirmed, do NOT proceed.
5. After deliberate second approval, click **Publikasikan Tunnel & DNS**. Validate new tunnel/configuration and CNAME in Cloudflare dashboard.
6. Only in a later stage: obtain the new dedicated tunnel connector token securely and run cloudflared, then test remote OAuth and authenticated MCP tool calls from ChatGPT/Claude Web. Never expose the local management dashboard.
7. Revoke the disposable Cloudflare API token at Cloudflare and remove the local vault entry when no longer needed.

## Important current limitations

- Live Access application creation has reached the `access-ready` state, which confirms the backend's Access/policy/OAuth configuration checks. This is not proof of OAuth login or MCP interoperability. Tunnel/DNS and origin still need separate live QA. An external API variant or scope constraint may require code changes. Fail closed rather than disabling protections.
- No automatic rollback, tunnel token management, managed cloudflared process, callback discovery, or real AI client connection is implemented here. A LIMITED owner-approved recovery workflow for a stale pre-Tunnel lock is added and awaiting host audit; other uncertain states still remain locked for manual review. Never manually delete the lock or automatically replay a Cloudflare POST.
- No automatic installer or silent setup; developer uses `npm run dev` and `npm run owner:pair`.
- No support for SaaS, multiple accounts, legacy tunnel adoption, write-enabled MCP tools, or managed relay.
- The built-in origin OAuth/JWT interoperability must be tested in the subsequent AI Web connection phase.

## Primary Cloudflare API references

- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/subresources/policies/methods/list/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/create/
- https://developers.cloudflare.com/tunnel/get-started/
