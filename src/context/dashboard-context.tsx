"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { menu } from "@/config/navigation";
import {
  defaultPrefs, sampleTools,
  type EventEntry, type FolderRoot, type PageId, type Platform,
  type Preferences, type ToolEntry,
} from "@/lib/demo";

type RemotePolicy = {
  version: 1;
  roots: Array<{
    id: string;
    label: string;
    absolutePath: string;
    access: "read" | "write";
    enabled: boolean;
  }>;
  tools: Record<string, boolean>;
};

async function policyRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>,
): Promise<RemotePolicy> {
  const response = await fetch("/api/local/policy", {
    method,
    cache: "no-store",
    headers: {
      ...(method === "GET" ? {} : {
        "content-type": "application/json",
        "x-local-mcp-action": "dashboard",
      }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Local backend request failed.");
  }
  return data.policy as RemotePolicy;
}

// Demo-only state (charts, agent simulation) and real local policy (roots/tools).
// All filesystem permissions remain server-side; browser state is not authorization.
function useDashboardState() {
  const [page, setPage] = useState<PageId>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [roots, setRoots] = useState<FolderRoot[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>(sampleTools);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [activityState, setActivityState] = useState<"loading" | "ready" | "error">("loading");
  const [activityError, setActivityError] = useState("");
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [agentRunning, setAgentRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [backendState, setBackendState] = useState<"loading" | "ready" | "error">("loading");
  const [backendError, setBackendError] = useState("");
  const [toast, setToast] = useState("");
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderAccess, setFolderAccess] = useState<"read" | "write">("read");
  const [folderError, setFolderError] = useState("");
  const [guide, setGuide] = useState<Platform | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(0);
  const [toolQuery, setToolQuery] = useState("");
  const [toolFilter, setToolFilter] = useState<"all" | "read" | "write">("all");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "Allowed" | "Denied" | "Error">("all");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("lmm-dashboard-demo-v1");
      if (raw) {
        const stored = JSON.parse(raw) as Partial<{ roots: FolderRoot[]; tools: ToolEntry[]; prefs: Preferences; agentRunning: boolean }>;
        if (stored.prefs && typeof stored.prefs === "object") setPrefs({ ...defaultPrefs, ...stored.prefs });
        if (typeof stored.agentRunning === "boolean") setAgentRunning(stored.agentRunning);
      }
      const hash = window.location.hash.replace("#", "") as PageId;
      if (menu.some(item => item.id === hash)) setPage(hash);
    } catch { /* Demo continues if localStorage is disabled. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem("lmm-dashboard-demo-v1", JSON.stringify({ prefs, agentRunning })); }
    catch { /* Browser storage may be unavailable in private mode. */ }
  }, [hydrated, prefs, agentRunning]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4300);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function applyPolicy(policy: RemotePolicy) {
    setRoots(policy.roots.map(root => ({
      id: root.id,
      name: root.label,
      path: root.absolutePath,
      enabled: root.enabled,
      access: root.access,
      color: "mint",
    })));
    setTools(sampleTools.map(tool => ({
      ...tool,
      enabled: tool.kind === "read" ? policy.tools[tool.id] === true : false,
    })));
    setBackendState("ready");
    setBackendError("");
  }

  useEffect(() => {
    let canceled = false;
    policyRequest().then(policy => {
      if (!canceled) applyPolicy(policy);
    }).catch(error => {
      if (!canceled) {
        setBackendState("error");
        setBackendError(error instanceof Error ? error.message : "Backend unavailable.");
      }
    });
    return () => { canceled = true; };
  }, []);

  async function changePolicy(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    try {
      const policy = await policyRequest(method, body);
      applyPolicy(policy);
      notify("Local policy saved. MCP changes take effect on the next client connection.");
      return true;
    } catch (error) {
      notify("Failed to save: " + (error instanceof Error ? error.message : "Unknown backend error"));
      return false;
    }
  }

  async function refreshActivity(): Promise<void> {
    try {
      const response = await fetch("/api/local/activity?limit=200", { cache: "no-store" });
      const payload = await response.json() as {
        events?: Array<{
          id: string; timestamp: string; action: string; rootId?: string;
          result: "allowed" | "denied" | "error"; clientId?: string;
        }>;
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.events)) {
        throw new Error(payload.error || "Cannot load local activity.");
      }
      setEvents(payload.events.map<EventEntry>(event => ({
        id: event.id,
        time: new Date(event.timestamp).toLocaleString("id-ID", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        }),
        action: event.action,
        target: event.rootId ? "Root: " + event.rootId : "Approved roots",
        client: event.clientId === "remote-http" ? "Remote MCP" : "Local MCP",
        status: event.result === "allowed" ? "Allowed" : event.result === "denied" ? "Denied" : "Error",
      })));
      setActivityState("ready");
      setActivityError("");
    } catch (error) {
      setActivityState("error");
      setActivityError(error instanceof Error ? error.message : "Local activity unavailable.");
    }
  }

  useEffect(() => {
    if (page === "overview" || page === "activity") void refreshActivity();
  }, [page]);

  const openPage = (id: PageId) => {
    setPage(id);
    setMobileNav(false);
    if (typeof window !== "undefined") window.history.replaceState(null, "", "#" + id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const notify = (message: string) => setToast(message);
  const activeRoots = roots.filter(item => item.enabled).length;
  const activeTools = tools.filter(item => item.enabled).length;
  const canWrite = roots.filter(item => item.enabled && item.access === "write").length;
  const filteredTools = useMemo(() => tools.filter(item => {
    const typeMatches = toolFilter === "all" || (toolFilter === "read" ? item.kind === "read" : item.kind !== "read");
    return typeMatches && (item.id + " " + item.description + " " + item.label).toLowerCase().includes(toolQuery.toLowerCase());
  }), [tools, toolFilter, toolQuery]);
  const filteredEvents = useMemo(() => events.filter(item => {
    return (activityFilter === "all" || item.status === activityFilter) &&
      (item.action + " " + item.target + " " + item.client + " " + item.status).toLowerCase().includes(activityQuery.toLowerCase());
  }), [events, activityFilter, activityQuery]);

  const updateRoot = async (id: string, change: Partial<FolderRoot>) => {
    if (backendState !== "ready") return notify("Backend not connected. Changes are disabled.");
    if (change.access && change.access !== "read") return notify("Write access is not available in the read-only alpha.");
    if (typeof change.enabled === "boolean") {
      await changePolicy("PATCH", { type: "root", id, enabled: change.enabled });
    }
  };

  const removeRoot = async (id: string) => {
    if (backendState !== "ready") return notify("Backend not connected.");
    if (!window.confirm("Revoke this folder from the local MCP allowlist?")) return;
    await changePolicy("DELETE", { id });
  };

  const updateTool = async (id: string, enabled: boolean) => {
    if (backendState !== "ready") return notify("Backend not connected.");
    const tool = tools.find(item => item.id === id);
    if (!tool || tool.kind !== "read") return notify("Write tools are disabled in this alpha.");
    await changePolicy("PATCH", { type: "tool", tool: id, enabled });
  };
  const setPreference = (key: keyof Preferences, value: boolean) => setPrefs(current => ({ ...current, [key]: value }));

  async function restoreReadTools() {
    if (backendState !== "ready") return notify("Backend not connected.");
    try {
      // Each update is validated again by the server.
      for (const tool of sampleTools.filter(item => item.kind === "read")) {
        const policy = await policyRequest("PATCH", {
          type: "tool", tool: tool.id, enabled: true,
        });
        applyPolicy(policy);
      }
      notify("All five read-only tools are now enabled.");
    } catch (error) {
      notify("Could not restore tools: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }

  async function addFolder() {
    if (backendState !== "ready") {
      setFolderError("Local backend is not connected.");
      return;
    }
    const label = folderName.trim();
    const absolutePath = folderPath.trim();
    if (!label || !absolutePath) {
      setFolderError("Folder name and absolute path are required.");
      return;
    }
    if (folderAccess !== "read") {
      setFolderError("Only read-only roots can be added in this release.");
      return;
    }
    const saved = await changePolicy("POST", { label, absolutePath });
    if (!saved) {
      setFolderError("Folder not saved. Check the notification for details.");
      return;
    }
    setFolderModal(false);
    setFolderName("");
    setFolderPath("");
    setFolderAccess("read");
    setFolderError("");
  }

  function resetDemo() {
    if (!window.confirm("Reset the demo configuration and sample activity?")) return;
    setPrefs(defaultPrefs);
    setAgentRunning(false);
    notify("Browser preferences restored. Real MCP activity logs and permissions were not changed.");
  }

  async function copyText(value: string, success: string) {
    try { await navigator.clipboard.writeText(value); notify(success); }
    catch { notify("Clipboard permission denied. Copy directly from the page."); }
  }

  function exportCsv() {
    const escape = (value: string) => {
      let safe = value;
      if (/^\s*[=+\-@]/.test(safe)) safe = "'" + safe;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const rows = [["Time", "Action", "Target", "Client", "Result"], ...filteredEvents.map(item => [item.time, item.action, item.target, item.client, item.status])];
    const data = "\uFEFF" + rows.map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "local-mcp-demo-activity.csv"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    notify("Sample activity exported as CSV.");
  }

  function toggleAgentDemo() {
    setAgentRunning(value => !value);
    notify(agentRunning ? "Simulated agent stopped." : "Simulated agent started. No actual service is running.");
  }


  return {page,setPage,mobileNav,setMobileNav,collapsed,setCollapsed,roots,setRoots,tools,setTools,events,setEvents,prefs,setPrefs,agentRunning,setAgentRunning,toast,setToast,folderModal,setFolderModal,folderName,setFolderName,folderPath,setFolderPath,folderAccess,setFolderAccess,folderError,setFolderError,guide,setGuide,welcome,setWelcome,welcomeStep,setWelcomeStep,onboardingOpen,setOnboardingOpen,toolQuery,setToolQuery,toolFilter,setToolFilter,activityQuery,setActivityQuery,activityFilter,setActivityFilter,openPage,notify,activeRoots,activeTools,canWrite,filteredTools,filteredEvents,updateRoot,removeRoot,updateTool,restoreReadTools,setPreference,addFolder,resetDemo,copyText,exportCsv,toggleAgentDemo,backendState,backendError,activityState,activityError,refreshActivity};
}
export type DashboardState = ReturnType<typeof useDashboardState>;
const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const state = useDashboardState();
  return <DashboardContext.Provider value={state}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardState {
  const state = useContext(DashboardContext);
  if (!state) throw new Error("useDashboard must be used inside DashboardProvider");
  return state;
}
