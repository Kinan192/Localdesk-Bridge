# M1 Acceptance — One-Command Startup & Owner Security

**Stage:** M1 only. **Status: ACCEPTED on Arch Linux (2026-10-31).** Global `localdesk` CLI was installed by user-owned npm prefix, help/version and startup verified, owner pairing and protected MCP/Tunnel auto-start worked, Cloudflare Tunnel became Healthy after a short delay. After Ctrl+C, ports 3100 and 8401 were free and only the independently managed Arch MCP V2 `cloudflared` (previously PID 1735) remained. Final `npm run test:startup`: **32/32 PASS, 0 failures**; user reports typecheck and production build successful (their logs not included in last paste). This is not acceptance of Windows/macOS, public npm packaging, client OAuth end-to-end, or remote Write.
**Date:** 2026-10-31.
**Scope boundaries:** no Cloudflare mutations, no new folder write grants, no refactor of unrelated UI, no Git commit/push.

## Source implementation to verify

- package.json: npm start launches scripts/launch-dashboard.ts; npm run dashboard:dev is developer mode; npm run test:startup runs focused security tests.
- scripts/launch-dashboard.ts: verify localhost port availability, spawn Next only on 127.0.0.1:3100, demand HMAC proof from the child before ticket generation, open local browser using URL-fragment ticket, and signal the managed child on termination.
- src/server/owner/dashboard-launch.ts: high-entropy URL fragment, per-launch readiness HMAC, exact trusted origin and shell-free browser command.
- src/server/owner/index.ts: hashed single-use ticket, 2-minute expiry, owner session HMAC, 8-hour expiry, private local state.
- src/app/api/local/owner/route.ts: localhost-only status; proof only when launcher-specific secret and challenge are valid.
- src/app/api/local/owner/pair/route.ts: same-origin JSON POST with CSRF header, session cookie HttpOnly+SameSite=Strict.
- tests/foundation/owner-http-integration.test.ts: route-level negative/positive integration tests with disposable state.

## Findings fixed during M1 focused review

- **M1-SEC-01 — duplicate owner cookies:** `GET /api/local/owner` previously trusted framework `request.cookies.get()`, while privileged APIs use a duplicate-rejecting cookie parser. It now uses the shared `ownerSessionCookie()` helper to fail closed consistently. The route integration test verifies that two owner cookies do not produce `paired: true`.
- **M1-OPS-01 — child exit outcome:** Unexpected signal termination of Next's child previously became exit status 0 (`childExitCode || 0`). The launcher now maps unexpected signal termination to a failure and reports the signal. Graceful user-initiated shutdown remains an intentional exit.
- **M1-OPS-02 — hung child:** If a managed Next child does not terminate after SIGINT/SIGTERM, the launcher escalates to SIGKILL after six seconds, targeting only its own child. This is *not* proof that all descendants exit; confirm port release on the host.
- Source-only consistency checks confirmed the shared cookie parser, HMAC proof-before-ticket flow, loopback bind, test registration and targeted child termination appear in the checked files. **No runtime pass is claimed.**

## Observed manual results — user report (2026-10-31)

