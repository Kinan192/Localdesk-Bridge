# Backend Foundation v0.2 — Implementation Notes

**Date:** 28 Oktober 2026  
**Scope:** shared contracts, access policy, safe initial file operations, local policy repository, unit tests.  
**Status:** Source written and file presence verified; tests and typecheck must run on the user's Arch Linux machine.  
**Tooling:** All edits via Arch Local MCP V2 only. Stable project `~/Projects/local-file-mcp` was NOT modified.

## What is implemented

| Package | Responsibilities | Status |
|---|---|---|
| `@local-mcp/shared` | Zod schemas, 10 MCP tool names, root IDs, typed request/response DTOs, defaults | Code complete |
| `@local-mcp/access-policy` | Per-tool and per-root authorization; reject disabled roots and overlapping/aliased roots | Code complete |
| `@local-mcp/file-engine` | list_roots, list_files, read_file, search_files, file_info, create_directory, write_file | Initial implementation |
| `@local-mcp/local-storage` | Repository interface, in-memory policy adapter, JSON bootstrap adapter | Initial implementation |
| `tests/foundation` | Contracts, policy isolation, file access, storage | Authored, not executed |

## Intentional limitations

- `edit_file`, `rename_file`, `delete_file` are explicitly **NOT_IMPLEMENTED** and disabled in the default policy.
- No production MCP server has been created in `apps/agent` yet.
- No supervisor, secure local dashboard API, SQLite database, OAuth, Cloudflare tunnel, or installer yet.
- JSON repository is temporary config-only bootstrap storage; SQLite remains the recommended audit/database target.
- Security of write operations is **not production-grade** against a hostile local process racing symlinks/parent directories. Descriptor-relative or process-sandboxed filesystem access and comprehensive Windows testing are required before production/remote write availability.
- No tool accepts AI-supplied `confirm: true` as human authorization.

## How permissions work

1. Every tool name is part of the fixed 10-tool registry.
2. The tool must be enabled in the policy.
3. All file tools (except `list_roots`) require an approved `rootId`.
4. The root must be enabled.
5. Mutating tools additionally require `root.access === 'write'`.
6. All root paths are user-provided absolute paths, validated on the target machine.
7. Ambiguous overlapping roots are rejected, even if disabled, to prevent access through an ancestor root.
8. Paths must be relative to the approved root. Dotfiles, traversal, symlinks, unusual Windows path segments and hard-linked files are blocked by the initial file engine.
9. New files use exclusive create; existing files must not be overwritten.

## Typed contracts for future Next.js BFF

- `CreateRootRequestSchema` and `PatchRootRequestSchema`
- `PatchToolRequestSchema`
- `ActivityQuerySchema`
- `AgentStatusSchema` and `AgentStateSchema`
- `AuditEventSchema`

These schemas do not make an endpoint authenticated: auth, Origin/CSRF protection and request size enforcement belong to Phase 3.

## Initial test commands on Arch Linux

```bash
cd ~/Projects/local-mcp-manager
npm install
npm run typecheck:foundation
npm run test:foundation
```

No production configuration changes should result from these tests. Tests create temporary fixtures under OS tmp directories and remove them afterward.

## Proposed next milestone: Local Agent v0.3

1. Confirm TypeScript compile/tests pass and fix any discovered regressions.
2. Introduce `apps/agent` with MCP TypeScript SDK stdio transport, typed tool handlers and output schema.
3. Add agent integration tests against temporary allowlisted roots.
4. Implement secure versioned edit, no-overwrite rename, and a separately trusted approval workflow for delete.
5. Add a supervisor controlling agent processes (manual start/stop, health checks, graceful cancellation).
6. Replace frontend demo state via authenticated Next.js BFF routes.
7. Only later enable remote HTTPS access or installer packaging.

## Files

- `src/server/contracts/index.ts`
- `src/server/contracts/errors.ts`
- `src/server/access/index.ts`
- `src/server/files/index.ts`
- `src/server/storage/index.ts`
- `tests/foundation/*.test.ts`
- `docs/BACKEND-ARCHITECTURE-DRAFT.md`
