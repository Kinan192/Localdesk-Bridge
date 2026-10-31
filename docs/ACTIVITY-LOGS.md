# Activity Logs — Phase 3A (Local MCP, Read-only)

**Status:** Source implementation complete; pending fresh `npm run audit:all` on Arch.
**Project:** `~/Projects/local-mcp-manager`. Active MCP V4 project is untouched.

## What changed

- `src/server/audit/index.ts`: bounded append/read of structured JSONL audit events in the per-user local state directory (`audit.jsonl`).
- `src/server/mcp/stdio.ts`: records outcome of each of the five registered MCP read tool calls after executing the authorization/file operation.
- `src/app/api/local/activity/route.ts`: local-only GET endpoint serving recent sanitized events.
- `src/context/dashboard-context.tsx`: fetches real activity instead of browser sample fixtures.
- `src/features/activity/activity-page.tsx`: real counts, search/filter, refresh, and CSV download of actual events.
- `src/features/overview/overview-page.tsx`: real recent activity table. Chart remains clearly labeled sample data.
- `tests/foundation/audit.test.ts`: events storage tests, permissions, filters, symlink protection.
- `tests/mcp/stdio-smoke.test.ts`: checks MCP calls create allowed/denied events.
- `docs/ARCHITECTURE.md`: follow roadmap for supervisor and Claude setup.

## Privacy and limits

- Stores only: event ID, timestamp, tool/action name, root ID (if valid), allowed/denied/error, generic local client ID.
- **Never stores** file content, full paths, filenames, prompts, tokens or credentials.
- Audit file at `~/.config/local-mcp-manager/audit.jsonl` (Arch); alternate with `LOCAL_MCP_STATE_DIR`.
- The file is created with private permissions on POSIX and refuses symlinks/hard links.
- Bounded 1 MiB log. Once full, audit writes are refused and the MCP tool itself remains usable; log rotation/failure visibility are pending tasks.
- A new MCP stdio instance is launched by an AI client; no managed process means dashboard cannot display live connected-client count yet.
- Local Next.js dashboard still lacks owner-level authentication; **never expose port 3100 to the internet**.
- Tests use temporary state directories and do not access the old MCP project.

## Test

```bash
cd ~/Projects/local-mcp-manager
npm run audit:all
```

Expected on this new version: Foundation suite includes two new audit tests. MCP stdio smoke still consists of one test but checks audit file effects.

To see activity in UI:
1. Start `npm run dev` from the project root.
2. Open `http://127.0.0.1:3100`.
3. Review the Activity Logs page (initially empty on a fresh installation).
4. Connect an MCP desktop client to `mcp:stdio` or use the stdio smoke test.
5. Click **Refresh logs**. Note: smoke tests use their own isolated temp state, so will **not** appear in your personal dashboard logs.

## Next milestones

1. Verify audit/tests/typecheck/build and browser QA.
2. Add a reliable connection setup flow for local Claude Desktop and Claude Code, with user-specific command configuration.
3. Add status/health monitoring of a managed MCP process (without fake running state).
4. Secure local owner session & CSRF before enabling high-risk operations or any tunneling.
5. Safe file edits, no-overwrite rename, and explicit human-approved deletion — future phases.
