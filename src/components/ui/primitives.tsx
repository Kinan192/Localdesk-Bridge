import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Tone = "neutral" | "success" | "warning" | "purple" | "blue";
const tagTone: Record<Tone, string> = {
  neutral: "border-slate-700 bg-slate-800/75 text-slate-300",
  success: "border-emerald-700/70 bg-emerald-950/60 text-emerald-300",
  warning: "border-amber-800/70 bg-amber-950/50 text-amber-200",
  purple: "border-violet-800/70 bg-violet-950/50 text-violet-300",
  blue: "border-sky-800/70 bg-sky-950/50 text-sky-300",
};
const bubbleTone: Record<string, string> = {
  mint: "bg-emerald-400/10 text-emerald-300",
  blue: "bg-sky-400/10 text-sky-300",
  purple: "bg-violet-400/10 text-violet-300",
  violet: "bg-violet-400/10 text-violet-300",
  amber: "bg-amber-400/10 text-amber-300",
  rose: "bg-rose-400/10 text-rose-300",
};

export function Tag({ children, kind = "neutral", dot = false }: { children: ReactNode; kind?: Tone; dot?: boolean }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${tagTone[kind]}`}>
    {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}{children}
  </span>;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-[42px] shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "border-mint bg-mint" : "border-slate-600 bg-slate-700"}`}>
    <span className={`absolute top-[3px] left-[3px] size-4 rounded-full shadow transition-transform ${checked ? "translate-x-[18px] bg-emerald-950" : "bg-slate-200"}`} />
  </button>;
}

export function IconBubble({ icon: Icon, tone = "mint" }: { icon: LucideIcon; tone?: string }) {
  return <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${bubbleTone[tone] ?? bubbleTone.mint}`}><Icon size={19} strokeWidth={1.8}/></span>;
}
