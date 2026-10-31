# Remote MCP via Cloudflare Tunnel — Local MCP Manager

**Status: implementation source created, NOT deployed or connected yet.**  
**Target:** ChatGPT Web and Claude Web. **No VPS required.** One Next.js project remains the owner UI.  
**Date:** 2026-10-28.

## New-user Web MCP onboarding (product priority)

The intended user is a first-time **Windows/macOS ChatGPT Web or Claude Web** user without any existing tunnel. Do not assume the developer's current Cloudflare account or tunnel is available to them.

- **New Web MCP** is the dashboard's default installation path; **Existing Tunnel** is advanced.
- A stable Cloudflare published hostname requires the user's own Cloudflare account and a domain managed in Cloudflare. With the current local-only architecture, a user without a domain needs either a domain or a future separately hosted, authenticated relay product. Do not market temporary Quick Tunnels as a permanent protected connection.
- The dashboard does not yet create the Access application, Managed OAuth, tunnel, DNS record or cloudflared service. These are the next automation milestone, and all external changes must require the user's authorization.
- The installer goal is no daily terminal use; Windows/macOS first, Linux supported. The present GitHub clone is a developer installation.

**Official prerequisites:** https://developers.cloudflare.com/tunnel/get-started/

**Current roadmap:** `docs/NEW-USER-SETUP-ROADMAP.md`.

## Architecture and security boundary

```text
ChatGPT Web / Claude Web
           |
           | MCP Streamable HTTP + OAuth
           v
Cloudflare Access [Managed OAuth, approved email only]
           |
Cloudflare Tunnel (cloudflared)
           |
           v
http://127.0.0.1:8401/mcp   # MCP server, separate process
           |
Cloudflare Access assertion JWT verified at origin (issuer + AUD + RS256)
           |
           v
5 read-only MCP tools -> Policy Engine -> approved local folders

http://127.0.0.1:3100/      # Next.js admin/dashboard; NEVER tunnel
```

Security protections implemented:
- `npm run mcp:http` refuses to start without valid `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `MCP_PUBLIC_HOSTNAME`.
- HTTP listener binds only `127.0.0.1`. Default port `8401`; this avoids stable MCP V4 on other ports.
- Every request requires a signed `Cf-Access-Jwt-Assertion` validated against Cloudflare's rotating JWKS at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`; issuer and application AUD are checked.
- Reject unknown Host, browser Origin, unrelated endpoints. Never tunnel Next.js port 3100.
- Exactly five read-only tools registered. No write/edit/delete via remote HTTP.
- For this alpha, MCP POST requests must have an explicit Content-Length of at most 64 KiB. Chunked POST requests without Content-Length are refused; if a cloud provider sends chunked POSTs, that transport compatibility must be fixed before going live.
- Policy reloaded for each tool call so folder removal and tool revocation take effect without restarting HTTP server.
- Logs contain only tool, root ID, time and outcome; no file contents, names, prompts or secrets.

**Important:** this is an alpha. A file-engine race/TOCTOU risk remains for hostile local processes that can manipulate parent folders during access; never enable remote write until the file sandbox is hardened. A live Internet deployment requires successful audit, hostname/OAuth verification and explicit owner review. Do not publish an unprotected Quick Tunnel.

## Step 1 — Prepare Cloudflare Zero Trust

1. Use a domain managed by Cloudflare, e.g. `mcp.yourdomain.example`. Never reuse the dashboard/admin hostname.
2. Cloudflare Zero Trust → **Access controls → Applications**: create a **self-hosted application** for this hostname.
3. Create an Allow policy for your **own email identity only** (not Everyone). Use email OTP or your chosen identity provider.
4. In the application's **Advanced** tab, enable **Managed OAuth**. It converts an otherwise unusable browser redirect into standard OAuth discovery, but requires an MCP client that implements **RFC 8707 (resource indicators)**. Confirm your chosen ChatGPT/Claude Web client can complete the OAuth flow; compatibility has not been demonstrated yet.
5. Configure permitted redirect URIs / localhost/loopback client settings according to your client, and use short access token lifetime (Cloudflare recommends 5–15 minutes).
6. Copy the **Access Application AUD tag**, and obtain your **team domain** like `myteam.cloudflareaccess.com`.
7. For the tunnel/public hostname, enable **Protect with Access** (in addition to origin JWT verification). Always verify requests require login before exposing any approved folder.