- **PASS (reported):** `npm start` launches a dashboard and automatically establishes the owner pairing session without separately running `owner:pair`.
- **PASS (reported):** pressing `Ctrl+C` immediately stops the dashboard server.
- **NOT YET CONFIRMED:** a second clean browser is unauthenticated; ticket replay/expiry is rejected; port 3100 becomes free after shutdown; other tunnel/MCP processes survive; occupied-port startup fails closed.
- **PASS (user terminal transcript, 2026-10-31):** `npm run test:startup`: 18 tests, 18 passed, zero failed/skipped.
- **PASS (user terminal transcript):** `npm run typecheck`: `tsc --noEmit` returned without errors.
- **PASS (user terminal transcript):** `npm run build`: Next.js 16.4.3 compiled, generated routes and completed optimization successfully.
- **PASS (user manual check, 2026-10-31):** an unrelated browser session reports `{ "paired": false, "mode": "local-owner-pairing", "provisioningEnabled": false }`.
- **PASS (user manual check, 2026-10-31):** running a second `npm start` while port 3100 was occupied exited with `Port 3100 is already in use. Stop the previous dashboard before launching a new session.` No second owner session was issued by that launcher.
- **OBSERVED (user report):** `Ctrl+C` on dashboard stops the dashboard and the Tunnel becomes down. Source inspection confirms **dashboard-managed Tunnel** is expected to stop on Next.js exit (process `exit` shutdown handler in `src/server/tunnel/connector-supervisor.ts`), and dashboard-managed MCP has the same lifecycle. This is expected *only if* the Tunnel was launched by the dashboard. Independently started `cloudflared` must not be killed by this process.
- **NOT YET CONFIRMED:** whether the observed Tunnel was dashboard-managed or independently launched, explicit post-shutdown port release, and independent MCP/Tunnel survival in a separately managed process scenario. Browser negative cases are covered in part by automated tests.

These are user-observed outcomes, not tool-executed host test results. Do not mark M1 accepted based on successful pairing and Ctrl+C alone.

## Auto-start remote connectivity — additional M1 implementation (unverified)

Production `npm start` now passes an auto-service flag to its verified localhost child. Only **after successfully redeeming the owner pairing ticket** does the server attempt to start the protected MCP HTTP child and then the dedicated Tunnel, skipping those already managed and running. This does not mutate Cloudflare deployments. `npm run start:manual` disables auto-start; developer mode is manual. If saved configuration, Cloudflare API credential/Keychain, or remote connectivity is unavailable, pairing stays valid, the automatic attempt fails closed and manual service controls remain available.

**Risk:** a cloudflared replica started separately is not adopted or detected automatically; when running independent connectors, use manual mode to avoid duplicated connections. Shutdown remains scoped to the dashboard's own children. Do not claim this feature passed on the host until its new tests and real MCP/Tunnel startup have been verified.

## New CLI requirement, accepted into scope (not implemented yet)

The released interface targets a global `localdesk` terminal command (from any working directory) with an interactive status/menu comparable in workflow to the user-provided 9router screenshot. **M1 foundation is implemented** in `bin/localdesk.mjs` with `package.json` bin mapping and dedicated tests; npm-link invocation has not been tested on the user's host yet. `npm start` remains the compatibility fallback. Visual terminal menu polish is scoped to M4 and no-clone npm package/installer QA to M6. It must reuse the same owner session and secure supervisor, never launch a separate unauthenticated server or open the admin port publicly. See FR-16 in PRD.

## M1 CLI foundation implemented — pending host verification

- `bin/localdesk.mjs`: Node.js executable with a shebang; resolves actual package directory from its own module URL, never current working directory; parses only `--help`, `--version`, `--manual-services`, or no argument; rejects unknown options. Checks Next.js production build and local tsx runtime before starting.
- `package.json`: `bin.localdesk` registration. `private: true` intentionally remains until release packaging is complete.
- The CLI starts `scripts/launch-dashboard.ts` through the **same verified launcher**, forwarding Ctrl+C to that launcher with no arbitrary shell command or independent service implementation.
- `tests/foundation/localdesk-cli.test.ts` tests help/version from an unrelated directory, version consistency, invalid options and source safety; included in both `test` and `test:startup`.
- Developer test on Arch Linux: `chmod +x bin/localdesk.mjs`, then `mkdir -p "$HOME/.local"`, `npm_config_prefix="$HOME/.local" npm link`, `export PATH="$HOME/.local/bin:$PATH"`; change to `~` and run `localdesk --help`, `localdesk --version`, `localdesk` and test Ctrl+C. `npm_config_prefix="$HOME/.local" npm unlink -g local-mcp-manager` removes the development link. **Observed blocker:** initial default `npm link` failed with `EACCES` on `/usr/lib/node_modules/local-mcp-manager`; `localdesk: command not found` was a consequence. User-prefix retry needs host verification.
- **NOT DONE:** interactive terminal menu (M4), no-clone npm package and Windows/macOS packaging (M6). No npm publishing or Git commit/push performed. Node.js CLI source and tests need real host run.

