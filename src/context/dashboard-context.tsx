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
  const [toastTone, setToastTone] = useState<"success" | "warning" | "error">("success");
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
      // Display the actual server-authorized state for both Read and Write.
      // Tool availability is enforced by the owner policy API and MCP server.
      enabled: policy.tools[tool.id] === true,
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

  function normalizedFolderPath(value: string): string {
    return value.trim().replace(/\/+$/, "") || "/";
  }

  function policyMatchesChange(policy: RemotePolicy, method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>): boolean {
    if (method === "PATCH" && body.type === "tool") {
      return typeof body.tool === "string" &&
        typeof body.enabled === "boolean" &&
        policy.tools[body.tool] === body.enabled;
    }
    if (method === "PATCH" && body.type === "root") {
      const root = policy.roots.find(item => item.id === body.id);
      return !!root &&
        (body.enabled === undefined || root.enabled === body.enabled) &&
        (body.access === undefined || root.access === body.access);
    }
    if (method === "DELETE") return !policy.roots.some(item => item.id === body.id);
    if (method === "POST") {
      return typeof body.absolutePath === "string" &&
        policy.roots.some(item =>
          normalizedFolderPath(item.absolutePath) === normalizedFolderPath(body.absolutePath as string) &&
          item.label === body.label &&
          (body.access === undefined || item.access === body.access));
    }
    return false;
  }

  function policySuccessNotification(method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>): { message: string; tone: "success" | "warning" } {
    if (method === "DELETE") {
      return { tone: "warning", message: "Akses folder dicabut dari MCP. Folder dan file asli di disk tidak dihapus." };
    }
    if (method === "POST") {
      return { tone: "success", message: "Folder berhasil ditambahkan ke daftar akses MCP." };
    }
    if (body.type === "tool") {
      return body.enabled
        ? { tone: "success", message: "Tool " + String(body.tool) + " berhasil diaktifkan." }
        : { tone: "warning", message: "Tool " + String(body.tool) + " dinonaktifkan." };
    }
    if (body.type === "root" && typeof body.enabled === "boolean" && body.enabled === false) {
      return { tone: "warning", message: "Akses folder dinonaktifkan. File asli tetap ada." };
    }
    if (body.type === "root" && body.access === "read") {
      return { tone: "warning", message: "Izin folder dibatasi menjadi Read Only." };
    }
    if (body.type === "root" && body.access === "write") {
      return { tone: "success", message: "Izin folder berhasil diperbarui menjadi Read & Write." };
    }
    if (body.type === "root" && body.enabled === true) {
      return { tone: "success", message: "Akses folder berhasil diaktifkan." };
    }
    return { tone: "success", message: "Perubahan izin berhasil disimpan." };
  }

  async function changePolicy(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    try {
      const updated = await policyRequest(method, body);
      if (!policyMatchesChange(updated, method, body)) {
        throw new Error("Server merespons sukses, tetapi izin yang diminta tidak tersimpan.");
      }
      // Verify the value on disk using a fresh owner-protected GET. This also
      // avoids displaying a success toast for a stale/inconsistent response.
      const persisted = await policyRequest("GET");
      applyPolicy(persisted);
      if (!policyMatchesChange(persisted, method, body)) {
        throw new Error("Status di server tidak sesuai setelah disimpan. Periksa proses LocalDesk yang aktif.");
      }
      const notice = policySuccessNotification(method, body);
      notify(notice.message, notice.tone);
      return true;
    } catch (error) {
      // Refresh the actual server state even if one request failed.
      try { applyPolicy(await policyRequest("GET")); } catch { /* Keep last trusted state. */ }
      notify("Gagal memperbarui izin: " + (error instanceof Error ? error.message : "Kesalahan backend."), "error");
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

  const notify = (message: string, tone: "success" | "warning" | "error" = "success") => {
    setToastTone(tone);
    setToast(message);
  };
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
    if (backendState !== "ready") return notify("Backend belum terhubung. Perubahan tidak dapat disimpan.", "error");
    if (change.access === "read" || change.access === "write") {
      await changePolicy("PATCH", { type: "root", id, access: change.access });
    } else if (typeof change.enabled === "boolean") {
      await changePolicy("PATCH", { type: "root", id, enabled: change.enabled });
    }
  };

  const removeRoot = async (id: string) => {
    if (backendState !== "ready") return notify("Backend belum terhubung.", "error");
    const root = roots.find(item => item.id === id);
    if (!root) return notify("Folder tidak ditemukan dalam daftar akses.", "error");
    if (!window.confirm(
      'Cabut akses MCP untuk "' + root.name + '"? Folder dan file asli di disk TIDAK akan dihapus.'
    )) return;
    await changePolicy("DELETE", { id });
  };

  const updateTool = async (id: string, enabled: boolean) => {
    if (backendState !== "ready") return notify("Backend belum terhubung.", "error");
    const tool = tools.find(item => item.id === id);
    if (!tool) return notify("Tool tidak ditemukan.", "error");
    await changePolicy("PATCH", { type: "tool", tool: id, enabled });
  };
  const setPreference = (key: keyof Preferences, value: boolean) => setPrefs(current => ({ ...current, [key]: value }));

  async function restoreReadTools() {
    if (backendState !== "ready") return notify("Backend belum terhubung.", "error");
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
      notify("Gagal mengaktifkan tool Read: " + (error instanceof Error ? error.message : "Kesalahan tidak diketahui."), "error");
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
    if (folderAccess === "write" && !window.confirm(
      "Grant AI Read & Write permission for this folder? This includes creating and editing files."
    )) return;
    // Add Folder is also an explicit owner permission choice. If the folder
    // already exists in the allowlist, update that exact entry instead of
    // trying to POST a duplicate (which the server correctly rejects).
    const normalize = (value: string) => value.trim().replace(/\/+$/, "") || "/";
    let saved = false;
    let reused = false;
    try {
      const current = await policyRequest("GET");
      const existing = current.roots.find(root =>
        normalize(root.absolutePath) === normalize(absolutePath));
      if (existing) {
        reused = true;
        saved = existing.access === folderAccess && existing.enabled
          ? true
          : await changePolicy("PATCH", {
              type: "root", id: existing.id, access: folderAccess, enabled: true,
            });
      } else {
        saved = await changePolicy("POST", { label, absolutePath, access: folderAccess });
      }
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Cannot verify approved folders.");
      return;
    }
    if (!saved) {
      setFolderError(reused
        ? "Could not update this folder's permission. Check the notification for details."
        : "Folder not saved. Check the notification for details.");
      return;
    }
    if (reused) notify("Folder sudah terdaftar. Izin folder tersebut sudah sesuai, tanpa membuat duplikat.", "warning");
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
    catch { notify("Izin clipboard ditolak. Salin teks secara manual.", "error"); }
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


  return {page,setPage,mobileNav,setMobileNav,collapsed,setCollapsed,roots,setRoots,tools,setTools,events,setEvents,prefs,setPrefs,agentRunning,setAgentRunning,toast,setToast,toastTone,folderModal,setFolderModal,folderName,setFolderName,folderPath,setFolderPath,folderAccess,setFolderAccess,folderError,setFolderError,guide,setGuide,welcome,setWelcome,welcomeStep,setWelcomeStep,onboardingOpen,setOnboardingOpen,toolQuery,setToolQuery,toolFilter,setToolFilter,activityQuery,setActivityQuery,activityFilter,setActivityFilter,openPage,notify,activeRoots,activeTools,canWrite,filteredTools,filteredEvents,updateRoot,removeRoot,updateTool,restoreReadTools,setPreference,addFolder,resetDemo,copyText,exportCsv,toggleAgentDemo,backendState,backendError,activityState,activityError,refreshActivity};
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
