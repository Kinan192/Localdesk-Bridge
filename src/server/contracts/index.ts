import { z } from "zod";
export { FoundationError } from "./errors.ts";

// Stable public MCP identifiers. Never let clients invent executable tool names.
export const TOOL_NAMES = [
  "list_roots", "list_files", "read_file", "search_files", "file_info",
  "create_directory", "write_file", "edit_file", "rename_file", "delete_file",
] as const;

export const READ_TOOLS = TOOL_NAMES.slice(0, 5);
export const MUTATION_TOOLS = TOOL_NAMES.slice(5);
export const ToolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const AccessSchema = z.enum(["read", "write"]);
export type Access = z.infer<typeof AccessSchema>;
export const RootIdSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/, "Invalid root ID");
export const RelativePathSchema = z.string().min(1).max(500).refine(s => !s.includes("\0"), "NUL is forbidden");

export const RootConfigSchema = z.object({
  id: RootIdSchema,
  label: z.string().trim().min(1).max(80),
  absolutePath: z.string().min(1).max(4096).refine(s => !s.includes("\0"), "Invalid absolute path"),
  enabled: z.boolean(),
  access: AccessSchema,
}).strict();
export type RootConfig = z.infer<typeof RootConfigSchema>;

export const ToolSettingsSchema = z.object({
  list_roots: z.boolean(),
  list_files: z.boolean(),
  read_file: z.boolean(),
  search_files: z.boolean(),
  file_info: z.boolean(),
  create_directory: z.boolean(),
  write_file: z.boolean(),
  edit_file: z.boolean(),
  rename_file: z.boolean(),
  delete_file: z.boolean(),
}).strict();
export type ToolSettings = z.infer<typeof ToolSettingsSchema>;

export const PolicySchema = z.object({
  version: z.literal(1),
  roots: z.array(RootConfigSchema).max(50),
  tools: ToolSettingsSchema,
}).strict().superRefine((policy, context) => {
  const ids = new Set<string>();
  for (const root of policy.roots) {
    if (ids.has(root.id)) {
      context.addIssue({ code: "custom", path: ["roots"], message: "Duplicate root ID: " + root.id });
    }
    ids.add(root.id);
  }
});
export type Policy = z.infer<typeof PolicySchema>;

export function defaultPolicy(): Policy {
  return {
    version: 1,
    roots: [],
    tools: {
      list_roots: true, list_files: true, read_file: true,
      search_files: true, file_info: true,
      create_directory: false, write_file: false,
      edit_file: false, rename_file: false, delete_file: false,
    },
  };
}

// Initial typed API contracts: implementation of Route Handlers is Phase 3.
export const CreateRootRequestSchema = RootConfigSchema.omit({ enabled: true }).extend({
  enabled: z.boolean().default(true),
});
export const PatchRootRequestSchema = RootConfigSchema.pick({
  label: true, enabled: true, access: true,
}).partial().strict();
export const PatchToolRequestSchema = z.object({
  enabled: z.boolean(),
}).strict();
export const ActivityQuerySchema = z.object({
  cursor: z.string().max(150).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  result: z.enum(["allowed", "denied", "error"]).optional(),
}).strict();
export const AgentStateSchema = z.enum(["stopped", "starting", "running", "stopping", "error"]);
export const AgentStatusSchema = z.object({
  state: AgentStateSchema,
  version: z.string(),
  pid: z.number().int().positive().nullable(),
  startedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
}).strict();
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export const AuditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  action: z.string(),
  tool: ToolNameSchema.optional(),
  rootId: RootIdSchema.optional(),
  result: z.enum(["allowed", "denied", "error"]),
  clientId: z.string().max(120).optional(),
}).strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;