Official docs:
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/

## Step 2 — Configure Cloudflare Tunnel

1. Cloudflare Dashboard → **Networking → Tunnels**.
2. Create a separate tunnel or use a new isolated route in an existing user-managed tunnel. Do not edit the existing **stable Arch Local MCP V4** routes.
3. Add a **Published application route**:
   - Public hostname: `mcp.yourdomain.example`
   - Service: `http://127.0.0.1:8401`
   - Use the Access application policy for this hostname.
   - Enable **Protect with Access** on the tunnel route if available.
4. Install/run **cloudflared** using the official dashboard command for your computer. Keep the tunnel credential private; never paste it into the dashboard or repository.
5. This tunnel maps `https://mcp.yourdomain.example/mcp` → `http://127.0.0.1:8401/mcp`.

Reference: https://developers.cloudflare.com/tunnel/get-started/

## Step 3 — Run local MCP HTTP server (new terminal)

```bash
cd ~/Projects/local-mcp-manager
npm install
npm run audit:all
```

After Access and the route are configured, you can save the public hostname, Access team domain, audience tag and HTTP port through AI Connections → Configure tunnel → Save locally. The recommended cross-platform startup command is simply `npm run mcp:http`; values are read from `cloudflare.json` in the local state directory. Existing running servers must be restarted to load changes. Advanced users may still pass environment variables (they override saved values), for example:

```bash
CF_ACCESS_TEAM_DOMAIN='myteam.cloudflareaccess.com' \
CF_ACCESS_AUD='paste-your-real-Access-AUD-tag-here' \
MCP_PUBLIC_HOSTNAME='mcp.yourdomain.example' \
npm run mcp:http
```

You may set `MCP_HTTP_PORT` for a non-conflicting unprivileged port, but then update the Cloudflare Tunnel route as well.

The origin will log `[remote-mcp] Listening on 127.0.0.1:8401/mcp (Access JWT required)`.

To verify fail-closed mode on your own machine:

```bash
curl -i http://127.0.0.1:8401/mcp
```

Should produce `HTTP 401` when no Access JWT is present. With an incorrect Host, response is `403`; requests to dashboard routes on port 8401 get `404`. A `401` is expected at origin and **does not** indicate a failed OAuth configuration at Cloudflare's public edge.

## Step 4 — Connect AI web clients

- **Claude Web:** Customize → Connectors → Add → Custom → Web (atau Add custom connector), masukkan `https://mcp.yourdomain.example/mcp`, pilih autentikasi login dan OAuth client sesuai yang terdeteksi, lalu ikuti Cloudflare Access login.
- **ChatGPT Web:** Plugins → Add custom MCP server (if account/workspace permits it) → HTTPS endpoint above → OAuth login.
- Cloudflare Managed OAuth supplies protected token discovery and token exchange. Do NOT attempt to paste a Cloudflare tunnel token into the AI client's MCP settings.
- Read-only tool scan should list exactly: `list_roots`, `list_files`, `read_file`, `search_files`, `file_info`.
- Use File Access in the localhost dashboard to approve only a non-sensitive test folder first, then call `list_roots`. No folder is approved by default.
- A successful login must then be followed by an authenticated MCP `initialize`, `tools/list`, and `tools/call` smoke check. Existing unauthenticated HTTP tests only prove fail-closed behavior; they do not demonstrate the positive end-to-end Cloudflare path.

**Account limitation:** ChatGPT custom MCP creation is plan/workspace-gated. As of Oct 28, 2026, the OpenAI help article lists full custom MCP for Business/Enterprise/Edu, with some custom read/fetch support on Pro; it does not promise full custom MCP availability on Plus. Verify the Add custom MCP server control exists in your ChatGPT account before paying for infrastructure. Claude Web menyediakan custom remote MCP connector pada Free (terbatas satu), Pro, Max, Team, dan Enterprise sesuai ketentuan akun/organisasi. Periksa menu Customize → Connectors pada akun masing-masing.

