import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dashboardSrc = path.join(projectRoot, "src");
const scanRoots = [dashboardSrc, path.join(projectRoot, "tests/foundation"), path.join(projectRoot, "tests/mcp")];
const extensions = [".tsx", ".ts", ".js", ".mjs", ".json", ".css"];
const failures = [];
let checked = 0;

async function exists(candidate) {
  try { await fs.stat(candidate); return true; } catch { return false; }
}

const requiredFrontendFiles = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/components/dashboard.tsx",
  "src/context/dashboard-context.tsx",
  "src/features/overview/overview-page.tsx",
  "src/features/file-access/file-access-page.tsx",
  "src/features/mcp-tools/tools-page.tsx",
  "src/features/connections/connections-page.tsx",
  "src/features/activity/activity-page.tsx",
  "src/features/settings/settings-page.tsx",
];
for (const relative of requiredFrontendFiles) {
  if (!(await exists(path.join(projectRoot, relative)))) {
    failures.push("Missing required frontend source: " + relative);
  }
}
async function resolveLocalImport(specifier, from) {
  let target;
  if (specifier.startsWith("@/")) {
    target = path.resolve(dashboardSrc, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    target = path.resolve(path.dirname(from), specifier);
  } else if (specifier.startsWith("@local-mcp/")) {
    return false; // Deprecated monorepo imports must never return.
  } else {
    return true; // package dependencies are validated by npm/typecheck.
  }
  for (const candidate of [target, ...extensions.map(ext => target + ext),
    ...extensions.map(ext => path.join(target, "index" + ext))]) {
    if (await exists(candidate)) return true;
  }
  return false;
}
async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(full);
      continue;
    }
    if (!entry.isFile() || !extensions.some(ext => full.endsWith(ext))) continue;
    if (full.endsWith(".tsx.ts")) failures.push("Temporary TSX extension: " + full);
    const text = await fs.readFile(full, "utf8");
    checked++;
    const moduleReferences = [
      ...text.matchAll(/\b(?:import|export)\s+[^;]*?\bfrom\s+["']([^"']+)["']/g),
      ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ];
    for (const match of moduleReferences) {
      const specifier = match[1];
      if (!(await resolveLocalImport(specifier, full))) {
        failures.push(path.relative(projectRoot, full) + ": unresolved " + specifier);
      }
    }
    if (full.endsWith(".css")) {
      for (const match of text.matchAll(/@import\s+["']([^"']+)["']/g)) {
        const specifier = match[1];
        if ((specifier.startsWith("./") || specifier.startsWith("../")) &&
            !(await resolveLocalImport(specifier, full))) {
          failures.push(path.relative(projectRoot, full) + ": missing CSS import " + specifier);
        }
      }
    }
    if (full.endsWith(".tsx")) {
      const icons = [...text.matchAll(/\bicon:\s*([A-Z][A-Za-z0-9_]*)\b/g)]
        .map(x => x[1]).filter(x => !["LucideIcon", "Icon"].includes(x));
      const imports = text.slice(0, Math.max(0, text.indexOf("export default function")));
      for (const name of icons) {
        if (!new RegExp("\\b" + name + "\\b").test(imports)) {
          failures.push(path.relative(projectRoot, full) + ": possibly missing icon " + name);
        }
      }
    }
  }
}
for (const dir of scanRoots) await visit(dir);
if (failures.length) {
  console.error("STATIC AUDIT FAILED\n" + failures.map(x => "- " + x).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Static import and file audit passed (" + checked + " source files).");
  console.log("This does not replace TypeScript compilation or runtime tests.");
}
