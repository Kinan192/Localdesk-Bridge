# Local MCP Manager

> **Release refactor in progress — not ready for public release (31 October 2026).**
>
> This repository is a self-hosted, local-first dashboard for sharing **explicitly approved folders** with ChatGPT Web and Claude Web through a protected MCP endpoint. It is **not** a cloud-hosted SaaS and it does not run remote shell commands.

## Current capabilities

- Next.js 16 + React + TypeScript + Tailwind CSS v4 dashboard at `http://127.0.0.1:3100`.
- **LocalDesk CLI foundation:** global `localdesk` command can be linked from an existing checkout using `npm link`, then invoked from any directory. It delegates to the same secure launcher as `npm start`, without a separate server. CLI menu and public npm package are later milestones.
- Single-command **source-install startup** (`npm start`) with a one-use, short-lived local owner pairing link. The launcher authenticates the dashboard child process before creating a ticket.
- Unified Setup Center at `/setup-center` with system requirements, folder approval, Cloudflare credentials, Access/Tunnel setup, MCP settings, OAuth callbacks, services, and independent client-verification guidance.
- Approved-folder MCP tools: `list_roots`, `list_files`, `read_file`, `search_files`, `file_info`.
- Dedicated local MCP HTTP origin on `127.0.0.1:8401`. Cloudflare Access Managed OAuth and origin JWT verification are required for remote access.
- Sensitive Cloudflare API credentials are handled server-side using the native OS keychain. The dashboard and remote MCP are separate listeners.
- After successful owner pairing, production `npm start` attempts to start the already-configured protected MCP listener and dedicated Tunnel in that order. `npm run start:manual` disables this convenience. No cloud resources are provisioned, and service failure does not bypass security.
- Start/Stop controls manage only processes started by this dashboard, not pre-existing cloudflared or system services.

**Not implemented or not verified for release:** remote file Write, clean-install browser E2E, full TSX UI cleanup, signed native installers, Windows/macOS production QA. A healthy Tunnel or a 401 from the remote MCP listener is **not** proof that ChatGPT or Claude can call tools.

## Install and start (source install)

Requirements: supported Node.js and npm, Internet access for setup, and `cloudflared` for remote Cloudflare Tunnel mode. For remote setup, use an active Cloudflare domain and appropriately scoped Cloudflare User API Token. Do not expose the dashboard port to the public Internet.

Inside an existing clone of this repository:

```bash
npm ci
npm run build
npm start
```

The launcher starts the dashboard on `127.0.0.1:3100`, proves it owns that listener, creates a one-use owner ticket, and attempts to open your local browser automatically. If no browser opens, use the **private** localhost link printed to the terminal within two minutes. Do not share or paste that link. Once the one-use owner pairing succeeds, the launcher attempts to start the configured MCP listener (port 8401) and its Cloudflare Tunnel. It does not auto-provision an unconfigured deployment. If a Tunnel is already being run independently, use `npm run start:manual` to avoid a second connector. `Ctrl+C` stops the dashboard and any child services it manages.

### Test the global `localdesk` command (development linking only)

From the existing checkout, after `npm ci` and `npm run build`:

```bash
chmod +x bin/localdesk.mjs
mkdir -p "$HOME/.local"
npm_config_prefix="$HOME/.local" npm link
export PATH="$HOME/.local/bin:$PATH"
cd ~
localdesk --help
localdesk --version
localdesk
```

`localdesk` works from other directories because its executable resolves the installed project path instead of the caller's current directory. `localdesk --manual-services` disables automatic MCP/Tunnel startup. `Ctrl+C` should stop only LocalDesk-owned processes; verify independently running Cloudflared connectors remain unaffected. A second launch while port 3100 is occupied is rejected, not adopted or force-killed. To undo the development link, run `npm_config_prefix="$HOME/.local" npm unlink -g local-mcp-manager`. On Arch Linux, default global prefix often points to `/usr/lib/node_modules` and `npm link` fails with `EACCES`; do not use `sudo` or change system directory permissions. The per-command `npm_config_prefix` avoids a persistent global npm configuration change. Add `$HOME/.local/bin` to your shell's PATH persistently only after verifying the command works.

