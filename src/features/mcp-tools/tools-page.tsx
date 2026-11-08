import { Code2, RotateCcw, Search, ShieldAlert, Wrench } from "lucide-react";
import { useDashboard } from "@/context/dashboard-context";
import { Tag, Toggle, PageTitle, Panel } from "@/components/ui";


export default function ToolsPage() {
  const { toolQuery,setToolQuery,toolFilter,setToolFilter,activeTools,filteredTools,updateTool,restoreReadTools,backendState,backendError } = useDashboard();
    return <>
      <PageTitle page="tools"><button className="button button-secondary" disabled={backendState !== "ready"} onClick={() => { void restoreReadTools(); }}><RotateCcw size={16} /> Enable read tools</button></PageTitle>
      {backendState !== "ready" && <div className="info-strip warning-strip"><ShieldAlert size={18} /><div><strong>{backendState === "loading" ? "Connecting to local backend..." : "Local backend unavailable"}</strong><span>{backendError || "Loading stored tool permissions."}</span></div></div>}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-800/40 text-mint"><Wrench size={19} /></span><div className="min-w-0 flex-1"><strong className="text-sm">{activeTools} of 10 tools enabled</strong><p className="mt-1 text-xs text-emerald-100/65">Tool permissions are enforced by the backend. Write requires a supported sandbox and an approved Read & Write folder.</p></div><div className="h-2 w-24 overflow-hidden rounded-full bg-emerald-950 sm:w-36"><div className="h-full rounded-full bg-mint transition-all" style={{ width: activeTools * 10 + "%" }} /></div><span className="text-xs font-bold text-mint">{activeTools * 10}%</span></div>
      <Panel>
        <div className="tools-controls mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2>Tool permissions</h2><p>Each tool change is checked by the local owner-protected policy API.</p></div><div className="search-filter flex flex-wrap items-center gap-2"><div className="searchbox flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-slate-400"><Search size={16} /><input aria-label="Search tools" value={toolQuery} placeholder="Search tools..." onChange={event => setToolQuery(event.target.value)} /></div><select aria-label="Filter tools" className="filter-select rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200" value={toolFilter} onChange={event => setToolFilter(event.target.value as "all" | "read" | "write")}><option value="all">All tools</option><option value="read">Read tools</option><option value="write">Write tools</option></select></div></div>
        <div className="tool-list divide-y divide-slate-700/70">{filteredTools.map(tool => <div className="tool-item flex items-center gap-3 py-4" key={tool.id}><div className={"tool-icon " + (tool.kind === "danger" ? "tone-rose" : tool.kind === "read" ? "tone-blue" : "tone-purple")}><Code2 size={19} /></div><div className="tool-description min-w-0 flex-1"><div className="tool-name-line flex flex-wrap items-center gap-2"><strong>{tool.id}</strong><Tag kind={tool.kind === "danger" ? "warning" : tool.kind === "read" ? "blue" : "purple"}>{tool.kind === "danger" ? "Sensitive" : tool.kind === "read" ? "Read" : "Write"}</Tag></div><p>{tool.description}</p></div><Toggle label={"Enable MCP tool " + tool.id} checked={tool.enabled} disabled={backendState !== "ready"} onChange={value => { void updateTool(tool.id, value); }} /></div>)}</div>
        {!filteredTools.length && <div className="empty-state">No tools found for that search.</div>}
      </Panel>
      <div className="info-strip warning-strip"><ShieldAlert size={19} /><div><strong>Write requires explicit folder permission</strong><span>Only approved Read & Write folders can be modified. Unsupported platforms remain Read Only, and deletion requires local owner confirmation.</span></div></div>
    </>;
  }

