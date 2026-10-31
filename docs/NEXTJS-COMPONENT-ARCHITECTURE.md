# Next.js Component-Based Architecture — Target Standard (M4)

**Status:** target design ONLY. Do not migrate source before current milestone M1 and intervening M2/M3 are accepted.
**Reviewed:** 2026-10-31, using Arch Local MCP V2.
**Framework:** Next.js 16 App Router, React, TypeScript strict, Tailwind CSS v4.
**Goal:** Replace temporary JSX-in-.js pages with a typed, maintainable, feature-based component architecture without changing behavior or local security boundaries.

## Confirmed source inventory

- Already TSX: src/app/page.tsx, src/app/layout.tsx, src/components/dashboard.tsx, src/components/layout/*.tsx, src/components/ui/*.tsx, src/features/file-access/file-access-page.tsx.
- JSX inside JS: src/app/setup-center/page.js (~266 lines), src/app/cloudflare-setup/page.js (~562 lines), src/app/cloudflare-config/page.js, src/app/credential-vault/page.js, src/app/oauth-settings/page.js, src/app/tunnel-control/page.js, src/components/setup-navigation.js.
- Non-JSX JS: src/features/setup-center/steps.js, should become typed steps.ts.
- tsconfig.json currently contains allowJs=true and strict=true. Strict typing of TS/TSX does not automatically make existing JS route components type-safe. Verify any allowJs tightening only after migration; do not disable it early and break imported files.

## Proposed structure (illustrative; only create directories actually used)

\`\`\`text
src/
  app/
    layout.tsx
    page.tsx
    setup-center/page.tsx
    cloudflare-setup/page.tsx       # advanced compatibility route if still needed
    credential-vault/page.tsx        # advanced compatibility route if still needed
    api/local/**/route.ts
  components/
    layout/
      app-shell.tsx
      navigation.tsx
    ui/
      button.tsx
      dialog.tsx
      form-field.tsx
      status-indicator.tsx
      empty-state.tsx
  features/
    setup/
      setup-screen.tsx
      components/
        setup-stepper.tsx
        system-check-step.tsx
        folder-access-step.tsx
        credential-step.tsx
        cloudflare-step.tsx
        mcp-service-step.tsx
        client-verify-step.tsx
      hooks/
        use-setup-status.ts
      services/
        setup-client.ts
      schemas.ts
      types.ts
    file-access/
      file-access-screen.tsx
      components/
      hooks/
      services/
    cloudflare/
      components/
      hooks/
      services/
    connections/
    activity/
    settings/
  cli/
    index.ts                         # localdesk terminal entrypoint, no JSX
    menu.ts                          # TTY keyboard navigation / non-TTY fallback
    lifecycle.ts                     # reuse secure launcher and managed process control
  lib/
    api-client.ts                    # shared typed, same-origin owner-aware client
    errors.ts
  server/
    owner/
    access/
    files/
    cloudflare/
    credentials/
    mcp/
    service/
    tunnel/
    audit/
    contracts/
\`\`\`

**Actual folder names follow existing feature boundaries** when practical. This tree is a maintainability template, not authorization to make empty directories or rewrite unrelated working modules.

## Design decisions

1. Use \`.tsx\` for any React component returning JSX; \`.ts\` for data, hooks, schemas, utility, server logic and typed APIs without JSX. \`.js\` and \`.mjs\` may remain for external tooling/configuration when appropriate.
2. Each App Router page should mainly import and render its feature screen. Prefer server components where possible; use \`"use client"\` only in interactive feature boundaries.
3. Feature components own presentation; feature hooks own client-side state/fetch coordination; shared typed services own request/response parsing; server-only modules enforce permissions and filesystem operations. UI never reads keychain or Cloudflare secrets.
4. Prefer single-purpose modules and typed props, but avoid needless one-component-per-file fragmentation where it hurts navigation. Do not put 500 lines of unrelated form/service logic in page.tsx.
5. Keep reusable elements in src/components/ui and cross-feature navigation/layout in src/components/layout; avoid duplicate implementations of buttons, status indicators, confirmation and navigation.
6. Explicitly verify success/failure/unknown and loading/empty states. No synthetic status in production. Shared API wrappers must not weaken Origin/CSRF/owner checks.
7. M2 consolidates the user flow. M4 refactors implementation details after behavior and API contracts are verified; no silent feature removal. React state ownership and server ownership are separated.
8. Preserve route URLs as needed for backwards compatibility; a unified Setup Center must not force users to jump through those pages.
9. Do not remove or change \`tsconfig.json\` \`allowJs\` until all imported source JSX-in-.js files are migrated and host typecheck/build pass.

## Incremental route migration checklist

1. Record current route behavior, API calls, errors, request payloads, screenshots, and test coverage.
2. Extract a route's existing JSX into a feature-level screen \`*.tsx\` with typed props.
3. Extract shared layout/forms into reusable \`*.tsx\` components and unshared client calls into typed services \`*.ts\`.
4. Move the route entry to \`page.tsx\`; delete old \`page.js\` only when it is safe and the route has no duplicate page entry.
5. Update imports, tests, docs, CSS and access controls. Run typecheck, tests, Next production build, then browser checks before the next route.
6. After all source JS dependencies have been removed, evaluate setting \`allowJs\` to false if tooling permits; keep JS/MJS for configuration and scripts only.
7. Re-run the entire M5 release matrix, including OAuth and local owner auth, before GitHub publishing.

## Non-negotiable acceptance

- No active JSX inside \`src/app/**/*.js\`, \`src/components/**/*.js\`, or \`src/features/**/*.js\`.
- Route entry files are \`page.tsx\` and server route handlers are \`route.ts\` (unless a documented exception is necessary).
- Component props and contracts are typed; use \`unknown\` + validation at network boundaries rather than indiscriminate \`any\`.
- No duplicate, unused or ambiguous entrypoint file.
- No change to the default denied Write policy, Keychain isolation, Cloudflare Access JWT, or localhost-only owner authorization.
- Successful host typecheck/tests/build and browser regression are required; absence of runtime evidence means this acceptance is pending.

## Tooling limitation

Arch Local MCP V2 permits creating/editing JS/TS/MD but currently refuses direct access to TSX. Do not claim that TSX source was reviewed or converted with this connector. A safe future migration requires a host-capable tool or explicit local CLI workflow and subsequent verification, without silently switching to Remote Desktop Commander.
