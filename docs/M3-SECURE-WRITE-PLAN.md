# M3 — Secure Read & Write Roadmap

**Date:** 2026-11-01  
**Status (2026-11-01):** M3.1 automated host acceptance PASS (4/4 focused, 197/197 foundation, 3/3 MCP smoke, both typechecks, 155-source static audit and production Next.js build). Manual Setup Center browser regression for the new Write restriction indicator remains to be confirmed. Write remains OFF. M3.2–M3.7 NOT implemented.  
**Baseline:** M2 wizard implementation and integrated automated audits pass. Live ChatGPT and Claude external E2E results, keyboard/mobile QA, and cross-platform package validation remain independent claims.  
**Prerequisites:** `docs/WRITE-SECURITY-DESIGN-V1.md`, `docs/SECURITY-REVIEW-2026-10-31.md`, `docs/PRD-V1-RELEASE-REFACTOR.md`.

## Security decision

A folder access toggle is **not** filesystem containment. The current `FileEngine.resolve()` validates pathnames and the final-component `O_NOFOLLOW`, but a hostile local process can swap a parent directory between validation and the later filesystem operation (TOCTOU). Therefore the existing `createDirectory()`/`writeFile()` methods are **not authorized for remote exposure**, even though they are useful in isolated foundation tests. The existing edit/rename/delete methods are intentionally not implemented. Continue registering **only five read tools** in both remote HTTP and stdio MCP.

No M3 stage may use `path.resolve()`, `lstat()`, `realpath()` or leaf-only `O_NOFOLLOW` as a substitute for race-resistant parent containment. A cross-platform application must either prove the relevant OS mechanism on each platform or explicitly disable Write on unsupported platforms.

## Sequential implementation slices

| Stage | Deliverable | Test / acceptance gate |
|---|---|---|
| **M3.1** | Document threat model; publish read-only `writeReleaseStatus()` diagnostics on the paired-owner policy API and Setup Center; no enable action | Default roots empty, mutation tools disabled, owner/CSRF preserved, no remote/stdio mutation registration, static/source tests and full audit PASS |
| **M3.2** | Prototype an isolated filesystem mutation backend **without remote registry integration**. On Linux, evaluate vetted `openat2` / `RESOLVE_BENEATH` + `RESOLVE_NO_SYMLINKS` and handle-relative operations or an OS-enforced sandbox. On Windows/macOS, document and test equivalent handle/sandbox guarantees before enabling platform support | Test adversarial parent swapping, mount/bind boundaries, root replacement, symlink/reparse/hardlink denial, traversal, Unicode, relative/UNC/drive paths; independent containment review |
| **M3.3** | Root-specific, tool-specific, and authenticated-client-specific grant model; owner explicit consent, no implicit migration of Read roots, strict root identity and revocation semantics | Cross-client denial matrix, concurrent revocation, policy changes cannot bypass the owner session; fail closed on unknown identity |
| **M3.4** | Safe create-only directory/text file using contained parent handles, bound size/extensions, no overwrite, fsync and error cleanup | Same-root identity and race probes, `O_EXCL` semantics, exhaustion/failure injection, concurrent creates, audit failures |
| **M3.5** | Optimistic-concurrency edit and no-clobber rename using version/hash, temp file in same contained directory, atomic commit | Hash mismatch, rename races, crash recovery, cross-root denial, hardlink/symlink/overwrite rejection |
| **M3.6** | Delete confirmation service: local owner approves an exact file path/action with one-time, expiring authorization; deny recursive deletion | Consent expiry/replay, stale identity, race windows, audit commit/failure and manual revoke |
| **M3.7** | Feature-gated Remote MCP write-tool registration **only on explicitly approved platforms after gates pass**; File Access Read/Write selection and documentation | Full host adversarial audit, owner browser QA, real authenticated ChatGPT and Claude mutation tests in a disposable root, clean install and rollback |

## Must never change as an incidental step

- No automatic Read → Write upgrade. Existing roots remain Read Only until separate owner approval.
- Never expose the local dashboard (port 3100) to Cloudflare; protect remote MCP with Access JWT and strict host/origin rules.
- Never enable editing/deleting outside individually approved roots, including home root, hidden/system directories, symlinks and reparse points.
- Never restart, stop or reconfigure **Arch Local MCP V2**, its Cloudflare Tunnel, or existing LocalDesk production resources during isolated tests.
- No remote Write just because `writeReleaseStatus().available` changes or a feature flag is set; platform containment and policy authorization must be independently enforced at the syscall boundary.
- Sensitive credentials, pairing tickets, file contents, security audit secrets and raw Cloudflare tokens must not appear in public status or Git.

## M3.1 current implementation

- `src/server/access/write-release.ts`: explicit static block reasons, hardcoded `available: false`, read-only mode; this is **diagnostic information only**, not an authorization layer.
- `src/app/api/local/policy/route.ts`: adds diagnostic `writeRelease` information on existing owner-protected GET and policy mutation responses. Existing mode and policy mutation restrictions remain unchanged.
- `src/features/setup-center/system-folder-panels.js`: shows the M3 restriction when the server reports unavailable Write. No functional Write control is added.
- `tests/foundation/write-release-gate.test.ts`: verifies the blocked state, no secret flag or client activation, owner/CSRF guards, disabled mutation tools and absence of MCP write registrations.
- `npm run test:write-gate`: focused test; included in `npm run test` and therefore `npm run audit:all`.

**Automated host gate PASSED (owner log, 2026-11-01):** `npm run test:write-gate && npm run audit:all` returned 4/4 focused tests PASS, 197/197 foundation tests PASS, 3/3 MCP smoke PASS, 155-file static audit PASS, foundation/application TypeScript checks PASS, and optimized Next.js 16.4.3 production build PASS (9 static pages generated). Distinct audit-main tests total 200/200; the 4 focused tests are also included in foundation. **Manual UI gate still pending:** confirm Setup Center still shows Read Only and new blocked-security status, existing roots add/disable/revoke normally, and five read tools still work. Do not run Write tests on real folders. The verified source/tests can be committed as an audited M3.1 implementation without claiming the manual UI gate or secure mutation release. Exclude `next-env.d.ts`, credential files, private state and generated artifacts.

**Not a release statement:** M3.1 passing its tests does not prove secure mutation containment. M3.2 must decide and validate the OS-aware mechanism before any usable Write capability is introduced.
