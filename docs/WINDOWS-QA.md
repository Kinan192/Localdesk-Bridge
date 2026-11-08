# Localdesk Windows 11 QA (development preview)

The Windows implementation reuses the same policy, dashboard, MCP HTTP listener, Cloudflare Access authentication and approval flow as Linux. **Do not use the Windows Write preview with sensitive data.** It is not isolated under a low-privilege Windows token or an OS-enforced filesystem sandbox. A hostile local process could race path checks and directory replacement.

## Update and verify on Windows 11

From an existing checkout (PowerShell):

```powershell
git pull --ff-only origin main
npm ci
npm run test:windows
npm run typecheck
npm run test:mcp
npm run build
```

- `npm run test:windows` runs the native Windows regression tests with a temporary, child-process-only preview flag, verifies file mutations in disposable directories, denies traversal and junction/hardlink access, and checks policy enforcement. It must be run on Windows; running it on Linux is not equivalent.
- The Write preview is off for normal `localdesk` and `npm start` sessions.
- Once the tests pass, run `localdesk --windows-write-preview` from the same linked installation to opt into Write for this session. Do not start a second Localdesk instance on the same port.
- Add only an **empty disposable test folder** using the local dashboard, choose Read & Write, then verify list_roots, list_files, read_file and the five mutation tools through the protected MCP connection.
- Delete operations require separate local owner confirmation. Never share pairing links or Cloudflare credentials. A live Tunnel does not prove end-to-end tool availability.
- After testing, stop the dashboard and relaunch with plain `localdesk` to return to Read Only on Windows.

## GitHub Actions

The workflow template is at `ci/windows-qa.yml`. GitHub Actions only recognizes workflows under `.github/workflows/`; the current Arch MCP file connector denies hidden-directory modifications, so **the template is not activated merely by committing it**. Installing this workflow needs GitHub repository write access to that path and a separate Git commit. Do not claim the workflow ran until it is installed and appears in the repository's Actions tab.

## Release gate

A passing Windows QA suite and successful ChatGPT/Claude file operations are prerequisites for the preview acceptance. Full Windows Write release additionally requires OS-enforced containment and hostile-local-race security review; a same-user worker with realpath/lstat checks is not equivalent to Linux bubblewrap.