## Host validation — automated

Run in an **existing clone** on the authorized computer (do not erase real state):

```bash
cd ~/Projects/local-mcp-manager
npm run test:startup
npm run typecheck
npm run build

# Once the build passes, test in a separate local terminal:
# npm start               # auto-start protected MCP + Tunnel after pairing
# npm run start:manual    # skips auto-start (use instead of npm start, not simultaneously)
```

Record exit codes and complete errors, but **do not paste pairing URLs, secret tokens, full environment variables or cookie values** into the issue log.

- A1: all startup tests pass (including real owner route imports and ordered service auto-start tests).
- A2: TypeScript typecheck and Next.js production build succeed.
- A3: no forbidden dashboard public bind, no unpaired owner APIs and no sensitive secrets in logs.

## Host validation — manual first-run and failure modes

1. Stop any other dashboard **for this application** on port 3100; leave the separate working MCP/Tunnel alone. Use `npm start` (after build). Browser should open a new URL-fragment one-use link. Do not share the link or screenshots containing its fragment.
2. In the browser opened by the launcher, GET `http://127.0.0.1:3100/api/local/owner`. It should show `paired: true` after successful redemption. A fresh unrelated browser profile should show `paired: false`.
3. Refresh the paired browser; owner session remains valid until expiry, but replaying the exact already-used ticket must fail. Do not post ticket or cookie into a support message.
4. Trigger `Ctrl+C` to stop the dashboard. Verify port 3100 becomes free. Any MCP/Tunnel started **from the dashboard** is intentionally terminated with it. Cloudflared/MCP started **independently** in another terminal or by an external service must NOT be terminated by the dashboard.
5. Launch a second dashboard while port 3100 is occupied: it must safely refuse with a clear local error. Never force-kill unrelated processes to make the test pass.
6. Verify expired or invalid ticket does not create owner session; a fresh launch can provision a new one-use ticket. Failed or incorrect Host/Origin/CSRF requests must be rejected.
7. With a valid existing Cloudflare deployment and stored token, restart via `npm start`, redeem owner ticket, then check the dashboard reports protected MCP running and the managed Tunnel running without clicking Start. Re-run with `npm run start:manual` and verify services remain stopped until manually started. If credentials/configuration are absent, ensure pairing still works and services fail closed without new Cloudflare objects.
8. On Windows and macOS when available, repeat launcher/browser opening, user state access control and shutdown in disposable installs; mark OS results separately.

**Optional security test:** a local test HTTP server pretending to own port 3100 must never obtain a trusted owner pairing URL. No automated test should bind an occupied port without explicit local preparation.

## New observation — Cloudflare Healthy after dashboard shutdown

**User report (2026-10-31):** after stopping LocalDesk with Ctrl+C, the dashboard server is down but the Cloudflare Tunnel remains shown as Healthy.

**Interpretation:** Tunnel Healthy indicates a live Cloudflare edge connection, **not** a successful origin MCP request; it can reflect a second connector replica on this or another host. This does not, on its own, prove the dashboard-owned child leaked. On Linux, verify local process identity and listeners **after dashboard shutdown**:

```bash
ps -C cloudflared -o pid,ppid,stat,comm
ss -ltnp '( sport = :3100 or sport = :8401 )'
curl -sS -o /dev/null -w 'MCP origin HTTP: %{http_code}\n' http://127.0.0.1:8401/mcp
```

Expected when all dashboard-managed processes exited and no independent services run: no matching cloudflared process, neither 3100 nor 8401 listening, curl shows connection error/000. If cloudflared is still listed, identify its process ownership/start method before killing anything; avoid `pkill cloudflared` because it could disconnect an independent service. If cloudflared is not local but Cloudflare remains Healthy, inspect Cloudflare Tunnel connector replicas on other machines. A 401 from the local origin confirms a protected listener, not an authenticated AI client.

