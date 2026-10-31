import { ArrowRight, ArrowUpRight, BookOpen, ChevronRight, Code2, FolderClosed, FolderPlus, Info, Laptop, Server, ShieldCheck, SlidersHorizontal, Sparkles, Wrench, Zap } from "lucide-react";
import { useDashboard } from "@/context/dashboard-context";
import { Tag, PageTitle, Panel, PanelTitle, IconBubble } from "@/components/ui";
import ActivityTable from "@/features/activity/activity-table";
import { pad } from "@/lib/format";

export default function OverviewPage() {
  const { backendState,prefs,roots,events,setOnboardingOpen,setFolderModal,setFolderError,openPage,activeRoots,activeTools } = useDashboard();
    return <>
      <PageTitle page="overview">
        <button className="button button-secondary" onClick={() => setOnboardingOpen(true)}><BookOpen size={16} /> Web MCP Setup</button>
        <button className="button button-primary" onClick={() => openPage("connections")}><Zap size={16} /> Connect Web AI</button>
      </PageTitle>

      <div className="hero-panel relative flex min-h-[265px] overflow-hidden rounded-2xl border border-emerald-700/30 bg-gradient-to-r from-emerald-950/85 via-[#123028] to-[#182437]">
        <div className="hero-copy relative z-10 w-full p-6 sm:w-[70%] sm:p-8">
          <div className="hero-kicker flex items-center gap-2 text-[10px] font-extrabold tracking-[.14em] text-mint"><Sparkles size={14} /> YOUR LOCAL AI WORKSPACE</div>
          <h2>Your computer.<br /><span>Your control.</span></h2>
          <p>Connect your favorite AI tools to local files with clear permissions, visibility, and control. Start with your own workspace.</p>
          <div className="hero-actions mt-5 flex flex-wrap items-center gap-3">
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

      <div className="demo-note flex items-start gap-3 rounded-xl border border-violet-700/50 bg-violet-950/30 p-4 text-violet-300"><Info size={17} /><div><strong>Read-only alpha · mixed live and sample data</strong><span>Folders, tool permissions, and activity logs now load from the local backend. The request chart is still an illustration. Agent supervision and AI connection status are not live yet.</span></div><Tag kind="purple">ALPHA</Tag></div>

      <div className="metric-grid grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="metric-card rounded-xl border border-slate-700/70 bg-panel p-4 sm:p-5"><div className="metric-top flex items-center justify-between gap-2"><span>Agent status</span><IconBubble icon={Server} tone="mint" /></div><strong>Not supervised</strong><p><span className="mini-dot" /> Stdio agent starts via MCP client</p></div>
        <div className="metric-card rounded-xl border border-slate-700/70 bg-panel p-4 sm:p-5"><div className="metric-top flex items-center justify-between gap-2"><span>Active folders</span><IconBubble icon={FolderClosed} tone="blue" /></div><strong>{backendState === "ready" ? pad(activeRoots) : "--"} <small>/ {backendState === "ready" ? pad(roots.length) : "--"}</small></strong><p>{backendState === "ready" ? "Saved in local policy" : "Backend unavailable"}</p></div>
        <div className="metric-card rounded-xl border border-slate-700/70 bg-panel p-4 sm:p-5"><div className="metric-top flex items-center justify-between gap-2"><span>Enabled tools</span><IconBubble icon={Wrench} tone="purple" /></div><strong>{backendState === "ready" ? pad(activeTools) : "--"} <small>/ 10</small></strong><p>{backendState === "ready" ? "Saved read-only permissions" : "Backend unavailable"}</p></div>
        <div className="metric-card rounded-xl border border-slate-700/70 bg-panel p-4 sm:p-5"><div className="metric-top flex items-center justify-between gap-2"><span>AI connections</span><IconBubble icon={Zap} tone="amber" /></div><strong>00 <small>/ 04</small></strong><p>No real clients connected</p></div>
      </div>

      <div className={"dashboard-columns grid grid-cols-1 gap-4 xl:grid-cols-[1.52fr_1fr]" + (!prefs.analytics ? " no-analytics" : "")}>
        {prefs.analytics && <Panel className="analytics-panel">
          <PanelTitle title="Activity insights" subtitle="Illustrative request volume · last 7 days" action={<Tag kind="purple">SAMPLE DATA</Tag>} />
          <div className="chart-top"><div><span className="chart-total">1,284</span><span className="chart-context">demo requests</span></div><span className="trend"><ArrowUpRight size={14} /> +12.8%</span></div>
          <div className="chart"><div className="chart-grid"><span>240</span><span>160</span><span>80</span><span>0</span></div><div className="chart-bars">{[42,61,50,79,68,93,76].map((height, index) => <div className="chart-column" key={index}><div className="chart-bar-track"><div className={"chart-bar " + (index === 5 ? "is-highlight" : "")} style={{ height: height + "%" }} /></div><span>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}</span></div>)}</div></div>
        </Panel>}
        <Panel className="quick-panel">
          <PanelTitle title="Quick actions" subtitle="Explore your local-first setup" />
          <button className="quick-action flex w-full items-center gap-3 border-b border-slate-700 py-3 text-left hover:text-mint" disabled={backendState !== "ready"} onClick={() => { setFolderError(""); setFolderModal(true); }}><IconBubble icon={FolderPlus} tone="mint" /><span><strong>Add a folder</strong><small>Choose an allowed workspace</small></span><ChevronRight size={17} /></button>
          <button className="quick-action flex w-full items-center gap-3 border-b border-slate-700 py-3 text-left hover:text-mint" onClick={() => openPage("tools")}><IconBubble icon={SlidersHorizontal} tone="blue" /><span><strong>Configure tools</strong><small>Review your allowed capabilities</small></span><ChevronRight size={17} /></button>
          <button className="quick-action flex w-full items-center gap-3 border-b border-slate-700 py-3 text-left hover:text-mint" onClick={() => openPage("connections")}><IconBubble icon={Zap} tone="purple" /><span><strong>Connect an AI assistant</strong><small>See guided setup options</small></span><ChevronRight size={17} /></button>
          <div className="quick-tip mt-4 flex items-center gap-2 rounded-lg bg-emerald-950/60 p-3 text-xs text-emerald-200"><ShieldCheck size={18} /><span>Local-first by design. MCP tool permissions are enforced on your computer.</span></div>
        </Panel>
      </div>
      <Panel>
        <PanelTitle title="Recent MCP activity" subtitle="Real stdio MCP requests · no file content logged" action={<button className="text-link" onClick={() => openPage("activity")}>View all activity <ArrowRight size={15} /></button>} />
        {<ActivityTable rows={events.slice(0, 4)} />}
      </Panel>
    </>;
  }

