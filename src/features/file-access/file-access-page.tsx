import { Code2, FileCheck2, Folder, Lock, Plus, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { useDashboard } from "@/context/dashboard-context";
import { Tag, Toggle, PageTitle, Panel, PanelTitle } from "@/components/ui";

export default function FileAccessPage() {
  const { roots,removeRoot,setFolderModal,setFolderError,activeRoots,updateRoot,backendState,backendError } = useDashboard();
    return <>
      <PageTitle page="roots"><button className="button button-primary" disabled={backendState !== "ready"} onClick={() => { setFolderError(""); setFolderModal(true); }}><Plus size={17} /> Add folder</button></PageTitle>
      {backendState !== "ready" && <div className="info-strip warning-strip"><ShieldCheck size={18} /><div><strong>{backendState === "loading" ? "Connecting to local backend..." : "Local backend unavailable"}</strong><span>{backendError || "Loading the real folder allowlist."}</span></div></div>}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-300"><ShieldCheck className="mt-0.5 shrink-0" size={19} /><div className="flex flex-col gap-1"><strong className="text-xs text-emerald-100">Explicit access only</strong><span className="text-xs leading-relaxed text-emerald-200/75">Folder access is stored in local policy and checked by the MCP agent. Only read access can be approved in this alpha.</span></div></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-panel p-4"><span className="text-xs text-slate-400">Approved folders</span><strong className="text-2xl font-bold">{activeRoots}</strong></div><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-panel p-4"><span className="text-xs text-slate-400">Read-only folders</span><strong className="text-2xl font-bold">{activeRoots}</strong></div><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-panel p-4"><span className="text-xs text-slate-400">Disabled folders</span><strong className="text-2xl font-bold">{roots.length - activeRoots}</strong></div></div>
      <Panel>
        <PanelTitle title="Approved folders" subtitle="Real local policy · saved in your computer" action={<Tag kind="success">READ ONLY ALPHA</Tag>} />
        <div className="roots-list divide-y divide-slate-700/75">{roots.map(root => <div className="folder-row flex flex-wrap items-center gap-3 py-4" key={root.id}>
          <div className={"folder-symbol tone-" + root.color}><Folder size={23} strokeWidth={1.7} /></div>
          <div className="folder-details min-w-0 flex-1"><div className="folder-name-line flex flex-wrap items-center gap-2"><strong>{root.name}</strong>{!root.enabled && <Tag>Disabled</Tag>}</div><span title={root.path}>{root.path}</span></div>
          <select className="permission-select rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-300 disabled:opacity-70" aria-label={"Access level for " + root.name} value={root.access} disabled><option value="read">Read only</option><option value="write">Read & write (locked)</option></select>
          <Toggle checked={root.enabled} disabled={backendState !== "ready"} label={"Enable folder " + root.name} onChange={enabled => updateRoot(root.id, { enabled })} />
          <button className="icon-btn root-remove" aria-label={"Remove " + root.name} title="Revoke approved folder" disabled={backendState !== "ready"} onClick={() => { void removeRoot(root.id); }}><Trash2 size={17} /></button>
        </div>)}</div>
        {roots.length === 0 && <div className="empty-state">No folders approved yet. Choose Add folder to grant read-only access.</div>}
      </Panel>
      <div className="two-panels grid grid-cols-1 gap-4 md:grid-cols-2"><Panel><PanelTitle title="Access principles" /><div className="feature-line"><Lock size={19} /><div><strong>Default deny</strong><span>Files outside an approved root must be blocked.</span></div></div><div className="feature-line"><Shield size={19} /><div><strong>Read-only by default</strong><span>Write access should require explicit approval.</span></div></div><div className="feature-line"><FileCheck2 size={19} /><div><strong>Validate every request</strong><span>Permissions must be enforced by the agent, not the UI.</span></div></div></Panel><Panel className="next-phase border-violet-800/40 bg-violet-950/20"><div className="phase-icon"><Code2 size={23} /></div><h3>Folder picker comes next</h3><p>This first version accepts an absolute folder path. A native folder picker and safer write support will be added later.</p><Tag kind="blue">PLANNED · FUTURE UPDATE</Tag></Panel></div>
    </>;
  }