**Host evidence received (2026-10-31):**
- Dashboard port **3100**: not listening.
- Remote MCP port **8401**: still listening on Node PID **27418**; unauthenticated origin returned HTTP **401**.
- Cloudflared processes: PID **1735** with PPID **1**, and PID **27444** with PPID **721**. Parent/process-group provenance is not yet known; do not assume either is dashboard-managed, and do not kill them without verification.

**M1 follow-up implementation (not host-tested):** `scripts/launch-dashboard.ts` now creates an isolated POSIX process group for the Next process and its subsequently spawned MCP/Tunnel children. Ctrl+C signals that **owned group only**; it also checks for surviving descendants after the primary dashboard process exits and escalates within a bounded shutdown. Unrelated pre-existing systemd/manual connectors are not intentionally stopped. Windows still requires separate process-tree QA. Source-regression assertions and group-ID unit tests were added.

**Next provenance check (no kill):**

```bash
ps -o pid,ppid,pgid,sid,etimes,cmd -p 1735,27444,27418,721
pstree -asp 27418
pstree -asp 27444
```

Redact any sensitive CLI flags if present. Check PGID/SID and ancestor names; PPID=1 alone does not prove ownership. If 8401 is still bound by an old server, new automatic MCP startup should **fail closed**, not adopt or kill it. Confirm whether it is a separate systemd/manual service before stopping it.

**Additional host process-tree evidence received (2026-10-31):**
- PID 1735: PPID 1, PGID 1735, SID 1735, `/usr/bin/cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/...`. This is consistent with an independently managed system-level connector; keep it running.
- PID 27418: Node remote MCP listening on port 8401, child of Node PID 27406 which is shown under `systemd --user`.
- PID 27444: `cloudflared tunnel run`, parent PID 721 (`systemd --user`).
- **Both PID 27418 and 27444 have PGID 27185 and SID 19781**. This is evidence of shared process-group/session provenance. It is consistent with an old manually launched/dashboard session whose parent exited, but not proof of exact launcher ownership.
- The new isolated-POSIX-group launcher (unverified at runtime) should assign the managed Next child its own PGID equal to that child PID. The observed PGID 27185 needs comparison against that actual launcher invocation; these processes may have been started before the patch was deployed.

**Next safe checks:** `ps -o pid,ppid,pgid,sid,comm -p 27185,27406` and `cat /proc/27418/cgroup /proc/27444/cgroup`. Confirm whether those PIDs belong to independent user units or are orphaned from LocalDesk before taking any stop action. Do not stop PID 1735 or issue a blanket `pkill cloudflared`. Existing port 8401 will cause a new managed MCP launch to fail closed, so first determine ownership.

**Status:** still NOT accepted. The new process-group behavior needs host build/tests and real shutdown validation. Do not enable remote Write.

## Latest host check — automated PASS, auto-start runtime blocked (2026-10-31)

**Host-confirmed:** `npm run test:startup` 25/25 pass; `npm run typecheck` passed; `npm run build` passed with Next.js 16.4.3; `npm start` binds dashboard to 127.0.0.1:3100 and prints an owner pairing link. After pairing, startup logs: `Automatic MCP/Tunnel startup failed`.

**Likely blocker:** a prior check immediately before this run confirmed `127.0.0.1:8401` bound by PID 27418 (LocalDesk Node process), with `cloudflared tunnel run` PID 27444 and tsx parent PID 27406 still present. This conflicts with the fail-closed port collision check in `RemoteMcpSupervisor.start()`. This remains an **inference**, not yet proven by the new launch's error status. The independent `cloudflared` PID 1735 should not be stopped.

**Next user-host sequence:** stop the current dashboard with Ctrl+C; recheck PIDs and /proc/PID/cwd to guard against PID reuse; terminate only verified stale project PIDs 27406, 27418, 27444 (SIGTERM, no blanket pkill); verify 8401 free and Arch MCP V2 system connector 1735 still alive; rebuild/restart, redeem a new pairing ticket, verify both managed services running; Ctrl+C and verify both 3100 and 8401 closed while independent Tunnel survives. Never publish the owner pairing link or Cloudflare credentials.

