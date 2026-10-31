import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, subtitle, children, onClose, width = "normal" }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; width?: "normal" | "wide" }) {
  return <div className="fixed inset-0 z-[150] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title}
      className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-600 bg-[#172337] p-5 shadow-2xl sm:p-6 ${width === "wide" ? "max-w-3xl" : "max-w-lg"}`}>
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-700 pb-5">
        <div><h2 className="text-xl font-bold tracking-tight">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-muted">{subtitle}</p>}</div>
        <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white"><X size={19}/></button>
      </div>{children}
    </section>
  </div>;
}
