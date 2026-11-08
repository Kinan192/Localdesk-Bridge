# M3 — Folder Read Only / Read & Write

**Scope:** implement the user's original requirement: choose a folder, choose **Read Only** or **Read & Write**, and let ChatGPT/Claude use only the permissions explicitly approved for that folder.

**Status (2026-11-08): LINUX SOURCE IMPLEMENTED; WINDOWS WORKER IN DEVELOPMENT; NATIVE WINDOWS QA AND RELEASE GATE PENDING.** M3.1 was committed as `98d97c3`; later Linux-native research prototypes were removed. The real Setup Center Read Only / Read & Write selector, owner-only policy API, five conditional remote MCP mutation registrations, Linux bubblewrap write worker, and local owner Delete-approval flow are now coded. On Linux, Write is only offered if an unprivileged bubblewrap sandbox actually launches; unsupported hosts stay Read Only. **No runtime sandbox test, full host audit, real ChatGPT/Claude E2E, or production security review for this batch has yet passed. Do not publish or push before final acceptance.**

## User experience — the only product scope

1. In the existing Setup Center / File Access, the owner adds an **existing folder**.
2. The owner explicitly chooses its permission: **Read Only** (default) or **Read & Write**. Existing Read Only roots must never be upgraded automatically.
3. ChatGPT/Claude can list and read files within allowed folders, just as today.
4. For a folder explicitly set to Read & Write, permitted operations are: **create directory**, **create file**, **edit file**, **rename file**, and **delete file**. No arbitrary command/shell execution.
5. Deleting must have clear local owner confirmation. Disable/revoke permission in the dashboard must stop further operations.
6. The dashboard shows real permission and operation outcomes; no demo status, hidden activation paths, or extra setup wizard.

## Engineering work — internal only, not new product features

| Area | Deliverable | Acceptance |
|---|---|---|
| Folder permissions | One simple owner-protected Read Only / Read & Write choice within existing File Access flow | No default Write, no implicit migration, owner + CSRF checks still mandatory |
| File operations | Reuse the existing file engine, adapt only what is needed to safely create/edit/rename/delete inside approved roots | Deny traversal, symlinks and out-of-root mutations; no overwrite except version-checked edit; bounded text files |
| MCP integration | Expose file mutation tools only when a supported platform and its folder permission allow the operation | Authorization happens server-side per request; Cloudflare Access verification remains mandatory |
| User consent | Clear confirmation for Delete and revocation controls in the existing dashboard | A remote AI request never counts as local owner approval |
| Verification | One integrated QA cycle for backend, owner UI, MCP authentication, security edge cases, and production build | Fail closed until platform-safe filesystem containment is verified; no destructive testing on real user files |

**Technical safety boundary:** The current TypeScript `FileEngine` uses pathname checks; leaf-only `O_NOFOLLOW` does not prevent a parent-directory symlink race. Do not expose its existing write methods remotely without a verified containment mechanism. This protection should be implemented with the smallest maintainable, reviewed approach appropriate for the OS rather than shipping experimental native research programs. Platforms lacking verified mutation containment keep Write disabled; Read Only stays usable.

**Work approach:** finish the practical Read & Write feature as one cohesive batch, then request one owner-host test/audit, and only then commit and push. No further M3.2a/M3.2b sub-milestones. Preserve M1/M2, Cloudflare configuration, owner pairing, existing read tools, and production services.


## Windows 11 implementation and acceptance (2026-11-08)

The same PolicyEngine, Remote MCP endpoints, owner pairing, Cloudflare Access verification, and approval flow are shared across Linux/Windows. Windows has a dedicated worker at `src/server/files/write-worker-windows.mjs` for the five write operations, separate from the Linux bubblewrap worker. The Windows capability check must actually create/edit/rename/delete temporary test files and reject traversal before write access becomes available. No tool is enabled by default; each root must be explicitly granted Read & Write.

**Security limitation:** The Windows worker currently runs as a subprocess of the same logged-in user, **not** within an OS-enforced sandbox equivalent to bubblewrap. Pre-operation lstat/realpath, file identity, hardlink, junction and path checks cannot fully eliminate TOCTOU races from a hostile concurrent local process. Do not describe this adapter as security-parity with Linux or claim production approval without a Windows native security audit and targeted adversarial testing. Until acceptance, the code is development-only and must not be pushed to a stable release merely because JS syntax parsing succeeds.

**Windows native acceptance command:** `npm run test:windows`, followed by `npm run typecheck`, `npm run test:mcp`, `npm run build`. The tests must prove Read Only cannot write; approved folders permit all five operations; traversal, junctions, hardlinks, overwrite, stale expected SHA-256, and revoked permissions fail; the local owner Delete flow works; ChatGPT/Claude can see and call the published tools. These commands are not yet run from the Arch Local MCP connection because its available operations are file and Git only.

**Not in scope:** standalone native C research projects, exposed filesystem-security dashboards, arbitrary terminal access, agent orchestration, extra setup flows, speculative per-client signing infrastructure, or Windows/macOS Write claims without tests.

