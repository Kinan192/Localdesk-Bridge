import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type LocalSetupPlatform = NodeJS.Platform;

export type LocalClientSetupInfo = {
  platform: LocalSetupPlatform;
  projectDirectory: string;
  nodeCommand: string;
  args: [string, string];
  desktopConfigFile: string | null;
  stateDirectoryOverride: string | null;
  dependenciesReady: boolean;
  missing: string[];
};

function desktopConfigPath(platform: LocalSetupPlatform, home: string, appData?: string) {
  if (platform === "win32") {
    return path.join(appData || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  // Claude Desktop Linux distribution varies: community packaging may use this location.
  if (platform === "linux") {
    return path.join(home, ".config", "Claude", "claude_desktop_config.json");
  }
  return null;
}

async function isFile(filePath: string) {
  try { return (await fs.stat(filePath)).isFile(); }
  catch { return false; }
}

/**
 * Read-only local setup metadata. No Claude installation is modified.
 * Uses the installed tsx CLI as a child of the absolute Node executable,
 * avoiding shell PATH dependencies inside desktop MCP clients.
 */
export async function getLocalClientSetup(options: {
  projectDirectory?: string;
  nodeExecutable?: string;
  platform?: LocalSetupPlatform;
  homeDirectory?: string;
  appData?: string;
} = {}): Promise<LocalClientSetupInfo> {
  const projectDirectory = options.projectDirectory ?? process.cwd();
  const nodeCommand = options.nodeExecutable ?? process.execPath;
  if (!path.isAbsolute(projectDirectory) || !path.isAbsolute(nodeCommand)) {
    throw new Error("Project and Node executable paths must be absolute.");
  }
  const platform = options.platform ?? process.platform;
  const tsxCli = path.join(projectDirectory, "node_modules", "tsx", "dist", "cli.mjs");
  const serverEntry = path.join(projectDirectory, "src", "server", "mcp", "stdio.ts");
  const stateOverride = process.env.LOCAL_MCP_STATE_DIR?.trim() || "";

  if (stateOverride && !path.isAbsolute(stateOverride)) {
    throw new Error("LOCAL_MCP_STATE_DIR must be an absolute path.");
  }
  const missing: string[] = [];
  if (!(await isFile(nodeCommand))) missing.push("Node.js executable");
  if (!(await isFile(tsxCli))) missing.push("tsx CLI (run npm install)");
  if (!(await isFile(serverEntry))) missing.push("MCP server entrypoint");

  return {
    platform,
    projectDirectory,
    nodeCommand,
    args: [tsxCli, serverEntry],
    desktopConfigFile: desktopConfigPath(
      platform,
      options.homeDirectory ?? os.homedir(),
      options.appData ?? process.env.APPDATA,
    ),
    stateDirectoryOverride: stateOverride || null,
    dependenciesReady: missing.length === 0,
    missing,
  };
}
