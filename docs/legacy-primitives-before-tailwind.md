import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Tag({ children, kind = "neutral", dot = false }: { children: ReactNode; kind?: "neutral" | "success" | "warning" | "purple" | "blue"; dot?: boolean }) {
  return <span className={"tag tag-" + kind}>{dot && <span className="tag-dot" />}{children}</span>;
}
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className={"toggle" + (checked ? " is-on" : "")} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
export function IconBubble({ icon: Icon, tone = "mint" }: { icon: LucideIcon; tone?: string }) {
  return <span className={"icon-bubble tone-" + tone}><Icon size={19} strokeWidth={1.8} /></span>;
}
