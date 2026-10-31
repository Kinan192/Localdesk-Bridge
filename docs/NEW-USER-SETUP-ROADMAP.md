# Local MCP Manager — Web-first product roadmap

**Updated:** 2026-10-28

## Product goal and acceptance test

A first-time **Windows or macOS** user (Linux also supported) installs Local MCP Manager and connects **Claude Web and/or ChatGPT Web** to their explicitly approved local files. They should not need to know MCP configuration, terminal commands or existing Cloudflare infrastructure. The developer's older tunnel must never be used as evidence of beginner onboarding success.

Web MCP is the **primary product**, NOT a side feature. Claude Desktop and Claude Code remain optional legacy/advanced integrations and should not dominate the first-run experience.

## Why secure remote connectivity is required

Cloud-based web clients connect from provider infrastructure, not directly from the user's browser tab or local machine. They need a reachable, authenticated remote MCP endpoint (or a provider-specific secure tunnel), and the local dashboard must remain loopback-only.

The current implementation uses: local read-only MCP HTTP at 127.0.0.1:8401 → Cloudflare Tunnel → Access Managed OAuth and verified Access JWT at origin → Claude Web / eligible ChatGPT Web custom connector. **A saved config or local 401 is not proof of a working remote connection.**

Official sources:
- Cloudflare Tunnel prerequisites (account + domain): https://developers.cloudflare.com/tunnel/get-started/
- Cloudflare Access Managed OAuth (RFC 8707 client required): https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- Claude remote web connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- ChatGPT custom MCP and Secure MCP Tunnel eligibility: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## First-run experience — primary path

1. Install Local MCP Manager on a clean Windows/macOS computer. Packaged runtime and dashboard; no Git, Node.js or npm required from regular end users.
2. First-run wizard checks OS, local service, cloudflared binary, network readiness and file access policy. No file roots are approved automatically.
3. Pick Claude Web or ChatGPT Web (check account/workspace feature availability). **New Web MCP** is the default. Existing Tunnel is advanced.
4. Cloudflare authorization and provisioning: the user opens Cloudflare's official API-token page in the browser and creates a narrowly scoped token for their account and selected domain. The app can prefill a token template URL; **browser login alone is not Cloudflare API authorization**. The user explicitly approves tunnel/DNS/Access changes. App installs/starts cloudflared with consent.
5. Setup creates separate hostname/Access application, restricts user access, enables Managed OAuth and saves non-secret routing identifiers in private user state. Token credentials require OS secure storage, never JSON in repo, logs or browser localStorage.
6. Verify Cloudflare connector, public HTTPS/OAuth discovery, correctly authenticated Access JWT and real MCP initialize/tools/list/tools/call using a **throwaway test folder**. Report each stage separately.
7. Present ready-to-copy remote MCP URL and guide for adding it to Claude Web / eligible ChatGPT Web. Only show **Connected** when the remote client is authenticated and invokes tools.
8. Dashboard controls start/stop, folders, read tools, connections and troubleshooting without daily terminal commands.

## Current reality — do not overclaim

Implemented:
- Local policy engine and 5 read-only MCP tools; tests and production build passing after the 2026-10-28 audit supplied by the developer.
- Initial onboarding, system/dependency binary checks, Cloudflare identifier persistence, HTTPS MCP server with JWT validation, separate local HTTP 401 probe, alpha in-process MCP Start/Stop.
- P1B read-only preflight checks whether the selected Cloudflare DNS zone is active and whether the exact proposed MCP hostname already has a DNS record. It uses a one-shot API token, no persistence and NO Cloudflare writes; hostname status is only candidate/blocked. The new code requires a fresh host audit.
- First-run and AI Connections interface now focus on Web MCP and show new-vs-existing tunnel paths.
- Added a **read-only Cloudflare provisioning preview** for users who already own a domain: `POST /api/local/cloudflare/preview` validates domain, suggested MCP subdomain and Access allow-email, then returns intended hostname, API permissions and a protected-first action sequence. This does NOT call Cloudflare or persist credentials; the new endpoint and tests need a fresh audit.

Still missing:
- P1C developer-alpha owner pairing and a local owner session before `/api/local/cloudflare/verify` and `preflight`. Uses short-lived single-use tickets, private signing key, HttpOnly session cookie, and a browser fragment. No Cloudflare write operations are enabled. See `docs/OWNER-PAIRING.md`. Host audit pending.
- Signed cloudflared installation and OS dependency management.
- Cloudflare account authorization / domain verification / tunnel + DNS provisioning / Access policy + Managed OAuth provisioning.
- Secure credential storage and revocation workflow.
- Cloudflare OAuth and actual Claude/ChatGPT Web end-to-end test on **fresh** installations.
- Persisted Windows/macOS service supervisor and packaged installers.

## Important product feasibility decision

Under the Cloudflare-managed approach, publishing a stable hostname needs a Cloudflare account and domain. Many beginner users will not have a domain. Therefore there are two legitimate product tiers to consider:

- **Self-hosted mode:** each user brings a Cloudflare account and domain, while the dashboard automates their setup after consent. No vendor VPS required; users control their own infrastructure.
- **Managed relay mode (future):** project owner provides a domain/relay identity and isolated, authenticated user endpoints so people without a domain can connect. That requires a hosted service, strict multi-tenant isolation, cost/operations, revocation and secure authentication. It cannot be delivered by a clone-only purely local app without a new service architecture.

Do not advertise the second mode until it is implemented and security-reviewed. Quick Tunnels are a temporary development tool, not production authentication.

## Build priorities

**P0 — Web-first UX:** new Web MCP default; novice prerequisites and separate provider cards; desktop only in legacy advanced section. Validate via full audit.

**P1 — Cloudflare setup automation for beginners:** select an existing Cloudflare-managed domain, prepare official API-token template (not an invented third-party OAuth login), verify token and zone, then use Cloudflare's remotely-managed Tunnel/Access/DNS APIs. Minimum permissions to review: account Cloudflare Tunnel Write, selected-zone DNS Write, account Access Apps and Policies Write, and selected-zone Zone Read. Require explicit confirmation, fail closed, and never alter older tunnels. Set up the restricted Access app and Managed OAuth **before DNS publication**.

**P2 — Real remote end-to-end verification:** test fresh account/domain → Access Managed OAuth → Claude Web list_roots/read_file; then ChatGPT when account supports custom MCP.

**P3 — OS lifecycle and Windows/macOS installers:** bundle runtime and signed cloudflared, secure local service control, user-authorized autostart, clean uninstall/revoke. Maintain Linux support.

The primary milestone must always be a first-time **web** user who connects successfully without reading project source or using an existing tunnel.

