import { Download, RefreshCw, Search } from "lucide-react";
import ActivityTable from "@/features/activity/activity-table";
import { pad } from "@/lib/format";
import { useDashboard } from "@/context/dashboard-context";
import { PageTitle, Panel } from "@/components/ui";

export default function ActivityPage() {
  const { events,activityQuery,setActivityQuery,activityFilter,setActivityFilter,filteredEvents,exportCsv,refreshActivity,activityState,activityError } = useDashboard();
    return <>
      <PageTitle page="activity"><button className="button button-secondary" disabled={activityState !== "ready" || events.length === 0} onClick={exportCsv}><Download size={16} /> Export CSV</button></PageTitle>
      {activityState === "loading" && <p className="text-xs text-slate-400">Loading local MCP activity...</p>}
      {activityState === "error" && <div role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-xs text-amber-200">
        Could not load local activity: {activityError}
        <button className="ml-3 font-bold underline" onClick={() => { void refreshActivity(); }}>Retry</button>
      </div>}
      <div className="metric-grid activity-metrics grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="metric-card"><span className="metric-label">Recorded events</span><strong>{pad(events.length)}</strong><p>From the local MCP audit</p></div>
        <div className="metric-card"><span className="metric-label">Allowed</span><strong className="color-mint">{pad(events.filter(item => item.status === "Allowed").length)}</strong><p>Permitted MCP requests</p></div>
        <div className="metric-card"><span className="metric-label">Denied</span><strong className="color-amber">{pad(events.filter(item => item.status === "Denied").length)}</strong><p>Policy-blocked requests</p></div>
        <div className="metric-card"><span className="metric-label">Errors</span><strong>{pad(events.filter(item => item.status === "Error").length)}</strong><p>MCP execution failures</p></div>
      </div>
      <Panel><div className="tools-controls mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2>Request history</h2><p>Local MCP requests only. No file contents or filenames are logged.</p></div><div className="search-filter flex flex-wrap items-center gap-2"><div className="searchbox flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-400"><Search size={16} /><input aria-label="Search activity" value={activityQuery} placeholder="Search events..." onChange={event => setActivityQuery(event.target.value)} /></div><select className="filter-select rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200" aria-label="Filter activity result" value={activityFilter} onChange={event => setActivityFilter(event.target.value as typeof activityFilter)}><option value="all">All results</option><option value="Allowed">Allowed</option><option value="Denied">Denied</option><option value="Error">Errors</option></select></div></div>{<ActivityTable rows={filteredEvents} />}<div className="table-footer mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 pt-4 text-xs text-muted"><span>Showing {filteredEvents.length} of {events.length} locally recorded events</span><button className="text-link" onClick={() => { void refreshActivity(); }}><RefreshCw size={15} /> Refresh logs</button></div></Panel>
    </>;
  }