**This is not a released one-command npm installation.** The package remains private, and native keychain dependencies, production assets and published runtime dependency packaging must be finalized in M6. Do not run `npm install -g localdesk` yet; it would not install this unreleased package.

Open `http://127.0.0.1:3100/setup-center`. Follow the steps and verify `list_roots` and file reading independently in ChatGPT and Claude. Do not claim connection based only on saved settings.

**Developer commands:** `npm run dashboard:dev` uses the launcher with Next dev mode. Plain `npm run dev` intentionally bypasses the secure launcher for debugging only; `npm run owner:pair` is also developer-only. The expected end-user source-install command is `npm start`.

## Security boundaries

- Owner-only local dashboard actions require signed browser session and same-origin Host/Origin/CSRF checks.
- Pairing tickets are one use, expire quickly and are delivered in a URL fragment; owner browser sessions expire.
- The launcher checks the HTTP listener's identity using a per-start HMAC challenge before creating the ticket.
- Remote MCP is loopback-only behind Cloudflare Tunnel, Cloudflare Access and JWT verification. **Never point Tunnel ingress to dashboard port 3100.**
- Default folder permissions are empty and read-only. Write tools are **not registered** in remote MCP; client requests cannot enable them through the policy API.
- `FileEngine` path validation is not sufficient to eliminate parent-symlink TOCTOU for mutations; remote Write is deliberately blocked pending secure, OS-aware containment, adversarial tests and explicit local approvals.
- No cloud credentials, Tunnel connector token or owner ticket should ever be committed to Git.

## Verification before publishing

On the target machine run:

```bash
npm run release:check
git status --short
```

This includes the project audit, typechecks, tests, production build, production dependency audit and additional release-security checks. **Passing it is necessary, not sufficient**: real browser onboarding, client OAuth/tool calls, filesystem attack cases and Windows/macOS host QA still require manual verification.

## Key documentation

- [User Guide](docs/USER-GUIDE-V1.md) — installation, Setup Center, Cloudflare, OAuth and troubleshooting.
- [Release PRD](docs/PRD-V1-RELEASE-REFACTOR.md) — acceptance criteria, roadmap and blockers.
- [Security Review](docs/SECURITY-REVIEW-2026-10-31.md) — initial risks and release criteria.
- [Write Security Design](docs/WRITE-SECURITY-DESIGN-V1.md) — required isolation and fail-closed behavior before enabling mutations.
- [Implementation Log](docs/IMPLEMENTATION-LOG-2026-10-31.md) — exact progress and remaining host tests.
- [M1 Startup Acceptance](docs/M1-STARTUP-ACCEPTANCE.md) — focused owner-auth security tests and host checklist.
- [Baseline Audit](docs/BASELINE-AUDIT-V1.md) — feature inventory, technical debt and requirements traceability.
- [Next.js Component Architecture](docs/NEXTJS-COMPONENT-ARCHITECTURE.md) — mandatory TSX migration and feature-based component structure for M4.
- [Architecture](docs/ARCHITECTURE.md) — backend/frontend boundaries.

## Structure

```text
src/
  app/                 Next.js dashboard and owner-protected local APIs
  components/          Shared UI
  features/            Dashboard and Setup Center features
  server/
    access/            Folder policy enforcement
    files/             Read-only file engine and gated mutation primitives
    owner/             Pairing, sessions, launcher verification
    cloudflare/        Cloudflare configuration and provisioner
    credentials/       OS keychain integration
    service/           Remote MCP process supervisor
    tunnel/            Dedicated Tunnel process supervisor
    mcp/               MCP HTTP and stdio endpoints
scripts/               Launcher, audits and local tools
tests/                 Foundation and MCP smoke tests
docs/                  Active and historical engineering documentation
```

Legacy directories `apps/`, `packages/` and `reference-v4/` have **not** been deleted. They must first be checked against active imports, test/build outputs and Git history. Avoid running the dashboard from the old `apps/dashboard` tree.

**Status:** Source changes are saved, but this refactor has not passed its full release gate. Do not label this a stable v1.0 release until the checklist is complete.




