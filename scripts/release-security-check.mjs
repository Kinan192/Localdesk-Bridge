import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const cwd = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const issues = [];
const warnings = [];
const read = async name => fs.readFile(path.join(cwd, name), "utf8");

const next = JSON.parse(await read("node_modules/next/package.json")).version;
const nums = next.split(/[.-]/).slice(0, 3).map(Number);
if (nums.some(x => !Number.isInteger(x))) issues.push("Cannot verify installed Next.js version.");
else if (nums[0] < 16 || (nums[0] === 16 &&
  (nums[1] < 4 || (nums[1] === 4 && nums[2] < 1)))) {
  issues.push("Next.js " + next + " is below the October 2026 security floor 16.4.1.");
}
const pkg = JSON.parse(await read("package.json"));
if (!pkg.scripts.start?.includes("launch-dashboard.ts")) {
  issues.push("Production npm start must use secure owner launcher.");
}
const launcher = await read("scripts/launch-dashboard.ts");
if (!launcher.includes('"127.0.0.1"') || !launcher.includes("createTicket()")) {
  issues.push("Dashboard launcher has no verified localhost / owner pairing flow.");
}
const remote = await read("src/server/mcp/http.ts");
if (!remote.includes('server.listen(config.port, "127.0.0.1"')) {
  issues.push("Remote MCP listener does not explicitly bind to loopback.");
}
const provision = await read("src/server/cloudflare/protected-provisioner.ts");
if (!provision.includes('http://127.0.0.1:8401')) {
  issues.push("Cloudflare tunnel ingress does not retain isolated 8401 origin.");
}
if (provision.includes('http://127.0.0.1:3100')) {
  issues.push("Never route Cloudflare Tunnel to admin dashboard port 3100.");
}
const contracts = await read("src/server/contracts/index.ts");
if (!contracts.includes("create_directory: false, write_file: false")) {
  issues.push("Default policy must keep remote write tools disabled until hardened.");
}
const demo = await read("src/lib/demo.ts");
if (!demo.includes("sampleRoots: FolderRoot[] = [];") ||
    !demo.includes("sampleEvents: EventEntry[] = [];")) {
  issues.push("Production UI still includes fabricated folders or activity.");
}
if (!pkg.scripts.test?.includes("dashboard-launch.test.ts")) {
  issues.push("Launcher security tests are missing from test command.");
}

const tracked = spawnSync("git", ["ls-files", "-z"], { cwd, encoding: "buffer" });
if (tracked.status !== 0) {
  warnings.push("Git tracked-file secret scan skipped (not a checked-out Git repository).");
} else {
  const files = tracked.stdout.toString("utf8").split("\0").filter(Boolean);
  for (const filename of files) {
    if (filename.includes("node_modules/") || filename.endsWith(".lock") ||
        filename.startsWith(".next/")) continue;
    if (/(^|\/)\.env($|\.)|\.pem$|\.p12$|\.pfx$|id_rsa$|\.key$/i.test(filename)) {
      issues.push("Sensitive filename may be tracked: " + filename);
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(cwd, filename));
      if (raw.length > 1_000_000 || raw.includes(0)) continue;
      const source = raw.toString("utf8");
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source) ||
          /(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}/.test(source) ||
          /sk-[A-Za-z0-9_-]{28,}/.test(source)) {
        issues.push("Potential secret in tracked file: " + filename);
      }
    } catch { /* Unsupported/unreadable files handled by Git status review. */ }
  }
}
for (const warning of warnings) console.warn("WARN:", warning);
if (issues.length) {
  for (const issue of issues) console.error("RELEASE BLOCKER:", issue);
  process.exitCode = 1;
} else {
  console.log("Initial release security gate passed. Installed Next.js: " + next);
  console.log("This does not replace a full security audit, runtime E2E or Windows/macOS QA.");
}
