# Remote Write Security — V1 Design Gate

**Status:** DESIGN ONLY / disabled in all production remote MCP routes.
**Date:** 2026-10-31
**Decision:** A selectable Read & Write dropdown is not an authorization mechanism. Do not make it available until the entire gate below is complete.

## Existing enforcement (preserve)

- Policy starts with zero roots and all five mutation tools disabled.
- Local policy POST approves only `access: "read"`; PATCH accepts only enabled/read-only tool flags.
- Remote HTTP and stdio expose five read tools only.
- Owner authority requires localhost, Host/Origin/CSRF checks and one-use browser pairing.
- Cloudflare Access and origin JWT validation remain mandatory.
- Never expose admin dashboard port 3100 via public Tunnel.

## Blocking risk

The current `FileEngine.resolve()` validates paths before ordinary pathname-based filesystem operations. An adversarial local process can replace a checked parent directory with a symbolic link between check and syscall. `O_NOFOLLOW` on the **leaf** cannot stop this parent-symlink swap. Therefore implementing remote write by simply registering existing `FileEngine.writeFile()` or changing `access` to `write` is unsafe.

## Required isolation model (decision pending platform validation)

1. Choose a platform-appropriate, tested containment mechanism for mutation operations. Linux: descriptor-relative secure filesystem operations via vetted native bindings (openat2/RESOLVE_BENEATH/NO_SYMLINKS) **or** OS-enforced sandbox per approved root. Windows: secure HANDLE-relative operations and reparse point checks / process isolation with ACLs. macOS: secure directory-handle traversal or sandbox containment. Do not claim portable `path.resolve()` plus `lstat()` is equivalent.
2. Bind every operation to the approved root **identity** as well as root path. Reject root replacement, overlap, hidden/system paths, mounts/reparse points, symlinks, hardlinks and outside-root destinations.
3. Enforce allowlist per tool, per root, and per client. A write-grant never upgrades a root silently. Explicit consent requires showing exact folder and operation scope.
4. Create: no overwrite, file extension and size bound, `O_EXCL`/equivalent under the contained parent descriptor. Write and fsync before reporting success; cleanup must not follow a swapped path.
5. Edit: compare expected SHA-256 / version, stage a private temp file in same contained directory, atomic replace with concurrency control. Avoid lost updates.
6. Rename: same-root, no-overwrite atomic rename with contained source and destination directory handles; cross-root rename rejected.
7. Delete: disabled by default; explicit local human confirmation bound to a specific path, operation and expiry. No recursive deletion in V1.
8. Audit: append minimal records (request identity, tool, root ID, result, time). Never log credentials or file contents. Audit failures should follow a documented fail-closed policy for mutations.
9. Runtime: mutation tools are registered in remote MCP only after verification of the hardened engine, per-folder grant and tool grant. Policy must be reloaded on every request; revocations take effect before the next operation.
10. Testing: path traversal, stale symlink, concurrent parent swap, hardlink, race under rename/delete, malformed Unicode, invalid UTF-8, Windows reparse, absolute/UNC paths, policy overlap, revocation, concurrent writers, unexpected crash during atomic replace, audit failure.

## Acceptance and rollout

- Gate A: independent security review of containment design on Linux/Windows/macOS.
- Gate B: isolated runtime and adversarial tests on every supported platform.
- Gate C: UI confirmation and server-side permission contract tests.
- Gate D: manual review of generated audit logs; verify revoked root cannot be used.
- Gate E: staged opt-in release, with Write default OFF; never migrate old read-only roots to Write.

Until all gates pass, keep all remote mutations unregistered and **do not offer an enabled Write dropdown**. This document authorizes no permission escalation.

**M3.1 progress (2026-11-01):** A read-only diagnostic `writeReleaseStatus()` was added to the owner-protected policy API and Setup Center, with fixed blockers and no permission grant or remote tool registration. Owner-provided focused tests (4/4), foundation tests (197/197), MCP smoke (3/3), static audit (155 files), typechecks and production build all PASS. Manual UI status review is still pending. This does **not** resolve parent-directory TOCTOU or authorize remote mutations. See `docs/M3-SECURE-WRITE-PLAN.md`.
