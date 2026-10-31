import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PageId } from "@/lib/demo";
import { pageInfo } from "@/config/navigation";

export function Tag({ children, kind = "neutral", dot = false }: { children: ReactNode; kind?: "neutral" | "success" | "warning" | "purple" | "blue"; dot?: boolean }) {
  return <span className={"tag tag-" + kind}>{dot && <span className="tag-dot" />}{children}</span>;
}
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className={"toggle" + (checked ? " is-on" : "")} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
export function PageTitle({ page, children }: { page: PageId; children?: ReactNode }) {
  const meta = pageInfo[page];
  return <div className="page-title-row"><div><p className="eyebrow">{meta.eyebrow}</p><h1>{meta.title}<span className="accent-period">.</span></h1><p className="page-description">{meta.description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={"panel " + className}>{children}</section>;
}
export function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
export function IconBubble({ icon: Icon, tone = "mint" }: { icon: LucideIcon; tone?: string }) {
  return <span className={"icon-bubble tone-" + tone}><Icon size={19} strokeWidth={1.8} /></span>;
}
export function Modal({ title, subtitle, children, onClose, width = "normal" }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; width?: "normal" | "wide" }) {
  return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={"modal-card " + (width === "wide" ? "modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}