## Priority acceptance test: Claude Web before more features

The next real milestone is a **verified authorized read** through Claude Web. Do not proceed to further service-manager or installer work until the checks below are completed:

1. Host build gate: `npm run typecheck && npm run audit:all`. The foundation `RequestInit.cache` error in the newly added service module has been corrected; that correction still requires a host audit.
2. Configure a **separate** Cloudflare Access-protected MCP hostname. Do not change the existing stable MCP routes, and never tunnel the Next.js port 3100.
3. Enable Managed OAuth in the Access application's Advanced settings and restrict the Allow policy to the authorized account. Cloudflare requires RFC 8707-compliant clients for this feature.
4. Save hostname/team domain/application AUD in the local dashboard. Launch the HTTP MCP service, then verify `curl -i http://127.0.0.1:8401/mcp` returns 401 without a JWT. This is only an **origin** safety check.
5. From the public hostname, confirm Cloudflare's OAuth discovery is available at `https://<your-mcp-hostname>/.well-known/oauth-authorization-server`, and unauthenticated MCP requests are challenged, not publicly granted.
6. In Claude Web, add a **Custom Web** connector for `https://<your-mcp-hostname>/mcp`. Complete Cloudflare Access OAuth; do not paste token credentials in chat.
7. Approve only a throwaway test folder from File Access. Confirm `list_roots`, `list_files`, and `read_file` work through Claude Web and rejected paths remain inaccessible.
8. Record success/error messages (redact tokens, IDs, file content). If login succeeds but MCP calls fail, inspect SDK transport compatibility, Content-Length constraints, and Access JWT verification before implementing other features.

Official references:
- Cloudflare Managed OAuth: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- Claude custom web connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

## What is not automated yet

- Cloudflare account login, tunnel creation, and Managed OAuth configuration are done manually in Cloudflare's UI.
- There is no live AI connection monitor, self-test against Cloudflare's public endpoint, auto-restart, or installer.
- Dashboard Remote Setup sekarang menyimpan **identifier non-rahasia** (hostname, Access team domain, AUD, port) ke konfigurasi lokal. Tidak menyimpan API key, tunnel token, atau OAuth client secret, dan tidak membuat tunnel otomatis.
- The new HTTP implementation and tests must pass a fresh `npm run audit:all` before first actual use.

## Tests

```bash
cd ~/Projects/local-mcp-manager
npm install
npm run audit:all
```

The new foundation tests reject invalid remote settings and origins. An additional offline JWT security test, `tests/foundation/access-auth.test.ts`, signs a local RS256 test token and checks signature, issuer, application AUD, required identity/expiry/issued-at claims, expired tokens and forgery rejection. This does not use your real Cloudflare credentials or external services.

**Remote status:** HTTP authorization has been tested only as a fail-closed smoke test, not with a real Cloudflare Access login or verified tool invocation. The positive JWT tests use a local temporary key, not a real CF JWKS. Before enabling the Cloudflare hostname, verify Managed OAuth setup and all tools from an authorized browser client. Only add a non-sensitive test folder first.

The new foundation tests reject invalid remote settings and origins. The HTTP smoke test launches the origin temporarily using fake config to check unauthorized (401), wrong Host (403), disallowed Origin (403), and lack of dashboard routes (404); it **does not connect to Cloudflare** or publish anything.

### 2026-10-28 — Host-header smoke test regression

The initial HTTP smoke test failed at `tests/mcp/http-auth-smoke.test.ts` with `401 !== 403` when it tried to force `Host: evil.example.com` using `fetch()`. A Node fetch implementation may set or normalize the Host header instead of forwarding the supplied value. The **test** now uses `node:http.request` with an explicit Host, verifying a real invalid Host returns 403 and a legitimate localhost Host without a JWT returns 401. The server-side hostname validation is unchanged. Run `npm run test:mcp` and `npm run audit:all` to confirm; no post-fix runtime result has been observed yet.

This directory is independent of `~/Projects/local-file-mcp`.
