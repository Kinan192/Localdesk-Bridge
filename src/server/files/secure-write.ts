import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FoundationError } from "../contracts/index.ts";
import { PolicyEngine } from "../access/index.ts";
import { requestDelete, consumeDelete } from "./delete-approval.ts";

const runner = fileURLToPath(new URL("./write-worker.mjs", import.meta.url));
const windowsRunner = fileURLToPath(new URL("./write-worker-windows.mjs", import.meta.url));
const maxPayload = 70 * 1024;
let windowsWorkerProbe: boolean | null = null;

export type WriteOperation =
  | { tool: "create_directory"; path: string }
  | { tool: "write_file"; path: string; content: string }
  | { tool: "edit_file"; path: string; content: string; expectedSha256: string }
  | { tool: "rename_file"; path: string; destination: string }
  | { tool: "delete_file"; path: string; approval?: string };

export function writeBackendAvailable(): boolean {
  // Windows is a native-file-worker preview, not an OS-enforced sandbox.
  // Explicit opt-in is required before remote Write tools can be registered.
  if (process.platform === "win32") {
    if (process.env.LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL !== "1") return false;
    // Fail closed when the separate Windows worker cannot actually start.
    // The test runner can inject NODE_TEST_CONTEXT into child processes.
    // Cache success only: a transient probe failure must not poison the process.
    if (windowsWorkerProbe === true) return true;
    const workerEnv = { ...process.env };
    for (const key of ["NODE_TEST_CONTEXT", "NODE_TEST_WORKER_ID",
      "NODE_CHANNEL_FD", "NODE_CHANNEL_SERIALIZATION_MODE", "NODE_OPTIONS"]) {
      delete workerEnv[key];
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const probe = spawnSync(process.execPath, [windowsRunner, "--probe"], {
        timeout: 15000, windowsHide: true, encoding: "utf8", env: workerEnv,
      });
      if (!probe.error && probe.status === 0 &&
          probe.stdout?.trim() === '{"ok":true}') {
        windowsWorkerProbe = true;
        return true;
      }
      if (process.env.LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL === "1") {
        const reason = probe.error?.message || probe.stderr?.trim() ||
          `exit=${probe.status ?? "null"}, stdout=${probe.stdout?.trim() || "empty"}`;
        console.error(`[Localdesk] Windows Write probe attempt ${attempt + 1} failed: ${reason.slice(0, 400)}`);
      }
    }
    return false;
  }
  if (process.platform !== "linux") return false;
  // A version check alone is insufficient: user namespaces can be blocked.
  const probe = spawnSync("bwrap", [
    "--unshare-all", "--die-with-parent", "--new-session",
    "--ro-bind", "/", "/", "--", "/usr/bin/true",
  ], {
    timeout: 3000, windowsHide: true, encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" },
  });
  return !probe.error && probe.status === 0;
}

/**
 * Linux writes run under bubblewrap with a single writable mount. Windows
 * uses a dedicated subprocess with owner-scoped path and reparse validation.
 * Unsupported hosts fail closed; remote owner permissions are always checked.
 */
export async function authorizedMutation(
  policy: PolicyEngine, rootId: string, operation: WriteOperation,
): Promise<unknown> {
  const root = policy.authorize(operation.tool, rootId);
  if (!root || root.access !== "write" || !root.enabled) {
    throw new FoundationError("ACCESS_DENIED", "Folder does not have Read & Write permission.");
  }
  if (operation.tool === "delete_file") {
    if (!operation.approval) return requestDelete(rootId, operation.path);
    await consumeDelete(rootId, operation.path, operation.approval);
  }
  return containedMutation(root.absolutePath, operation);
}

