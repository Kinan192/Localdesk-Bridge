import { FileText } from "lucide-react";
import type { EventEntry } from "@/lib/demo";
import { Tag } from "@/components/ui";

export default function ActivityTable({ rows }: { rows: EventEntry[] }) {
    return <div className="table-scroll w-full overflow-x-auto"><table className="activity-table w-full min-w-[570px] border-collapse text-left text-xs"><thead><tr><th>EVENT</th><th>RESOURCE</th><th>CLIENT</th><th>RESULT</th><th>TIME</th></tr></thead><tbody>{rows.map(event => <tr key={event.id}><td><span className="table-icon"><FileText size={16} /></span><strong>{event.action}</strong></td><td className="resource-cell max-w-[300px] truncate text-muted">{event.target}</td><td>{event.client}</td><td><Tag kind={event.status === "Allowed" ? "success" : event.status === "Denied" ? "warning" : "neutral"} dot>{event.status}</Tag></td><td className="time-cell tabular-nums text-slate-500">{event.time}</td></tr>)}</tbody></table>{!rows.length && <div className="empty-state">No events match the current filters.</div>}</div>;
  }

