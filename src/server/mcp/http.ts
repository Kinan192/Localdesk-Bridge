import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import * as z from "zod/v4";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { FoundationError, type ToolName } from "../contracts/index.ts";
import { PolicyEngine } from "../access/index.ts";
import { FileEngine } from "../files/index.ts";
import { authorizedMutation, writeBackendAvailable, type WriteOperation } from "../files/secure-write.ts";
import { JsonPolicyRepository } from "../storage/index.ts";
import { appendAuditEvent } from "../audit/index.ts";
import { createAccessVerifier } from "./access-auth.ts";
import { remoteRequestError } from "./remote-config.ts";
import { CloudflareSettingsRepository, resolveCloudflareConfig } from "../cloudflare/index.ts";

/**
 * Remote MCP uses its own loopback-only listener, NEVER the Next.js admin port.
 *
 * Must be deployed behind Cloudflare Tunnel + Access Managed OAuth.
 * The origin also verifies every signed Cf-Access-Jwt-Assertion (fail closed).
 * Only five read-only tools are exposed.
 */
async function start() {
  // Required values: no remote listener is created until all are valid.
  // Construct a dedicated shape rather than passing Next.js-augmented
  // NodeJS.ProcessEnv (its required NODE_ENV causes TS2559 on weak types).
  const config = await resolveCloudflareConfig({
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
    CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
    MCP_PUBLIC_HOSTNAME: process.env.MCP_PUBLIC_HOSTNAME,
    MCP_HTTP_PORT: process.env.MCP_HTTP_PORT,
  }, new CloudflareSettingsRepository());
  const verifyAccess = createAccessVerifier(config);
  const stateDir = process.env.LOCAL_MCP_STATE_DIR?.trim() ||
    path.join(os.homedir(), process.platform === "win32"
      ? "AppData/Local/LocalMCPManager" : ".config/local-mcp-manager");
  const repository = new JsonPolicyRepository(stateDir);

  async function tools(): Promise<FileEngine> {
    // Reload on every call: revoking a folder/tool in the dashboard is
    // effective for the next request, without restarting the HTTP server.
    return new FileEngine(await PolicyEngine.create(await repository.load()));
  }
  async function writeOperation(rootId: string, intent: WriteOperation): Promise<unknown> {
    // Policy is loaded afresh for every tool call, including revocations.
    const policy = await PolicyEngine.create(await repository.load());
    // guarded() records the actual outcome once. Logging "allowed" here
    // would incorrectly claim success before policy and filesystem checks.
    return authorizedMutation(policy, rootId, intent);
  }
  async function record(tool: ToolName, rootId: string | undefined, result: "allowed" | "denied" | "error") {
    try { await appendAuditEvent({ tool, rootId, result, clientId: "remote-http" }); }
    catch (error) { console.error("[remote-mcp] Audit warning:", error); }
  }
  async function guarded(tool: ToolName, rootId: string | undefined, operation: () => Promise<unknown>) {
    try {
      const value = await operation();
      await record(tool, rootId, "allowed");
      return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
    } catch (error) {
      await record(tool, rootId, error instanceof FoundationError && error.code === "ACCESS_DENIED" ? "denied" : "error");
      // No absolute path/file content in an error response.
      const message = error instanceof FoundationError ? error.message : "File operation unavailable";
      console.error("[remote-mcp] Tool failed:", error instanceof Error ? error.name : "Unknown error");
      return { content: [{ type: "text" as const, text: "Request failed: " + message }], isError: true };
    }
  }

  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "local-mcp-manager-remote", version: "0.4.0" });
    server.registerTool("list_roots", {
      description: "List approved folders, never arbitrary files.",
      inputSchema: z.object({}),
    }, async () => guarded("list_roots", undefined, async () => (await tools()).listRoots()));

    server.registerTool("list_files", {
      description: "List visible files in an approved folder.",
      inputSchema: z.object({ rootId: z.string().min(1), folder: z.string().max(500).default(".") }),
    }, async ({ rootId, folder }) => guarded("list_files", rootId, async () =>
      (await tools()).listFiles(rootId, folder)));

    server.registerTool("read_file", {
      description: "Read a small UTF-8 text file from an approved folder.",
      inputSchema: z.object({ rootId: z.string().min(1), file: z.string().min(1).max(500) }),
    }, async ({ rootId, file }) => guarded("read_file", rootId, async () =>
      (await tools()).readFile(rootId, file)));

    server.registerTool("search_files", {
      description: "Find visible files by name, in an approved root.",
      inputSchema: z.object({
        rootId: z.string().min(1), query: z.string().min(1).max(100),
        folder: z.string().max(500).default("."),
        depth: z.number().int().min(0).max(5).default(3),
      }),
    }, async ({ rootId, query, folder, depth }) => guarded("search_files", rootId, async () =>
      (await tools()).searchFiles(rootId, query, folder, depth)));

    server.registerTool("file_info", {
      description: "Get metadata for a file or folder inside an approved root.",
      inputSchema: z.object({ rootId: z.string().min(1), item: z.string().min(1).max(500) }),
    }, async ({ rootId, item }) => guarded("file_info", rootId, async () =>
      (await tools()).fileInfo(rootId, item)));

    // Write is never registered on an unsupported host. Authorization is
    // checked for each operation against the latest owner-approved folder.
    if (writeBackendAvailable()) {
      server.registerTool("create_directory", {
        description: "Create one directory inside a Read & Write approved root.",
        inputSchema: z.object({ rootId: z.string().min(1), folder: z.string().min(1).max(500) }),
      }, async ({ rootId, folder }) => guarded("create_directory", rootId,
        () => writeOperation(rootId, { tool: "create_directory", path: folder })));

      server.registerTool("write_file", {
        description: "Create a new UTF-8 text file without overwriting.",
        inputSchema: z.object({ rootId: z.string().min(1),
          file: z.string().min(1).max(500), content: z.string().max(65536) }),
      }, async ({ rootId, file, content }) => guarded("write_file", rootId,
        () => writeOperation(rootId, { tool: "write_file", path: file, content })));

      server.registerTool("edit_file", {
        description: "Replace a text file if expected SHA-256 matches its current content.",
        inputSchema: z.object({ rootId: z.string().min(1),
          file: z.string().min(1).max(500), content: z.string().max(65536),
          expectedSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
      }, async ({ rootId, file, content, expectedSha256 }) => guarded("edit_file", rootId,
        () => writeOperation(rootId, { tool: "edit_file", path: file, content, expectedSha256 })));

      server.registerTool("rename_file", {
        description: "Rename an approved text file only when the destination does not exist.",
        inputSchema: z.object({ rootId: z.string().min(1),
          from: z.string().min(1).max(500), to: z.string().min(1).max(500) }),
      }, async ({ rootId, from, to }) => guarded("rename_file", rootId,
        () => writeOperation(rootId, { tool: "rename_file", path: from, destination: to })));

      server.registerTool("delete_file", {
        description: "Request local owner approval to delete one text file. Call again with the approved ID to execute.",
        inputSchema: z.object({ rootId: z.string().min(1),
          file: z.string().min(1).max(500), approvalId: z.string().uuid().optional() }),
      }, async ({ rootId, file, approvalId }) => guarded("delete_file", rootId,
        () => writeOperation(rootId, { tool: "delete_file", path: file, approval: approvalId })));
    }
    return server;
  }, { responseMode: "json" });

  const processMcp = toNodeHandler(handler);
  const server = createServer(async (req, res) => {
    const pathname = (req.url || "").split("?")[0];
    const host = req.headers.host;
    const origin = req.headers.origin;
    const rejected = remoteRequestError(req.method, pathname, host, origin, config);
    if (rejected) {
      res.writeHead(rejected.status, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end(rejected.message);
      return;
    }
    const length = req.headers["content-length"];
    // Fail closed on request streaming of unknown size. The read-only alpha
    // accepts only bounded MCP POST bodies with an explicit Content-Length.
    if (req.method === "POST" && (!length || !/^\d+$/.test(length))) {
      res.writeHead(411, { "Cache-Control": "no-store" });
      res.end("Content-Length required");
      return;
    }
    if (length && Number(length) > 65536) {
      res.writeHead(413, { "Cache-Control": "no-store" });
      res.end("Request too large");
      return;
    }

    // Ignore all claimed identities unless the JWT is cryptographically verified.
    try {
      await verifyAccess(req.headers["cf-access-jwt-assertion"]);
    } catch {
      res.writeHead(401, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain",
        "WWW-Authenticate": 'Bearer realm="Cloudflare Access"',
      });
      res.end("Cloudflare Access authentication required");
      return;
    }
    try {
      await processMcp(req, res);
    } catch (error) {
      console.error("[remote-mcp] Request failed:", error instanceof Error ? error.name : "Unknown error");
      if (!res.headersSent) res.writeHead(500, { "Cache-Control": "no-store" });
      res.end();
    }
  });

  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  process.on("SIGTERM", () => { server.close(); void handler.close(); });
  process.on("SIGINT", () => { server.close(); void handler.close(); });
  server.listen(config.port, "127.0.0.1", () => {
    console.error("[remote-mcp] Listening on 127.0.0.1:" + config.port + "/mcp (Access JWT required)");
  });
}

void start().catch(error => {
  console.error("[remote-mcp] Startup refused:", error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
});
