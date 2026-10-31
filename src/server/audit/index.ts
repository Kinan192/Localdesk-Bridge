import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AuditEventSchema, type AuditEvent, type ToolName,
} from "../contracts/index.ts";

const MAX_AUDIT_BYTES = 1024 * 1024; // bounded alpha log (1 MiB)
const MAX_EVENT_BYTES = 1024;

function stateDirectory() {
  const selected = process.env.LOCAL_MCP_STATE_DIR?.trim();
  return selected ? path.resolve(selected) : path.join(
    os.homedir(),
    process.platform === "win32" ? "AppData/Local/LocalMCPManager" : ".config/local-mcp-manager",
  );
}

async function auditPath() {
  const folder = stateDirectory();
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const dir = await fs.lstat(folder);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error("Unsafe audit directory");
  return path.join(folder, "audit.jsonl");
}

function validateFile(info: { isFile(): boolean; nlink: number }) {
  if (!info.isFile() || info.nlink > 1) throw new Error("Unsafe audit log file");
}

export async function appendAuditEvent(input: {
  tool: ToolName;
  rootId?: string;
  result: "allowed" | "denied" | "error";
  clientId?: "local-stdio" | "remote-http";
}): Promise<void> {
  // No file names, paths, user prompts, file content, or credentials in audit logs.
  const event = AuditEventSchema.parse({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    action: input.tool,
    tool: input.tool,
    ...(input.rootId && /^[a-zA-Z0-9_-]{1,80}$/.test(input.rootId)
      ? { rootId: input.rootId } : {}),
    result: input.result,
    clientId: input.clientId ?? "local-stdio",
  });
  const line = Buffer.from(JSON.stringify(event) + "\n");
  if (line.byteLength > MAX_EVENT_BYTES) throw new Error("Audit event exceeds limit");
  const filename = await auditPath();
  const handle = await fs.open(filename, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY |
    (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const info = await handle.stat();
    validateFile(info);
    if (info.size + line.byteLength > MAX_AUDIT_BYTES) {
      // Fail boundedly rather than growing without limit; future phase adds rotation.
      throw new Error("Audit storage is full");
    }
    await handle.write(line);
  } finally { await handle.close(); }
}

export async function readAuditEvents(
  options: { limit?: number; result?: "allowed" | "denied" | "error" } = {},
): Promise<AuditEvent[]> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid audit limit");
  const filename = await auditPath();
  let handle;
  try {
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  try {
    const stat = await handle.stat();
    validateFile(stat);
    if (stat.size > MAX_AUDIT_BYTES) throw new Error("Audit log exceeds size limit");
    const content = await handle.readFile({ encoding: "utf8" });
    const events: AuditEvent[] = [];
    for (const line of content.split("\n").reverse()) {
      if (!line.trim()) continue;
      try {
        const parsed = AuditEventSchema.safeParse(JSON.parse(line));
        if (parsed.success && (!options.result || parsed.data.result === options.result)) {
          events.push(parsed.data);
          if (events.length >= limit) break;
        }
      } catch { /* Skip malformed event; never render unvalidated data. */ }
    }
    return events;
  } finally { await handle.close(); }
}
