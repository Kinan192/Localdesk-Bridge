import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeBackendAvailable } from "../files/secure-write.ts";
import { z } from "zod";
import { PolicyEngine } from "../access/index.ts";
import { JsonPolicyRepository } from "../storage/index.ts";
import {
  FoundationError, PolicySchema, ToolNameSchema, type Policy,
} from "../contracts/index.ts";

const stateDirectory = process.env.LOCAL_MCP_STATE_DIR || path.join(
  os.homedir(),
  process.platform === "win32" ? "AppData/Local/LocalMCPManager" : ".config/local-mcp-manager",
);
const storage = new JsonPolicyRepository(stateDirectory);

const NewRoot = z.object({
  label: z.string().trim().min(1).max(80),
  absolutePath: z.string().min(1).max(4096),
  access: z.enum(["read", "write"]).default("read"),
}).strict();
const ChangeRoot = z.object({
  type: z.literal("root"),
  id: z.string().min(1).max(80),
  enabled: z.boolean().optional(),
  access: z.enum(["read", "write"]).optional(),
}).strict();
const ChangeTool = z.object({
  type: z.literal("tool"),
  tool: ToolNameSchema,
  enabled: z.boolean(),
}).strict();
const DeleteRoot = z.object({ id: z.string().min(1).max(80) }).strict();

export async function getPolicy(): Promise<Policy> {
  const snapshot = await storage.load();
  return PolicySchema.parse(snapshot);
}

function requireWritableBackend() {
  if (!writeBackendAvailable()) {
    throw new FoundationError("UNAVAILABLE",
      "Read & Write memerlukan worker filesystem yang didukung dan berfungsi. Mode tetap Read Only.");
  }
}

async function commit(candidate: Policy) {
  // PolicyEngine verifies real directories, overlaps and path safety.
  const engine = await PolicyEngine.create(candidate);
  return storage.save(engine.snapshot());
}

export async function addReadOnlyRoot(value: unknown) {
  const data = NewRoot.parse(value);
  if (data.access === "write") requireWritableBackend();
  const policy = await getPolicy();
  const candidate = data.absolutePath.trim();
  if (!path.isAbsolute(candidate)) {
    throw new FoundationError("INVALID_INPUT", "Use an absolute folder path (not ~/).");
  }
  const normalized = path.resolve(candidate);
  const hidden = normalized.split(path.sep).filter(Boolean).some(part => part.startsWith("."));
  if (hidden) {
    throw new FoundationError("ACCESS_DENIED", "Hidden/system folders cannot be approved in this version.");
  }
  const key = (value: string) => process.platform === "win32"
    ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (policy.roots.some(root => key(root.absolutePath) === key(normalized))) {
    throw new FoundationError("CONFLICT", "Folder already approved.");
  }
  policy.roots.push({
    id: randomUUID(),
    label: data.label,
    absolutePath: normalized,
    enabled: true,
    access: data.access,
  });
  if (data.access === "write") {
    policy.tools.create_directory = true;
    policy.tools.write_file = true;
    policy.tools.edit_file = true;
    policy.tools.rename_file = true;
    policy.tools.delete_file = true; // Every delete still requires explicit local approval.
  }
  return commit(policy);
}

export async function setRootEnabled(value: unknown) {
  const data = ChangeRoot.parse(value);
  const policy = await getPolicy();
  const root = policy.roots.find(item => item.id === data.id);
  if (!root) throw new FoundationError("NOT_FOUND", "Folder not found.");
  if (typeof data.enabled === "boolean") root.enabled = data.enabled;
  if (data.access === "write") requireWritableBackend();
  if (data.access) root.access = data.access;
  if (data.access === "write") {
    policy.tools.create_directory = true;
    policy.tools.write_file = true;
    policy.tools.edit_file = true;
    policy.tools.rename_file = true;
    policy.tools.delete_file = true;
  }
  return commit(policy);
}

export async function removeRoot(value: unknown) {
  const data = DeleteRoot.parse(value);
  const policy = await getPolicy();
  if (!policy.roots.some(root => root.id === data.id)) {
    throw new FoundationError("NOT_FOUND", "Folder not found.");
  }
  policy.roots = policy.roots.filter(root => root.id !== data.id);
  return commit(policy);
}

export async function setToolEnabled(value: unknown) {
  const data = ChangeTool.parse(value);
  if (data.enabled &&
      ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"].includes(data.tool)) {
    requireWritableBackend();
  }
  const policy = await getPolicy();
  policy.tools[data.tool] = data.enabled;
  return commit(policy);
}
