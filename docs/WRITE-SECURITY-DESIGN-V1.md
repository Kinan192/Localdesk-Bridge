# Read & Write — Minimal Safety Requirements

**User request:** Add a working **Read Only / Read & Write** permission choice per approved folder in the existing LocalDesk Bridge UI, and let ChatGPT/Claude perform only permitted file operations.

**Status:** M3.1 already deployed in Git; Read & Write remains unavailable until a safe implementation passes testing. This document is an internal checklist, **not** an extra feature, wizard, or research track.

## Non-negotiable safeguards for the requested feature

- Default permission is **Read Only**. Only a locally authenticated owner can explicitly grant Write to a selected, existing folder; never silently upgrade an existing folder.
- Local dashboard stays bound to loopback; keep owner session, Origin/CSRF guards, and the existing Cloudflare Access JWT checks for remote MCP.
- Reject operations outside the chosen folder, absolute and traversing paths, symlinks and hardlinks; safely handle parent-directory replacement between checks and filesystem writes. Leaf-only `O_NOFOLLOW` is **not enough**.
- No shell/command execution. Operations are limited to create directory, create bounded text file, version-checked edit, no-overwrite rename, and owner-confirmed nonrecursive delete.
- Revoke/disable must prevent new operations; keep minimal audit records without contents, credentials or private tokens.
- Do not expose remote mutation tools until the verified filesystem and permissions are connected end-to-end. Unsupported OS platforms remain Read Only.
- Test actual allowed and denied calls through MCP, including concurrent changes, owner approval, and regression of existing Read tools. Use disposable folders.

**Implementation direction:** Reuse current `FileEngine`, policy API, Setup Center, owner pairing, Cloudflare configuration, and audit facilities where possible. Add only the smallest maintainable OS-safe filesystem boundary required to prevent out-of-root Write. **No separate Linux experiment package, new security dashboard, speculative per-client signing service, or extra setup flow.**

For the user-facing acceptance flow and remaining work, see `docs/M3-SECURE-WRITE-PLAN.md`.