**M1 diagnostic improvement:** auto-start log now uses `safeAutoStartFailureHint` to report a known 8401 collision without echoing provider exception messages/credentials; a regression test checks sanitized output. These newer code changes require host tests again.

## Follow-up result — LocalDesk Tunnel lifecycle recovered (user report, 2026-10-31)

After old LocalDesk processes 27406, 27418, and 27444 were terminated selectively, user confirmed ports 3100 and 8401 were free and the independently managed Cloudflared process 1735 remained alive. On a subsequent LocalDesk start, the LocalDesk Tunnel changed from **Down** to **Healthy**. User reports it goes Down when the LocalDesk dashboard/server is stopped and recovers when it is started. This is **positive manual evidence for managed Tunnel startup/shutdown** and removes the prior port-8401 orphan collision as an immediate blocker.

**NOW VERIFIED (user terminal transcript):** after final Ctrl+C, `ss -ltnp '( sport = :3100 or sport = :8401 )'` shows no listeners and `ps -C cloudflared -o pid,ppid,stat,comm` shows only system connector PID 1735 (PPID 1). The user manually checked LocalDesk Tunnel Down on shutdown, Healthy again when LocalDesk was restarted. **Remaining:** verify real authenticated MCP tool invocation in client (M2/M5 acceptance), latest diagnostic regression rerun, and global `localdesk` CLI foundation. A Healthy Cloudflare connector alone does not prove client tool access. No remote Write enabled.

## M1 global CLI host results — user observation (2026-10-31)

- Initial `npm link` failed with EACCES for system-owned `/usr/lib/node_modules`; using `npm_config_prefix="$HOME/.local" npm link` succeeded without sudo.
- `command -v localdesk` resolved `/home/kinan/.local/bin/localdesk`; `localdesk --version` reported `0.3.0` and `--help` worked.
- Running `localdesk` launched Next.js on `127.0.0.1:3100`, auto-paired owner and reported protected MCP/Tunnel startup. Port check confirmed both `3100` and `8401` listeners; a second LocalDesk `cloudflared` process was present alongside the independent Arch MCP V2 connector.
- User initially saw Tunnel Down in Cloudflare but confirmed it became **Healthy after a delay**, with no config or code change. Local supervisor `running` only means cloudflared survived local startup grace (~1.2 sec); it is not proof of immediate Cloudflare edge readiness.
- **M1 gate confirmed on Arch Linux:** user supplied post-CLI-shutdown output with neither 3100 nor 8401 listening and only independent system `cloudflared` PID 1735; supplied complete 32/32 startup test results; reported final typecheck/build pass. No Git commit/push.

## Exit criteria

M1 source-install startup and owner security acceptance on Arch Linux requires A1-A3, browser isolation, occupied-port refusal, and clean lifecycle. **These lifecycle/security host checks are now confirmed by user observation and terminal output**: dashboard and Remote MCP listeners both close, LocalDesk connector stops, independent Arch V2 connector PID 1735 remains, restarting LocalDesk brings its Tunnel Healthy. **Overall M1 is accepted for the user's tested Arch Linux source-install environment.** Confirmed global CLI startup and Ctrl+C shutdown, 32/32 startup security tests. Cross-platform, public npm release, end-to-end authenticated clients and release QA remain gated in their planned milestones. Do not claim Windows/macOS or packaged installation is verified.

## Known limitations

- This development connector can edit source but cannot run npm/Node on the user's host or inspect some .tsx files; the code review does not substitute for those tests.
- A trusted launcher is not a sandbox against malware with the same OS user privileges.
- Source install still requires a build before npm start; .exe/.dmg installers are not claimed available.
- A healthy Tunnel or client OAuth status belongs to later milestones; it is not evidence for M1.
