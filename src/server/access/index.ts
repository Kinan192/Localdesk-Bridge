import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FoundationError, PolicySchema, MUTATION_TOOLS, defaultPolicy,
  type Policy, type RootConfig, type ToolName,
} from "../contracts/index.ts";

function includesPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." &&
    !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

// Reject ambiguous overlapping allowed roots: disabling one cannot be bypassed through an ancestor.
export async function validateRootPaths(input: unknown): Promise<Policy> {
  const policy = PolicySchema.parse(input);
  const existing: Array<{ id: string; real: string }> = [];
  for (const root of policy.roots) {
    if (!path.isAbsolute(root.absolutePath)) {
      throw new FoundationError("INVALID_INPUT", "A folder must use an absolute path.");
    }
    const normalized = path.resolve(root.absolutePath);
    const hostRoot = path.parse(normalized).root;
    if (normalized === hostRoot || normalized === path.resolve(os.homedir())) {
      throw new FoundationError("ACCESS_DENIED", "Whole-home and whole-disk access are not allowed.");
    }
    let info;
    try {
      info = await fs.lstat(normalized);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new FoundationError("ACCESS_DENIED", "Allowed roots must be real directories, not symlinks.");
      }
    } catch (error) {
      if (error instanceof FoundationError) throw error;
      throw new FoundationError("UNAVAILABLE", "Root directory is not available.", error);
    }
    const real = await fs.realpath(normalized);
    for (const other of existing) {
      if (includesPath(real, other.real) || includesPath(other.real, real)) {
        throw new FoundationError("INVALID_INPUT",
          "Overlapping roots are not supported: " + root.id + " / " + other.id);
      }
    }
    existing.push({ id: root.id, real });
  }
  return policy;
}

export class PolicyEngine {
  private policy: Policy;
  private constructor(initial: Policy) { this.policy = initial; }

  static async create(initial: unknown = defaultPolicy()): Promise<PolicyEngine> {
    return new PolicyEngine(await validateRootPaths(initial));
  }

  snapshot(): Policy {
    return structuredClone(this.policy);
  }

  async update(candidate: unknown): Promise<Policy> {
    const validated = await validateRootPaths(candidate);
    this.policy = structuredClone(validated);
    return this.snapshot();
  }

  authorize(tool: ToolName, rootId?: string): RootConfig | null {
    if (!Object.hasOwn(this.policy.tools, tool) || !this.policy.tools[tool]) {
      throw new FoundationError("ACCESS_DENIED", "MCP tool is not enabled.");
    }
    if (tool === "list_roots") return null;
    if (!rootId) throw new FoundationError("INVALID_INPUT", "Root ID is required.");
    const root = this.policy.roots.find(item => item.id === rootId);
    if (!root || !root.enabled) {
      throw new FoundationError("ACCESS_DENIED", "Root is not enabled.");
    }
    if (MUTATION_TOOLS.includes(tool) && root.access !== "write") {
      throw new FoundationError("ACCESS_DENIED", "Root is read-only.");
    }
    return structuredClone(root);
  }

  enabledRoots(): RootConfig[] {
    this.authorize("list_roots");
    return structuredClone(this.policy.roots.filter(root => root.enabled));
  }
}
