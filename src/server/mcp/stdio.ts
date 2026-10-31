import os from "node:os";
import path from "node:path";
import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { PolicyEngine } from "../access/index.ts";
import { FileEngine } from "../files/index.ts";
import { JsonPolicyRepository } from "../storage/index.ts";
import { appendAuditEvent } from "../audit/index.ts";
import { FoundationError, type ToolName } from "../contracts/index.ts";

/**
 * Local-only, read-only MCP entrypoint.
 *
 * This process is spawned by an AI desktop client. It does not open HTTP
 * ports and it never starts a remote tunnel. The allowed folder policy is
 * loaded from user-local configuration; initially there are no roots.
 *
 * stdout is reserved for MCP. Diagnostics must use stderr.
 */

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function main() {
  const appData = process.env.LOCAL_MCP_STATE_DIR?.trim();
  const directory = appData || path.join(
    os.homedir(),
    process.platform === "win32"
      ? "AppData/Local/LocalMCPManager"
      : ".config/local-mcp-manager",
  );
  const policy = await PolicyEngine.create(await new JsonPolicyRepository(directory).load());
  const files = new FileEngine(policy);
  const server = new McpServer({ name: "local-mcp-manager", version: "0.3.0" });

  const log = async (tool: ToolName, rootId: string | undefined, status: "allowed" | "denied" | "error") => {
    try { await appendAuditEvent({ tool, rootId, result: status }); }
    catch (error) { console.error("[local-mcp-manager] Audit unavailable:", error); }
  };

  const guard = async (
    tool: ToolName, rootId: string | undefined, operation: () => Promise<unknown> | unknown,
  ) => {
    try {
      const value = await operation();
      await log(tool, rootId, "allowed");
      return result(value);
    } catch (error) {
      await log(tool, rootId,
        error instanceof FoundationError && error.code === "ACCESS_DENIED" ? "denied" : "error");
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[local-mcp-manager] Tool error:", message);
      return {
        content: [{ type: "text" as const, text: "Request failed: " + message }],
        isError: true,
      };
    }
  };

  server.registerTool("list_roots", {
    description: "List only the folders explicitly approved by this computer's owner.",
    inputSchema: z.object({}),
  }, async () => guard("list_roots", undefined, () => files.listRoots()));

  server.registerTool("list_files", {
    description: "List visible files in an approved folder.",
    inputSchema: z.object({
      rootId: z.string().min(1),
      folder: z.string().max(500).default("."),
    }),
  }, async ({ rootId, folder }) => guard("list_files", rootId, () => files.listFiles(rootId, folder)));

  server.registerTool("read_file", {
    description: "Read one small UTF-8 text file from an approved root.",
    inputSchema: z.object({
      rootId: z.string().min(1),
      file: z.string().min(1).max(500),
    }),
  }, async ({ rootId, file }) => guard("read_file", rootId, () => files.readFile(rootId, file)));

  server.registerTool("search_files", {
    description: "Search visible file and folder names within an approved root.",
    inputSchema: z.object({
      rootId: z.string().min(1),
      query: z.string().min(1).max(100),
      folder: z.string().max(500).default("."),
      depth: z.number().int().min(0).max(5).default(3),
    }),
  }, async ({ rootId, query, folder, depth }) =>
    guard("search_files", rootId, () => files.searchFiles(rootId, query, folder, depth)));

  server.registerTool("file_info", {
    description: "Get metadata for an authorized file or directory.",
    inputSchema: z.object({
      rootId: z.string().min(1),
      item: z.string().min(1).max(500),
    }),
  }, async ({ rootId, item }) => guard("file_info", rootId, () => files.fileInfo(rootId, item)));

  // serveStdio returns a handle (not a Promise). The factory is synchronous.
  // A desktop client launches one independent process for each connection.
  serveStdio(() => server, {
    onerror: error => console.error("[local-mcp-manager] Transport:", error),
  });
}

void main().catch(error => {
  console.error("[local-mcp-manager] Failed to start local MCP:", error);
  process.exitCode = 1;
});
