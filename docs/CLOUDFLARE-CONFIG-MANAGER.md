# Cloudflare Configuration Manager — Phase 2

Source implemented 28 October 2026. Previous audit passed 27 unit tests and 3 MCP smoke tests but failed the full Next.js TypeScript check due to ProcessEnv typing. A dedicated RemoteConfigEnvironment type fixed the config builder, but Next.js then flagged the raw process.env argument at MCP HTTP startup (TS2559). The HTTP entrypoint now constructs a four-property object explicitly before calling resolveCloudflareConfig. Run typecheck and full audit to verify the final fix; the latest change has not yet been compiled on the user device.

## Automatic import from Cloudflare Setup (2026-10-30, audit pending)

New owner-only read-only route `GET /api/local/cloudflare/import-preview` reads verified local deployment metadata and returns **hostname + Access AUD + port 8401**. If the stored Cloudflare API token also has optional *Access: Organizations, Identity Providers, and Groups Read*, the route retrieves the organization's `auth_domain` via official GET `/accounts/{accountId}/access/organizations` and prefills Team Domain as well. It does not save tokens, write Cloudflare resources, or overwrite previously saved configuration. If the optional scope is unavailable, just Team Domain needs manual entry.

Open `http://127.0.0.1:3100/cloudflare-config` directly or use **Impor Access & Hostname ke Remote MCP Service** link on Cloudflare Setup once Access AUD exists. This page fetches saved settings and import preview, preserves existing settings, requires owner pairing, and explicitly saves validated nonsecret config via existing `PUT /api/local/cloudflare`. After saving, AI Connections → Remote MCP Service → Refresh should say Configured, then Start MCP HTTP runs the protected port 8401 listener. It DOES NOT start `cloudflared`; the existing/new tunnel connector must be started separately. No Remote Desktop Commander involved.

## Dashboard workflow

Open AI Connections → ChatGPT Web or Claude Web → Configure tunnel.
Enter the MCP public hostname, Cloudflare Access team domain, and Access Application AUD.
Choose Save locally. The form reloads these values when opened again.
Clear saved config removes the local settings file after confirmation. It does not change Cloudflare routes or running services.

## Data and security

Only validated routing identifiers and the local HTTP port are stored in cloudflare.json beside policy.json in the user-local state directory.
Unknown fields are rejected. The file is written privately on POSIX hosts, using an atomic rename.
localhost-only GET/PUT/DELETE API at /api/local/cloudflare. Browser mutations require the existing same-origin and custom-header checks.
Saving never starts a service, creates a tunnel, or checks Cloudflare OAuth.
Never expose the dashboard port 3100 through Cloudflare. MCP HTTP runs separately on 127.0.0.1:8401.

## Startup

After saving, from the local project directory run:

```bash
npm run mcp:http
```

The server resolves its configuration from disk. Explicit environment variables override the saved values for advanced setups.
The remote HTTP service still refuses to start without valid settings and requires a verified Cloudflare Access JWT for every request.

## Verification

```bash
npm run audit:all
npm run dev
curl -i http://127.0.0.1:3100/api/local/cloudflare
```

The GET response should return configured false on a fresh install or the persisted config on an existing install.
Tests exercise persistence, invalid input, symlink safety, and environment overrides.
Auth, real Cloudflare and remote-client connectivity are not yet positively verified.

## Next phase

Bounded service management with safe Start/Stop, then cross-platform packaging for Windows/macOS/Linux.
Do not build a generic terminal executor into dashboard API.

Old independent MCP installations must remain unchanged.
