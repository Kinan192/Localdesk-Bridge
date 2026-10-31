# Claude Local MCP Setup Wizard (v0.4 prototype)

**Project:** `~/Projects/local-mcp-manager/`  
**Status:** Source code created, pending new `npm run audit:all` and browser verification.  
**Tool access:** Only Arch Local MCP V2 was used. No RDC and no changes to `~/Projects/local-file-mcp/`.

## Capability

AI Connections dashboard now has **Configure** for:
- **Claude Code (local stdio)**: copy a concrete `claude mcp add --scope user --transport stdio local-mcp-manager -- ...` command. Verified syntax against [official Claude Code docs](https://code.claude.com/docs/en/mcp).
- **Claude Desktop (local stdio)**: copy a `mcpServers.local-mcp-manager` JSON snippet, to be merged with existing configuration.

The setup is generated for the machine hosting Next.js; it does not write into Claude settings or start another MCP process. It only produces instructions the user reviews and copies.

## Backend

- `src/server/setup/index.ts`: determines host OS, the active Node executable, absolute installed `tsx` CLI path, MCP entry point, and candidate Desktop configuration file.
- `GET /api/local/setup`: exposes only local setup metadata through existing localhost-only request validation. No credentials in response.
- Missing Node/tsx/server entry files are flagged before the user attempts installation.

Example expected Arch response shape:

```json
{
  "setup": {
    "platform": "linux",
    "projectDirectory": "/home/USER/Projects/local-mcp-manager",
    "nodeCommand": "/usr/bin/node",
    "args": [
      "/home/USER/Projects/local-mcp-manager/node_modules/tsx/dist/cli.mjs",
      "/home/USER/Projects/local-mcp-manager/src/server/mcp/stdio.ts"
    ],
    "desktopConfigFile": "/home/USER/.config/Claude/claude_desktop_config.json",
    "dependenciesReady": true,
    "missing": []
  },
  "mode": "local-stdio"
}
```

*This example is illustrative; the actual paths are computed at runtime.*

## Notes and safety

1. The CLI uses absolute paths, so it does not depend on a client process inheriting the shell's working directory/PATH.
2. Claude Code's `--scope user` registers the server for the current system user across Claude Code projects. Only approve intended folders in File Access; app default allowlist is empty.
   If `LOCAL_MCP_STATE_DIR` was set when starting the Next.js dashboard, the wizard includes that directory in the Claude Desktop `env` block or Claude Code `--env` flag so both processes read the same approved-folder policy.
3. Claude Desktop configuration snippet MUST be merged under `mcpServers`; never overwrite existing entries. The displayed Linux Desktop config path is commonly used by community packages and may differ by installation.
4. Tools are **read-only**, and any changes to the local root allowlist apply when the MCP client reconnects.
5. This wizard does **not** confirm that Claude is connected. No client introspection or verification handshake from the UI exists yet.
6. Remote ChatGPT/Claude Web setup is not enabled; it requires authenticated HTTPS.
7. The local dashboard's localhost Host+Origin guard is NOT user authentication; never expose port 3100 through a tunnel or network.

## Validation

```bash
cd ~/Projects/local-mcp-manager
npm run audit:all
npm run dev
```

Then in another terminal:

```bash
curl -i http://127.0.0.1:3100/api/local/setup
```

Expected: HTTP 200 and `dependenciesReady: true` when `npm install` was run.

Open dashboard -> **AI Connections** -> **Claude Code** -> **Configure**. Confirm the command includes full paths to Node, the installed tsx CLI, and `src/server/mcp/stdio.ts`. The smoke test `tests/mcp/setup-launch-smoke.test.ts` uses those same paths from a different working directory to verify the command actually boots the MCP server.

## Next after QA

- Integrate true MCP connection discovery/status rather than display the static “Not configured” state.
- Add local self-test button for the generated stdio launch command, with safe timeout.
- Improve Claude Desktop extension (.mcpb) packaging for non-developers if needed.
- Only later add remote connector authentication or real write permissions.
