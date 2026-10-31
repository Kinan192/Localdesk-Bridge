# Local MCP Manager — Frontend Implementation Roadmap

**Status (28 Oktober 2026):** Phase 1 source code authored; local npm install/build/browser QA pending.
**Tool restriction:** Work on this project via **Arch Local MCP V2 only**. No Remote Desktop Commander unless explicitly requested.
**Never modify:** `~/Projects/local-file-mcp/` (active stable MCP).

## Phases

| Phase | Workstream | Status |
|---|---|---|
| 00 | Independent project directory + source-code reference snapshot | DONE |
| 01A | Next.js App Router + React + TypeScript + Tailwind scaffold | CODE WRITTEN |
| 01B | Responsive dashboard shell, sidebar, navigation, styling | CODE WRITTEN |
| 01C | Overview, File Access, MCP Tools, AI Connections, Activity Logs, Settings | CODE WRITTEN |
| 01D | Browser interactions, onboarding, mock state persistence | CODE WRITTEN |
| 01F | Component-based refactor (UI, layout, features, context, CSS) | CODE WRITTEN |
| 01E | npm install, typecheck, production build, browser QA after refactor | NOT RUN |
| 02A | Backend foundation: shared schema, policy, file engine, local repository | CODE WRITTEN |
| 02B | Foundation typecheck + unit tests | NOT RUN |
| 02C | Local MCP Agent stdio transport (5 read-only tools) | CODE WRITTEN, NOT TESTED |
| 02D | Safe write/edit/rename/delete, approval, and backend/UI connection | PLANNED |
| 03 | Connect dashboard to actual agent APIs | PLANNED |
| 04 | ChatGPT/Claude connectors and secure remote access | PLANNED |
| 05 | Installer, Github Releases, user beta | PLANNED |

## Refactor (component-based)

Frontend dipecah dari satu file besar menjadi layout, shared UI components, 6 feature page components, context provider, config navigasi, utilities, dan CSS terpisah. Lihat `FRONTEND-ARCHITECTURE.md` untuk struktur dan alur. Source awal disimpan di `docs/dashboard-original-20261028.md`; project MCP lama tetap aman.

## Frontend scope included

1. **Overview:** Hero, four metric cards, sample activity chart, quick actions, latest sample requests, demo agent state.
2. **File Access:** Add demo root, enable/disable root, read-only/write dropdown, remove entry, permission overview.
3. **MCP Tools:** List ten capabilities, search/filter, toggle demo state, restore read-only defaults.
4. **AI Connections:** Separate setup guides for ChatGPT Web, Claude Desktop, Claude Code, Claude Web.
5. **Activity Logs:** Sample list, search, result filter, CSV export, counts.
6. **Settings:** Demo preferences, compact display, sample analytics toggle, demo reset, copy dashboard URL.
7. **Onboarding:** Three-step guided tour.
8. **Responsive:** Desktop, narrow desktop, tablet, mobile.
9. **Storage:** LocalStorage only for demonstration. No real filesystem/credentials.

## Frontend acceptance checks

- [ ] Run `npm install` without errors
- [ ] Run `npm run typecheck` without errors
- [ ] Run `npm run build` without errors
- [ ] Run `npm run dev` and open `http://127.0.0.1:3100`
- [ ] Test all 6 navigation sections desktop + mobile
- [ ] Test Start/Stop demo with clearly marked simulation state
- [ ] Add root, change permissions, delete demo entry, reload browser (state persisted)
- [ ] Search/filter MCP tools, toggle, restore defaults, reload browser
- [ ] Open each client guide
- [ ] Filter/export sample logs CSV
- [ ] Settings analytics and compact toggles visibly change UI
- [ ] Check responsive mobile layout and accessibility keyboard focus
- [ ] Confirm no MCP operations / file system changes occur
- [ ] Confirm existing MCP :3030 and :8000/:8001 were not modified

## Running the UI

```bash
cd ~/Projects/local-mcp-manager
npm install
npm run typecheck
npm run dev
```

Open `http://127.0.0.1:3100` in the browser. To stop, Ctrl+C in that terminal.

## Backend foundation

Source dasar backend tersedia di `packages/shared`, `packages/access-policy`, `packages/file-engine`, dan `packages/local-storage`. Tes tertulis di `tests/foundation`. Ini masih memerlukan `npm install`, `npm run typecheck:foundation`, serta `npm run test:foundation` sebelum dianggap lulus. Rinciannya di `docs/BACKEND-FOUNDATION.md`.

## Security note

Do not mistake the frontend demo toggles for actual permissions: none are enforced until Local Agent Phase 2/3. Never expose the dashboard to the internet. New remote connectivity must provide authentication and keep the dashboard bound to localhost.

## Coding conventions

- Functional React components.
- Next.js App Router for page composition.
- One typed demo data module (`src/lib/demo.ts`).
- No browser-side filesystem access from preview.
- Persist only non-secret demo preferences.
- Separate human-visible demo status from real agent health.
