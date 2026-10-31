import type { ReactNode } from "react";
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-slate-700/70 bg-panel p-5 sm:p-6 ${className}`}>{children}</section>;
}
export function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div>
    <h2 className="text-sm font-bold text-slate-100">{title}</h2>
    {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
  </div>{action}</div>;
}
