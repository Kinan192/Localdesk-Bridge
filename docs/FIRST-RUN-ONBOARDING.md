# First-Run Setup Assistant — Windows, macOS, Linux

**Implementation date:** 2026-10-28  
**Status:** Previous full audit passed (30 foundation tests, 3 MCP smoke tests, TypeScript + Next.js production build). Subsequent Web-first UI changes need a fresh audit. Actual Cloudflare/Claude/ChatGPT Web sign-in and tool execution have not yet been tested.  
**Project:** `~/Projects/local-mcp-manager`; the separate existing MCP installation was not changed.

## Why this exists

The primary audience is new Windows/macOS users who want **ChatGPT Web and Claude Web** to access approved local files through a secure remote MCP endpoint. A future installer should remove the need to clone the repository or know Node/npm. The first dashboard visit opens a guided assistant.

## Implemented scope

- **Auto-open first time:** `FirstRunWizard` fetches `GET /api/local/onboarding`; no persisted state means `dismissed:false` and the wizard opens.
- **OS detection:** `process.platform` is shown as Windows/macOS/Linux. Displays actual Node version and current project dependency checks. Searches common PATH locations for a `cloudflared` executable *without running it*.
- **Folder permissions:** shows the actual count from the local policy service and provides a link to File Access. Nothing is auto-approved.
- **Web MCP first:** New Web MCP is preselected for fresh users; Existing Tunnel is advanced. Older stored Local mode is accepted for compatibility but directs users back to Web MCP. Cloudflare credentials and routes are never modified by this wizard.
- **Existing-domain setup preview:** users enter their domain (must already be an active Cloudflare zone), a safe MCP subdomain, and the email allowed into Access. The UI calls `POST /api/local/cloudflare/preview` to validate input and display an endpoint, an API permission checklist, and the future provisioning steps. No credential is requested, and no cloud resource is changed or validated by this preview.
- **Remote setup handoff:** opens the existing Cloudflare configuration wizard for Claude Web or ChatGPT Web. AI Connections displays Web connectors first; desktop guides are tucked away in optional Advanced/legacy.
- **Verification:** obtains localhost status from `/api/local/status`, where HTTP 401 demonstrates the local MCP listener rejects anonymous requests, **not** that OAuth or clients are connected.
- **Persistence:** `onboarding.json` in the user-local state directory; stores **only** version, step, mode, and dismissed. No API key, tunnel credential, token, browser history, or local file contents.
- **Resume:** Settings → Setup & Connections → Open Setup Assistant. Overview also has Setup Assistant.
- **Cross-platform frontend:** Next.js + Tailwind utility classes; no OS-dependent frontend implementation.
- **Tests:** storage persistence, defaults, schema strictness, rejection of injected extra fields, symlinks, malformed and oversized state files.

`onboarding.json` is written atomically into the same local state directory as `policy.json`; on POSIX it uses private permissions. API mutation requires the same localhost Host/Origin/custom-header checks as the policy API.

## Explicitly NOT automatic yet

- Installing Node, cloudflared, or desktop services.
- Creating Cloudflare accounts, tunnels, DNS records, app policies or OAuth clients. The new plan preview is read-only and must not be presented as provisioning.
- Starting/stopping cloudflared or OS startup. The dashboard has an **alpha in-process** Start/Stop controller for MCP HTTP only; it is not persistent OS service supervision.
- Proving Cloudflare OAuth login or ChatGPT/Claude Web connectivity.
- Packaging .exe/.dmg installers and shipping an embedded Node runtime.

Therefore, completing the wizard is *not* a validated connection status. Save & Close means the user can resume later; it does not mean MCP is online.

## Code layout

```text
src/
├── app/api/local/onboarding/route.ts
├── app/api/local/cloudflare/preview/route.ts
├── server/cloudflare/provisioning-plan.ts
├── server/onboarding/index.ts
├── features/onboarding/first-run-wizard.tsx
├── components/dashboard.tsx
├── context/dashboard-context.tsx
├── features/overview/overview-page.tsx
└── features/settings/settings-page.tsx
tests/foundation/onboarding.test.ts
```

## QA on host system

```bash
cd ~/Projects/local-mcp-manager
npm run audit:all
npm run dev
```

Open `http://127.0.0.1:3100` and confirm the wizard auto-opens for an installation with no `onboarding.json`. Test step navigation, Cloudflare mode selection, save/close, and reopening from Settings. To inspect the on-disk status without deleting or changing data:

```bash
curl -i http://127.0.0.1:3100/api/local/onboarding
```

The response contains `onboarding`, `system`, and `fileAccess`. If onboarding is already dismissed on the same computer, reopening it from Settings is the intended behavior. Tests use temporary isolated directories and do not touch the user's existing policy.

## Next phases

1. Web-first onboarding now emphasizes new remote connectors and records Cloudflare identifier config through the dashboard. See `docs/NEW-USER-SETUP-ROADMAP.md`. User still must authorize/configure Access and Tunnel outside the app.
2. Implement new-user Cloudflare provisioning, dependency setup and Access Managed OAuth under explicit consent with scoped official API authorization.
3. Verify actual OAuth + list_roots/read_file through Claude Web and supported ChatGPT custom MCP on a fresh installation, not the developer's old tunnel.
4. Installer bundling runtime for Windows and macOS so end users no longer need Git/npm.
5. Implement persistent OS-native process management (Windows/macOS first, Linux supported) and packaged installers; keep the dashboard bound to localhost.
