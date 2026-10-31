"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  Cloud, Code2, Command, Copy, Download, ExternalLink, FileCheck2, FileClock,
  FilePlus2, FileSearch, FileText, Folder, FolderClosed, FolderPlus, HardDrive,
  Info, Laptop, LayoutDashboard, Lock, LockKeyhole, Menu, Monitor, MoreHorizontal,
  Pause, Play, Plus, Power, RefreshCw, RotateCcw, Search, Server, Settings2,
  Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Terminal,
  Trash2, Wrench, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  clientGuides, defaultPrefs, sampleEvents, sampleRoots, sampleTools,
  type EventEntry, type FolderRoot, type PageId, type Platform,
  type Preferences, type ToolEntry,
} from "@/lib/demo";

type NavItem = { id: PageId; label: string; icon: LucideIcon; group: "workspace" | "management" };
const menu: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "workspace" },
  { id: "roots", label: "File Access", icon: FolderClosed, group: "workspace" },
  { id: "tools", label: "MCP Tools", icon: Wrench, group: "workspace" },
  { id: "connections", label: "AI Connections", icon: Zap, group: "workspace" },
  { id: "activity", label: "Activity Logs", icon: Activity, group: "management" },
  { id: "settings", label: "Settings", icon: Settings2, group: "management" },
];
const pageInfo: Record<PageId, { title: string; eyebrow: string; description: string }> = {
  overview: { title: "Overview", eyebrow: "WORKSPACE OVERVIEW", description: "One place to manage your local AI workspace." },
  roots: { title: "File Access", eyebrow: "ACCESS CONTROL", description: "Decide which folders AI assistants are allowed to access." },
  tools: { title: "MCP Tools", eyebrow: "PERMISSION CENTER", description: "Choose which capabilities each connection may use." },
  connections: { title: "AI Connections", eyebrow: "CONNECT YOUR ASSISTANTS", description: "Connect local or remote AI clients through guided setup." },
  activity: { title: "Activity Logs", eyebrow: "LOCAL AUDIT TRAIL", description: "Explore sample requests and how your policies respond." },
  settings: { title: "Settings", eyebrow: "PREFERENCES & DEVICE", description: "Configure your personal workspace experience." },
};

