#!/usr/bin/env node
/**
 * LocalDesk CLI foundation (M1). This entrypoint deliberately does not own an
 * independent MCP server: it delegates to the existing verified owner launcher.
 * Interactive TUI and npm-registry packaging are later release milestones.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const packageFile = path.join(projectRoot, "package.json");
const launcher = path.join(projectRoot, "scripts", "launch-dashboard.ts");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const productionBuild = path.join(projectRoot, ".next", "BUILD_ID");

function projectVersion() {
  const manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  if (manifest.name !== "local-mcp-manager" || typeof manifest.version !== "string") {
    throw new Error("LocalDesk package metadata is invalid.");
  }
  return manifest.version;
}

const help = `LocalDesk — local-first MCP dashboard

Usage:
  localdesk                    Start dashboard and configured MCP/Tunnel
  localdesk --manual-services  Start dashboard without remote auto-start
  localdesk --help             Show this message
  localdesk --version          Show installed package version

The browser pairing link is private. Do not share it.
Ctrl+C stops the dashboard and only the services it manages.

Development: link from the project directory into a user-owned npm prefix:
  npm_config_prefix="$HOME/.local" npm link
  export PATH="$HOME/.local/bin:$PATH"
Standalone npm-registry installation is not released yet.
`;

const argumentsList = process.argv.slice(2);
if (argumentsList.length === 1 && ["--help", "-h"].includes(argumentsList[0])) {
  process.stdout.write(help);
} else if (argumentsList.length === 1 && ["--version", "-v"].includes(argumentsList[0])) {
  try {
    process.stdout.write(projectVersion() + "\n");
  } catch {
    process.stderr.write("LocalDesk installation metadata is unavailable.\n");
    process.exitCode = 1;
  }
} else if (argumentsList.length !== 0 &&
  !(argumentsList.length === 1 && argumentsList[0] === "--manual-services")) {
  process.stderr.write("Unknown LocalDesk option. Use 'localdesk --help'.\n");
  process.exitCode = 2;
} else {
  const ready = [launcher, tsxCli, productionBuild].every(file => {
    try { return fs.statSync(file).isFile(); }
    catch { return false; }
  });
  if (!ready) {
    process.stderr.write(
      "LocalDesk runtime is incomplete or not built.\n" +
      "In the installed project directory, run 'npm install' and 'npm run build' first.\n" +
      "The standalone npm package is planned for a later release.\n",
    );
    process.exitCode = 1;
  } else {
    // A global bin can be invoked from any directory, including after npm link.
    // Only pass an explicit, whitelisted flag to the existing secure launcher.
    const child = spawn(process.execPath, [
      tsxCli, launcher,
      ...(argumentsList[0] === "--manual-services" ? ["--manual-services"] : []),
    ], {
      cwd: projectRoot, shell: false, stdio: "inherit", windowsHide: true,
    });
    let requestedStop = false;
    let spawnError = false;
    const stop = () => {
      if (requestedStop) return;
      requestedStop = true;
      if (child.pid) child.kill("SIGTERM");
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("error", () => {
      spawnError = true;
      process.stderr.write("LocalDesk could not start its trusted local launcher.\n");
    });
    child.on("close", (code, signal) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      process.exitCode = spawnError ? 1 :
        code !== null ? code : requestedStop ? 0 : signal ? 1 : 1;
    });
  }
}
