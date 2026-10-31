# Phase 3A — Local MCP HTTP Service Manager

**Date:** 2026-10-28  
**Status:** Source implementation complete, **host audit and live browser/runtime tests still required**.

## Purpose

Use AI Connections → Remote MCP Service to start or stop only this installation's MCP HTTP server without typing npm commands repeatedly. Windows and macOS are primary product targets; Linux remains supported. This is a temporary, in-process manager, NOT a shipped Windows Service, macOS launchd agent, or Linux systemd unit.

## Implemented behavior

- `GET /api/local/service` reports managed status, PID, last error, whether the saved Cloudflare configuration passes validation.
- `POST /api/local/service` accepts one of two literal actions: `{"action":"start"}` or `{"action":"stop"}`. Mutations require localhost Host, matching Origin, JSON and the dashboard CSRF header; no custom command, executable path or shell arguments are accepted.
- `Start` validates the saved Cloudflare Access team domain, audience tag and MCP public hostname (or explicit environment overrides) before launching.
- The manager verifies that `package.json` is the expected project and its Node executable, tsx CLI and MCP HTTP entrypoint are regular files. It runs only the fixed local entrypoint through Node `spawn` with `shell:false` and a restricted child environment.
- Startup refuses a port already used by another service. It waits for the localhost MCP endpoint to return **401 Unauthorized**, which only confirms it is rejecting anonymous requests; it does **not** verify Cloudflare OAuth.
- `Stop` controls only the child process created by the current dashboard's manager. It never adopts or kills an unrelated PID, an existing Cloudflare Tunnel, an old MCP project or a system service.
- `GET /api/local/status` also reports manager state and reads the configured MCP port from saved settings instead of assuming 8401.
- UI has a status indicator, Start, Stop, Refresh and a shortcut back to the Cloudflare configuration wizard.
- Unit tests cover initial state, fixed launch arguments and filtered subprocess environment.

## Security and limitations

The Next.js dashboard **must stay bound to 127.0.0.1:3100**. Its current local-only Host/Origin/CSRF checks are not a full owner authentication system, so **do not expose this dashboard on a LAN or tunnel**. Device-wide or enterprise installation requires an owner session and OS-level service permissions before full control.

This manager's state exists only in the Node.js process hosting Next.js. It cannot promise persistence across hot reloads, unexpected crashes, multi-worker hosting or OS restarts. In those cases a separately launched MCP server may be reported as unmanaged and the manager will refuse to take it over. A running service will also not start cloudflared; tunnel management remains external.

A startup failure keeps the service stopped or error, with a short local error. It cannot make Cloudflare resources available until the account owner sets up Access and a protected tunnel. Folder access remains read-only and governed by local policy.

The next service phase is an **OS helper/installer with owner authentication**: Windows service/task, macOS launchd agent, Linux user service, each with a stable local control channel. No general-purpose remote terminal API.

## Files

- `src/server/service/index.ts`: bounded process launcher and ephemeral supervisor.
- `src/app/api/local/service/route.ts`: guarded GET/POST endpoint.
- `src/features/connections/remote-service-panel.tsx`: UI panel on AI Connections.
- `src/app/api/local/status/route.ts`: configuration-aware local port probe and supervisor status.
- `tests/foundation/service-manager.test.ts`: fixed-launch, initial-state and environment tests.

## Local QA

```bash
cd ~/Projects/local-mcp-manager
npm run audit:all
npm run dev
```

Open `http://127.0.0.1:3100` → AI Connections.

- With no Cloudflare setup saved, Start must be disabled.
- Fill a *safe test configuration* using AI Connections → Configure tunnel → Save locally. This only validates the shape; it does not create Cloudflare Access.
- Start the MCP HTTP process. It should reach the `running` state only when a protected localhost 401 response is received, not when OAuth works.
- Stop. It must close only that managed child.
- If the port is already bound by a manual process, Start must reject it rather than killing that process.
- Check `GET /api/local/status` and `GET /api/local/service` from localhost.
- Keep the Cloudflare tunnel pointing ONLY to the MCP listener at 127.0.0.1:8401 (or the configured port), not the dashboard.

For live authenticated testing, complete Access Managed OAuth and call `initialize`, `tools/list`, and `list_roots` from Claude Web or ChatGPT Web (subject to account availability). An HTTP 401 is necessary for fail-closed behavior, not sufficient proof of a working connector.