async function containedWindowsMutation(root: string, payload: string): Promise<unknown> {
  const info = await fs.lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new FoundationError("ACCESS_DENIED", "Approved folder is not a real directory.");
  }
  const real = await fs.realpath(root);
  if (path.win32.normalize(real).toLowerCase() !== path.win32.normalize(root).toLowerCase()) {
    throw new FoundationError("ACCESS_DENIED", "Approved folder is redirected or linked.");
  }
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(process.execPath, [windowsRunner, root], {
      shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_ENV: "production" },
    });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      finish(new FoundationError("UNAVAILABLE", "Windows write worker timed out."));
    }, 10000);
    function finish(error?: Error, response?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(response);
    }
    child.on("error", () => finish(new FoundationError("UNAVAILABLE", "Windows write worker could not start.")));
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", value => {
      output += String(value);
      if (output.length > 4096) child.kill();
    });
    child.once("close", code => {
      if (code !== 0) return finish(new FoundationError("ACCESS_DENIED",
        "Windows write worker denied the operation."));
      try {
        const response: unknown = JSON.parse(output);
        if (!response || typeof response !== "object" || !("ok" in response) ||
            (response as { ok: unknown }).ok !== true) {
          return finish(new FoundationError("ACCESS_DENIED", "Windows write operation denied."));
        }
        finish(undefined, response);
      } catch {
        finish(new FoundationError("UNAVAILABLE", "Invalid Windows write worker response."));
      }
    });
    child.stdin?.on("error", () => {});
    if (!child.stdin) return finish(new FoundationError("UNAVAILABLE", "Windows worker stdin unavailable."));
    child.stdin.end(payload);
  });
}

export async function containedMutation(absoluteRoot: string, operation: WriteOperation) {
  if (!writeBackendAvailable()) {
    throw new FoundationError("UNAVAILABLE", "Write requires a supported filesystem write worker.");
  }
  const payload = JSON.stringify(operation);
  if (Buffer.byteLength(payload, "utf8") > maxPayload) {
    throw new FoundationError("TOO_LARGE", "Write request exceeds size limit.");
  }
  const root = path.resolve(absoluteRoot);
  if (process.platform === "win32") return containedWindowsMutation(root, payload);
  const descriptor = await fs.open(root, constants.O_RDONLY | constants.O_DIRECTORY |
    (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await descriptor.stat();
    if (!stat.isDirectory()) throw new FoundationError("ACCESS_DENIED", "Invalid approved folder.");
    if (await fs.realpath(root) !== root) {
      throw new FoundationError("ACCESS_DENIED", "Approved folder contains an alias or symlink.");
    }
    const args = [
      "--unshare-all", "--die-with-parent", "--new-session",
      "--ro-bind", "/", "/",
      "--tmpfs", "/tmp",
      "--dir", "/tmp/localdesk-root",
      "--bind", "/proc/self/fd/3", "/tmp/localdesk-root",
      "--chdir", "/tmp/localdesk-root",
      process.execPath, runner,
    ];
    return await new Promise<unknown>((resolve, reject) => {
      const child = spawn("bwrap", args, {
        shell: false, stdio: ["pipe", "pipe", "pipe", descriptor.fd],
        env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "production" },
        windowsHide: true,
      });
      let output = "", errorText = "";
      let settled = false;
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        if (error) reject(error); else resolve(value);
      };
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new FoundationError("UNAVAILABLE", "Write sandbox timed out."));
      }, 10000);
      child.once("error", () => finish(new FoundationError("UNAVAILABLE", "Write sandbox could not start.")));
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", value => {
        output += String(value);
        if (output.length > 2048) child.kill("SIGKILL");
      });
      child.stderr?.on("data", value => {
        errorText += String(value);
        if (errorText.length > 2048) child.kill("SIGKILL");
      });
      child.once("close", code => {
        if (code !== 0) return finish(new FoundationError("ACCESS_DENIED",
          "Write sandbox denied the operation or failed its isolation checks."));
        try {
          const response: unknown = JSON.parse(output);
          if (!response || typeof response !== "object" || !("ok" in response) ||
              (response as { ok: unknown }).ok !== true) {
            return finish(new FoundationError("ACCESS_DENIED", "Write operation denied."));
          }
          finish(undefined, response);
        } catch {
          finish(new FoundationError("UNAVAILABLE", "Invalid write sandbox response."));
        }
      });
      child.stdin?.on("error", () => {});
      if (!child.stdin) return finish(new FoundationError("UNAVAILABLE", "Write sandbox stdin unavailable."));
      child.stdin.end(payload);
    });
  } finally {
    await descriptor.close();
  }
}