function Tag({ children, kind = "neutral", dot = false }: { children: ReactNode; kind?: "neutral" | "success" | "warning" | "purple" | "blue"; dot?: boolean }) {
  return <span className={"tag tag-" + kind}>{dot && <span className="tag-dot" />}{children}</span>;
}
function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className={"toggle" + (checked ? " is-on" : "")} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
function PageTitle({ page, children }: { page: PageId; children?: ReactNode }) {
  const meta = pageInfo[page];
  return <div className="page-title-row"><div><p className="eyebrow">{meta.eyebrow}</p><h1>{meta.title}<span className="accent-period">.</span></h1><p className="page-description">{meta.description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={"panel " + className}>{children}</section>;
}
function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
function IconBubble({ icon: Icon, tone = "mint" }: { icon: LucideIcon; tone?: string }) {
  return <span className={"icon-bubble tone-" + tone}><Icon size={19} strokeWidth={1.8} /></span>;
}
function Modal({ title, subtitle, children, onClose, width = "normal" }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; width?: "normal" | "wide" }) {
  return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={"modal-card " + (width === "wide" ? "modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}
const pad = (n: number) => String(n).padStart(2, "0");

export default function Dashboard() {
  const [page, setPage] = useState<PageId>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [roots, setRoots] = useState<FolderRoot[]>(sampleRoots);
  const [tools, setTools] = useState<ToolEntry[]>(sampleTools);
  const [events, setEvents] = useState<EventEntry[]>(sampleEvents);
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [agentRunning, setAgentRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderAccess, setFolderAccess] = useState<"read" | "write">("read");
  const [folderError, setFolderError] = useState("");
  const [guide, setGuide] = useState<Platform | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(0);
  const [toolQuery, setToolQuery] = useState("");
  const [toolFilter, setToolFilter] = useState<"all" | "read" | "write">("all");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "Allowed" | "Denied" | "Error">("all");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("lmm-dashboard-demo-v1");
      if (raw) {
        const stored = JSON.parse(raw) as Partial<{ roots: FolderRoot[]; tools: ToolEntry[]; events: EventEntry[]; prefs: Preferences; agentRunning: boolean }>;
        if (Array.isArray(stored.roots)) setRoots(stored.roots);
        if (Array.isArray(stored.tools)) setTools(stored.tools);
        if (Array.isArray(stored.events)) setEvents(stored.events);
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
    try { window.localStorage.setItem("lmm-dashboard-demo-v1", JSON.stringify({ roots, tools, events, prefs, agentRunning })); }
    catch { /* Browser storage may be unavailable in private mode. */ }
  }, [hydrated, roots, tools, events, prefs, agentRunning]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4300);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

  const updateRoot = (id: string, change: Partial<FolderRoot>) => {
    setRoots(current => current.map(item => item.id === id ? { ...item, ...change } : item));
    notify("Demo folder permission updated in this browser only.");
  };
  const updateTool = (id: string, enabled: boolean) => {
    setTools(current => current.map(item => item.id === id ? { ...item, enabled } : item));
    notify("Demo tool permission updated. No real MCP agent was changed.");
  };
  const setPreference = (key: keyof Preferences, value: boolean) => setPrefs(current => ({ ...current, [key]: value }));

  function addFolder() {
    const name = folderName.trim();
    const path = folderPath.trim();
    if (!name || !path) { setFolderError("Name and folder path are required."); return; }
    if (!path.startsWith("/") && !path.startsWith("~/") && !/^[A-Za-z]:[\\/]/.test(path)) {
      setFolderError("Enter a full local path such as ~/Workspace or C:\\Users\\You\\Documents.");
      return;
    }
    if (roots.some(root => root.path.toLowerCase() === path.toLowerCase())) {
      setFolderError("This folder path is already in your demo list.");
      return;
    }
    setRoots(current => [...current, { id: "root-" + Date.now(), name, path, access: folderAccess, color: "mint", enabled: true }]);
    setFolderModal(false);
    setFolderName(""); setFolderPath(""); setFolderAccess("read"); setFolderError("");
    notify("Demo folder added. No local filesystem permission was granted.");
  }

  function resetDemo() {
    if (!window.confirm("Reset the demo configuration and sample activity?")) return;
    setRoots(sampleRoots);
    setTools(sampleTools);
    setEvents(sampleEvents);
    setPrefs(defaultPrefs);
    setAgentRunning(false);
    notify("Demo data restored.");
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

  function overview() {
    return <>
      <PageTitle page="overview">
        <button className="button button-secondary" onClick={() => setWelcome(true)}><BookOpen size={16} /> Setup guide</button>
        <button className="button button-primary" onClick={toggleAgentDemo}>{agentRunning ? <Pause size={16} /> : <Play size={16} />}{agentRunning ? "Stop demo agent" : "Start demo agent"}</button>
      </PageTitle>

      <div className="hero-panel">
        <div className="hero-copy">
          <div className="hero-kicker"><Sparkles size={14} /> YOUR LOCAL AI WORKSPACE</div>
          <h2>Your computer.<br /><span>Your control.</span></h2>
          <p>Connect your favorite AI tools to local files with clear permissions, visibility, and control. Start with your own workspace.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => openPage("connections")}>Explore connections <ArrowRight size={16} /></button>
            <button className="button button-hero-link" onClick={() => openPage("roots")}>Manage file access <ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbital orbital-one" /><div className="orbital orbital-two" />
          <span className="orbit-node orbit-node-one"><FolderClosed size={22} /></span>
          <span className="orbit-node orbit-node-two"><Code2 size={21} /></span>
          <span className="orbit-node orbit-node-three"><ShieldCheck size={20} /></span>
          <div className="orbit-center"><Laptop size={37} strokeWidth={1.5} /><span>YOUR DEVICE</span></div>
        </div>
      </div>

      <div className="demo-note"><Info size={17} /><div><strong>Frontend preview mode</strong><span>All counters, agent controls, connections, and logs below are simulated. No filesystem or MCP service is connected yet.</span></div><Tag kind="purple">PHASE 1</Tag></div>

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-top"><span>Agent status</span><IconBubble icon={Server} tone="mint" /></div><strong>{agentRunning ? "Simulated on" : "Not connected"}</strong><p><span className={"mini-dot " + (agentRunning ? "mint-dot" : "")} /> {agentRunning ? "Demo state only" : "Waiting for Phase 2"}</p></div>
        <div className="metric-card"><div className="metric-top"><span>Active folders</span><IconBubble icon={FolderClosed} tone="blue" /></div><strong>{pad(activeRoots)} <small>/ {pad(roots.length)}</small></strong><p>Configured in this browser</p></div>
        <div className="metric-card"><div className="metric-top"><span>Enabled tools</span><IconBubble icon={Wrench} tone="purple" /></div><strong>{pad(activeTools)} <small>/ 10</small></strong><p>Local demo permissions</p></div>
        <div className="metric-card"><div className="metric-top"><span>AI connections</span><IconBubble icon={Zap} tone="amber" /></div><strong>00 <small>/ 04</small></strong><p>No real clients connected</p></div>
      </div>

      <div className={"dashboard-columns" + (!prefs.analytics ? " no-analytics" : "")}>
        {prefs.analytics && <Panel className="analytics-panel">
          <PanelTitle title="Activity insights" subtitle="Illustrative request volume · last 7 days" action={<Tag kind="purple">SAMPLE DATA</Tag>} />
          <div className="chart-top"><div><span className="chart-total">1,284</span><span className="chart-context">demo requests</span></div><span className="trend"><ArrowUpRight size={14} /> +12.8%</span></div>
          <div className="chart"><div className="chart-grid"><span>240</span><span>160</span><span>80</span><span>0</span></div><div className="chart-bars">{[42,61,50,79,68,93,76].map((height, index) => <div className="chart-column" key={index}><div className="chart-bar-track"><div className={"chart-bar " + (index === 5 ? "is-highlight" : "")} style={{ height: height + "%" }} /></div><span>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}</span></div>)}</div></div>
        </Panel>}
        <Panel className="quick-panel">
          <PanelTitle title="Quick actions" subtitle="Explore your local-first setup" />
          <button className="quick-action" onClick={() => { setFolderError(""); setFolderModal(true); }}><IconBubble icon={FolderPlus} tone="mint" /><span><strong>Add a folder</strong><small>Choose an allowed workspace</small></span><ChevronRight size={17} /></button>
          <button className="quick-action" onClick={() => openPage("tools")}><IconBubble icon={SlidersHorizontal} tone="blue" /><span><strong>Configure tools</strong><small>Review your allowed capabilities</small></span><ChevronRight size={17} /></button>
          <button className="quick-action" onClick={() => openPage("connections")}><IconBubble icon={Zap} tone="purple" /><span><strong>Connect an AI assistant</strong><small>See guided setup options</small></span><ChevronRight size={17} /></button>
          <div className="quick-tip"><ShieldCheck size={18} /><span>Local-first by design. Your folders are never uploaded by this demo.</span></div>
        </Panel>
      </div>
      <Panel>
        <PanelTitle title="Recent activity" subtitle="Sample events — real activity logging comes with the agent" action={<button className="text-link" onClick={() => openPage("activity")}>View all activity <ArrowRight size={15} /></button>} />
        {activityTable(events.slice(0, 4))}
      </Panel>
    </>;
  }

  function activityTable(rows: EventEntry[]) {
    return <div className="table-scroll"><table className="activity-table"><thead><tr><th>EVENT</th><th>RESOURCE</th><th>CLIENT</th><th>RESULT</th><th>TIME</th></tr></thead><tbody>{rows.map(event => <tr key={event.id}><td><span className="table-icon"><FileText size={16} /></span><strong>{event.action}</strong></td><td className="resource-cell">{event.target}</td><td>{event.client}</td><td><Tag kind={event.status === "Allowed" ? "success" : event.status === "Denied" ? "warning" : "neutral"} dot>{event.status}</Tag></td><td className="time-cell">{event.time}</td></tr>)}</tbody></table>{!rows.length && <div className="empty-state">No events match the current filters.</div>}</div>;
  }

  function rootsPage() {
    return <>
      <PageTitle page="roots"><button className="button button-primary" onClick={() => { setFolderError(""); setFolderModal(true); }}><Plus size={17} /> Add folder</button></PageTitle>
      <div className="info-strip"><ShieldCheck size={19} /><div><strong>Explicit access only</strong><span>Only selected folders should be visible to AI tools. Real enforcement will be implemented in the local agent.</span></div></div>
      <div className="summary-strip"><div><span>Approved folders</span><strong>{activeRoots}</strong></div><div><span>Read / write folders</span><strong>{canWrite}</strong></div><div><span>Disabled folders</span><strong>{roots.length - activeRoots}</strong></div></div>
      <Panel>
        <PanelTitle title="Approved folders" subtitle="Demo folder allowlist · permissions saved in this browser" action={<Tag kind="purple">LOCAL DEMO</Tag>} />
        <div className="roots-list">{roots.map(root => <div className="folder-row" key={root.id}>
          <div className={"folder-symbol tone-" + root.color}><Folder size={23} strokeWidth={1.7} /></div>
          <div className="folder-details"><div className="folder-name-line"><strong>{root.name}</strong>{!root.enabled && <Tag>Disabled</Tag>}</div><span title={root.path}>{root.path}</span></div>
          <select className="permission-select" aria-label={"Access level for " + root.name} value={root.access} onChange={event => updateRoot(root.id, { access: event.target.value as "read" | "write" })}><option value="read">Read only</option><option value="write">Read & write</option></select>
          <Toggle checked={root.enabled} label={"Enable folder " + root.name} onChange={enabled => updateRoot(root.id, { enabled })} />
          <button className="icon-btn root-remove" aria-label={"Remove " + root.name} title="Remove demo folder" onClick={() => { setRoots(current => current.filter(item => item.id !== root.id)); notify("Demo folder removed. No local files were changed."); }}><Trash2 size={17} /></button>
        </div>)}</div>
        {roots.length === 0 && <div className="empty-state">No folders added. Choose Add folder to create a demo entry.</div>}
      </Panel>
      <div className="two-panels"><Panel><PanelTitle title="Access principles" /><div className="feature-line"><Lock size={19} /><div><strong>Default deny</strong><span>Files outside an approved root must be blocked.</span></div></div><div className="feature-line"><Shield size={19} /><div><strong>Read-only by default</strong><span>Write access should require explicit approval.</span></div></div><div className="feature-line"><FileCheck2 size={19} /><div><strong>Validate every request</strong><span>Permissions must be enforced by the agent, not the UI.</span></div></div></Panel><Panel className="next-phase"><div className="phase-icon"><Code2 size={23} /></div><h3>Folder picker comes next</h3><p>The production agent will support OS-aware folder picking and true filesystem validation. Adding folders here does not grant access to any real paths.</p><Tag kind="blue">PLANNED · PHASE 2</Tag></Panel></div>
    </>;
  }

  function toolsPage() {
    return <>
      <PageTitle page="tools"><button className="button button-secondary" onClick={() => { setTools(sampleTools); notify("Tool permissions reset to read-only defaults in demo."); }}><RotateCcw size={16} /> Restore defaults</button></PageTitle>
      <div className="tool-summary"><span className="tool-summary-icon"><Wrench size={19} /></span><div><strong>{activeTools} of 10 tools enabled</strong><p>Your MCP capabilities are designed to be individually controlled.</p></div><div className="progress-track"><div style={{ width: activeTools * 10 + "%" }} /></div><span className="progress-value">{activeTools * 10}%</span></div>
      <Panel>
        <div className="tools-controls"><div><h2>Tool permissions</h2><p>Enable or disable each capability in the preview.</p></div><div className="search-filter"><div className="searchbox"><Search size={16} /><input aria-label="Search tools" value={toolQuery} placeholder="Search tools..." onChange={event => setToolQuery(event.target.value)} /></div><select aria-label="Filter tools" className="filter-select" value={toolFilter} onChange={event => setToolFilter(event.target.value as "all" | "read" | "write")}><option value="all">All tools</option><option value="read">Read tools</option><option value="write">Write tools</option></select></div></div>
        <div className="tool-list">{filteredTools.map(tool => <div className="tool-item" key={tool.id}><div className={"tool-icon " + (tool.kind === "danger" ? "tone-rose" : tool.kind === "read" ? "tone-blue" : "tone-purple")}><Code2 size={19} /></div><div className="tool-description"><div className="tool-name-line"><strong>{tool.id}</strong><Tag kind={tool.kind === "danger" ? "warning" : tool.kind === "read" ? "blue" : "purple"}>{tool.kind === "danger" ? "Sensitive" : tool.kind === "read" ? "Read" : "Write"}</Tag></div><p>{tool.description}</p></div><Toggle label={"Enable MCP tool " + tool.id} checked={tool.enabled} onChange={value => updateTool(tool.id, value)} /></div>)}</div>
        {!filteredTools.length && <div className="empty-state">No tools found for that search.</div>}
      </Panel>
      <div className="info-strip warning-strip"><ShieldAlert size={19} /><div><strong>Demo permissions only</strong><span>Switches here do not affect the existing Arch MCP V4. Backend permission enforcement is a later milestone.</span></div></div>
    </>;
  }

  function connectionsPage() {
    const clients: { id: Platform; icon: LucideIcon; accent: string; badge: string; desc: string; category: string }[] = [
      { id: "chatgpt", icon: Sparkles, accent: "green", badge: "Remote", desc: "Give ChatGPT controlled access to your local files through a secure remote MCP connection.", category: "ChatGPT Web" },
      { id: "claude-desktop", icon: Laptop, accent: "orange", badge: "Local", desc: "Connect Claude Desktop with the agent on your own computer.", category: "Claude Desktop" },
      { id: "claude-code", icon: Terminal, accent: "purple", badge: "Local", desc: "Use MCP tools directly from Claude Code in the terminal.", category: "Claude Code" },
      { id: "claude-web", icon: Cloud, accent: "blue", badge: "Remote", desc: "Use an authenticated HTTPS endpoint from Claude in the browser.", category: "Claude Web" },
    ];
    return <>
      <PageTitle page="connections"><Tag kind="purple">4 integration guides</Tag></PageTitle>
      <div className="info-strip"><Info size={18} /><div><strong>Connection setup is not live yet</strong><span>Guides below describe the intended workflow. There is no active MCP endpoint or OAuth session in this frontend prototype.</span></div></div>
      <div className="connection-grid">{clients.map(client => <div className="connection-card" key={client.id}><div className="connection-top"><div className={"client-logo logo-" + client.accent}><client.icon size={27} /></div><Tag kind={client.badge === "Local" ? "blue" : "purple"}>{client.badge}</Tag></div><h2>{client.category}</h2><p>{client.desc}</p><div className="connection-bottom"><span><span className="inactive-dot" /> Not configured</span><button className="button button-secondary" onClick={() => setGuide(client.id)}>Setup guide <ArrowRight size={15} /></button></div></div>)}</div>
      <Panel className="connect-security"><PanelTitle title="Connection security" subtitle="Safe-by-default architecture" /><div className="security-cards"><div><IconBubble icon={LockKeyhole} tone="mint" /><strong>Your own credentials</strong><p>Every installation should use independent credentials and permissions.</p></div><div><IconBubble icon={ShieldCheck} tone="blue" /><strong>Only approved roots</strong><p>Each tool request will be checked by the local agent.</p></div><div><IconBubble icon={Cloud} tone="purple" /><strong>Optional remote access</strong><p>No VPS required for local mode; remote web clients need secure connectivity.</p></div></div></Panel>
    </>;
  }

  function activityPage() {
    return <>
      <PageTitle page="activity"><button className="button button-secondary" onClick={exportCsv}><Download size={16} /> Export CSV</button></PageTitle>
      <div className="metric-grid activity-metrics">
        <div className="metric-card"><span className="metric-label">Sample events</span><strong>{pad(events.length)}</strong><p>Illustrative data only</p></div>
        <div className="metric-card"><span className="metric-label">Allowed</span><strong className="color-mint">{pad(events.filter(item => item.status === "Allowed").length)}</strong><p>Sample permitted requests</p></div>
        <div className="metric-card"><span className="metric-label">Denied</span><strong className="color-amber">{pad(events.filter(item => item.status === "Denied").length)}</strong><p>Sample policy blocks</p></div>
        <div className="metric-card"><span className="metric-label">Errors</span><strong>{pad(events.filter(item => item.status === "Error").length)}</strong><p>Sample execution failures</p></div>
      </div>
      <Panel><div className="tools-controls"><div><h2>Request history</h2><p>No real file contents are recorded in this preview.</p></div><div className="search-filter"><div className="searchbox"><Search size={16} /><input aria-label="Search activity" value={activityQuery} placeholder="Search events..." onChange={event => setActivityQuery(event.target.value)} /></div><select className="filter-select" aria-label="Filter activity result" value={activityFilter} onChange={event => setActivityFilter(event.target.value as typeof activityFilter)}><option value="all">All results</option><option value="Allowed">Allowed</option><option value="Denied">Denied</option><option value="Error">Errors</option></select></div></div>{activityTable(filteredEvents)}<div className="table-footer"><span>Showing {filteredEvents.length} of {events.length} sample events</span><button className="text-link" onClick={() => { setEvents(sampleEvents); setActivityQuery(""); setActivityFilter("all"); notify("Sample activity has been restored."); }}><RefreshCw size={15} /> Reset sample data</button></div></Panel>
    </>;
  }

  function settingsPage() {
    return <>
      <PageTitle page="settings" />
      <div className="settings-layout"><Panel><PanelTitle title="Agent preferences" subtitle="Preview settings stored locally in the browser" />
        {[
          { key: "confirmations" as const, icon: ShieldCheck, title: "Confirm sensitive actions", description: "Show an approval step before write or delete requests (planned)." },
          { key: "notifications" as const, icon: Bell, title: "Activity notifications", description: "Get local notifications about future MCP events (planned)." },
          { key: "analytics" as const, icon: Activity, title: "Show activity analytics", description: "Display sample request volume on the overview page." },
          { key: "compact" as const, icon: SlidersHorizontal, title: "Compact layout", description: "Use tighter spacing across dashboard panels." },
        ].map(setting => <div className="setting-row" key={setting.key}><IconBubble icon={setting.icon} tone="blue" /><div><strong>{setting.title}</strong><p>{setting.description}</p></div><Toggle checked={prefs[setting.key]} label={setting.title} onChange={value => setPreference(setting.key, value)} /></div>)}
      </Panel>
      <div className="settings-side">
        <Panel><PanelTitle title="This installation" /><div className="device-info"><div className="device-illustration"><Monitor size={26} /></div><strong>Local preview</strong><Tag kind="purple">DEMO MODE</Tag></div><div className="device-details"><div><span>Project</span><strong>Local MCP Manager</strong></div><div><span>Release</span><strong>0.1.0 / Frontend</strong></div><div><span>Backend</span><strong>Not connected</strong></div><div><span>Dashboard</span><strong>localhost:3100</strong></div></div><button className="button button-secondary button-full" onClick={() => copyText(window.location.origin, "Dashboard URL copied.")}><Copy size={16} /> Copy dashboard URL</button></Panel>
        <Panel className="danger-panel"><PanelTitle title="Demo data" subtitle="Reset browser-only settings and examples" /><p>Your actual files and existing Arch MCP project will not be affected.</p><button className="button button-danger" onClick={resetDemo}><RotateCcw size={16} /> Reset demo data</button></Panel>
      </div></div>
    </>;
  }

  function pageContent() {
    if (page === "overview") return overview();
    if (page === "roots") return rootsPage();
    if (page === "tools") return toolsPage();
    if (page === "connections") return connectionsPage();
    if (page === "activity") return activityPage();
    return settingsPage();
  }

  return <div className={"app-shell" + (collapsed ? " nav-collapsed" : "") + (prefs.compact ? " compact-layout" : "")}>
    {mobileNav && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={"app-sidebar" + (mobileNav ? " mobile-open" : "")}>
      <div className="sidebar-brand"><span className="brand-symbol"><Command size={24} strokeWidth={2.5} /></span><div className="brand-text"><strong>LOCAL<span>MCP</span></strong><small>MANAGER</small></div><button className="icon-btn collapse-button" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
      <div className="sidebar-workspace"><div className="workspace-icon"><Monitor size={20} /></div><span className="workspace-text"><strong>Personal workspace</strong><small>Local installation</small></span><ChevronDown size={15} className="workspace-chevron" /></div>
      <nav className="main-nav" aria-label="Main navigation">{(["workspace", "management"] as const).map(group => <div className="nav-group" key={group}><div className="nav-group-name">{group === "workspace" ? "WORKSPACE" : "MANAGE"}</div>{menu.filter(item => item.group === group).map(item => <button className={"nav-item" + (page === item.id ? " nav-active" : "")} key={item.id} onClick={() => openPage(item.id)} title={item.label}><item.icon size={19} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "connections" && <b className="nav-count">4</b>}</button>)}</div>)}</nav>
      <div className="sidebar-spacer" />
      <button className="sidebar-helper" onClick={() => setWelcome(true)}><span className="helper-icon"><CircleHelp size={20} /></span><span><strong>Getting started?</strong><small>Follow the setup guide</small></span><ArrowRight size={15} /></button>
      <div className="sidebar-bottom"><div className="avatar">LM</div><div className="avatar-copy"><strong>Local User</strong><small>Preview workspace</small></div><Tag kind="purple">DEMO</Tag></div>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{pageInfo[page].title}</strong></div></div><div className="topbar-right"><span className="topbar-demo"><span className="status-spark" /> Frontend demo</span><button className="topbar-help" onClick={() => setWelcome(true)}><CircleHelp size={18} /></button><span className="topbar-divider" /><span className="top-avatar">LM</span></div></header>
      <main className="main-view">{pageContent()}</main>
      <footer className="app-footer"><span>Local MCP Manager · Frontend Preview v0.1</span><span><ShieldCheck size={13} /> Private by design · No agent connected</span></footer>
    </div>

    {toast && <div className="toast" role="status"><CheckCircle2 size={19} /> <span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast("")}><X size={15} /></button></div>}

    {folderModal && <Modal title="Add a folder" subtitle="Frontend-only simulation — no files or permissions will be changed." onClose={() => setFolderModal(false)}>
      <form className="modal-form" onSubmit={event => { event.preventDefault(); addFolder(); }}>
        <label>Display name<input required value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Example: My Workspace" maxLength={45} /></label>
        <label>Folder path<input required value={folderPath} onChange={event => setFolderPath(event.target.value)} placeholder="~/Workspace or C:\Users\You\Documents" maxLength={260} /></label>
        <label>Access level<select value={folderAccess} onChange={event => setFolderAccess(event.target.value as "read" | "write")}><option value="read">Read only (recommended)</option><option value="write">Read and write</option></select></label>
        {folderError && <p className="input-error">{folderError}</p>}
        <div className="modal-info"><Info size={16} /> This entry is saved only in your browser. The real folder picker and permission checks come with the agent.</div>
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFolderModal(false)}>Cancel</button><button className="button button-primary" type="submit"><Plus size={16} /> Add demo folder</button></div>
      </form>
    </Modal>}

    {guide && <Modal title={clientGuides[guide].title + " setup"} subtitle={clientGuides[guide].subtitle} onClose={() => setGuide(null)}>
      <div className="guide-mode"><Info size={16} /><span>{clientGuides[guide].mode}</span><Tag kind="warning">COMING IN PHASE 4</Tag></div>
      <div className="guide-steps">{clientGuides[guide].steps.map((step, index) => <div className="guide-step" key={step}><span className="step-number">{index + 1}</span><p>{step}</p></div>)}</div>
      <div className="modal-actions"><button className="button button-secondary" onClick={() => setGuide(null)}>Close</button><button className="button button-primary" onClick={() => { setGuide(null); openPage("roots"); }}>Review file access <ArrowRight size={16} /></button></div>
    </Modal>}

    {welcome && <Modal title="Getting started" subtitle="A quick tour of your future MCP workspace." onClose={() => { setWelcome(false); setWelcomeStep(0); }}>
      <div className="tour-progress">{[0,1,2].map(index => <span className={welcomeStep >= index ? "tour-active" : ""} key={index} />)}</div>
      <div className="tour-page">{welcomeStep === 0 ? <><IconBubble icon={FolderPlus} tone="mint" /><h3>1. Choose your folders</h3><p>Set up a minimal allowlist of files AI assistants may access. The current wizard uses demo data only.</p></> : welcomeStep === 1 ? <><IconBubble icon={Wrench} tone="blue" /><h3>2. Configure MCP tools</h3><p>Enable reading, editing and destructive operations individually. Real execution will be enforced by the agent.</p></> : <><IconBubble icon={Zap} tone="purple" /><h3>3. Connect your AI</h3><p>Future releases will help you connect Claude and ChatGPT without manually editing configuration files.</p></>}</div>
      <div className="modal-actions"><button className="button button-secondary" onClick={() => { if (welcomeStep === 0) { setWelcome(false); } else setWelcomeStep(value => value - 1); }}>{welcomeStep === 0 ? "Skip tour" : "Back"}</button><button className="button button-primary" onClick={() => { if (welcomeStep < 2) setWelcomeStep(value => value + 1); else { setWelcome(false); setWelcomeStep(0); openPage("roots"); } }}>{welcomeStep === 2 ? "Explore dashboard" : "Continue"} <ArrowRight size={16} /></button></div>
    </Modal>}
  </div>;
}
