export type PageId = "overview" | "roots" | "tools" | "connections" | "activity" | "settings";
export type AccessLevel = "read" | "write";
export type Result = "Allowed" | "Denied" | "Error";
export type Platform = "chatgpt" | "claude-desktop" | "claude-code" | "claude-web";

export type FolderRoot = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  access: AccessLevel;
  color: string;
};

export type ToolEntry = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  kind: "read" | "write" | "danger";
};

export type EventEntry = {
  id: string;
  time: string;
  action: string;
  target: string;
  client: string;
  status: Result;
};

export type Preferences = {
  confirmations: boolean;
  analytics: boolean;
  notifications: boolean;
  compact: boolean;
};

// No artificial production folder permissions; actual policy comes from the owner-only API.
export const sampleRoots: FolderRoot[] = [];

export const sampleTools: ToolEntry[] = [
  { id: "list_roots", label: "List Roots", description: "View all approved folders and their permissions.", kind: "read", enabled: true },
  { id: "list_files", label: "List Files", description: "Browse files and directories in approved roots.", kind: "read", enabled: true },
  { id: "read_file", label: "Read File", description: "Read authorized text file contents.", kind: "read", enabled: true },
  { id: "search_files", label: "Search Files", description: "Find files or folders by name.", kind: "read", enabled: true },
  { id: "file_info", label: "File Info", description: "Inspect file size, type and metadata.", kind: "read", enabled: true },
  { id: "create_directory", label: "Create Directory", description: "Create a new folder in a writable root.", kind: "write", enabled: false },
  { id: "write_file", label: "Write File", description: "Create a file without overwriting existing content.", kind: "write", enabled: false },
  { id: "edit_file", label: "Edit File", description: "Replace specific text with validation.", kind: "write", enabled: false },
  { id: "rename_file", label: "Rename File", description: "Rename existing files safely.", kind: "write", enabled: false },
  { id: "delete_file", label: "Delete File", description: "Delete files with explicit confirmation.", kind: "danger", enabled: false },
];

// Never display fabricated MCP activity in a production workspace.
export const sampleEvents: EventEntry[] = [];

export const defaultPrefs: Preferences = {
  confirmations: true,
  analytics: true,
  notifications: false,
  compact: false,
};

export const clientGuides: Record<Platform, { title: string; subtitle: string; steps: string[]; mode: string }> = {
  chatgpt: {
    title: "ChatGPT",
    subtitle: "Use MCP securely in ChatGPT on the web.",
    mode: "Remote MCP · HTTPS required",
    steps: [
      "Start the protected MCP listener and dedicated Cloudflare Tunnel from Setup Center.",
      "Configure an authenticated HTTPS endpoint or a supported tunnel.",
      "Add the endpoint from your ChatGPT MCP / plugin settings.",
      "Authorize access and test list_roots.",
    ],
  },
  "claude-desktop": {
    title: "Claude Desktop",
    subtitle: "Local MCP for your own computer.",
    mode: "Local MCP · stdio",
    steps: [
      "Install project dependencies with npm install.",
      "Select allowed folders in File Access.",
      "Copy the local MCP config from the AI Connections wizard.",
      "Restart Claude Desktop and verify the tools are visible.",
    ],
  },
  "claude-code": {
    title: "Claude Code",
    subtitle: "Run tools with a local MCP configuration.",
    mode: "Local MCP · stdio",
    steps: [
      "Install project dependencies with npm install.",
      "Open the Connections setup wizard.",
      "Add the generated MCP config to Claude Code.",
      "Verify available tools and test an approved folder.",
    ],
  },
  "claude-web": {
    title: "Claude Web",
    subtitle: "Connect through an authenticated remote MCP server.",
    mode: "Remote MCP · HTTPS required",
    steps: [
      "Start the protected Remote MCP listener and dedicated Cloudflare Tunnel.",
      "Create a protected remote HTTPS endpoint.",
      "Register the custom connector in Claude settings.",
      "Complete Cloudflare Access OAuth, then test list_roots and read_file on an approved folder.",
    ],
  },
};
