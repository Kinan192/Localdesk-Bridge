// Execute Windows-only regression tests with the local experimental gate.
// The environment change applies only to this child process.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  process.stderr.write("Windows native test runner must run on Windows (win32).\n");
  process.exitCode = 2;
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const tests = [
    "tests/foundation/access-policy.test.ts",
    "tests/foundation/file-engine.test.ts",
    "tests/foundation/local-policy.test.ts",
    "tests/foundation/write-release-gate.test.ts",
    "tests/foundation/windows-write-functional.test.ts",
    "tests/foundation/write-functional.test.ts",
    "tests/foundation/service-manager.test.ts",
    "tests/foundation/localdesk-cli.test.ts",
  ];
  const run = spawnSync(process.execPath, [tsx, "--test", ...tests], {
    cwd: root, shell: false, stdio: "inherit", windowsHide: true,
    env: { ...process.env, LOCALDESK_WINDOWS_WRITE_EXPERIMENTAL: "1" },
    timeout: 180000,
  });
  if (run.error) {
    process.stderr.write("Windows tests could not start or timed out.\n");
    process.exitCode = 1;
  } else {
    process.exitCode = run.status ?? 1;
  }
}
