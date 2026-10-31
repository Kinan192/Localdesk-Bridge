"use client";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Command, Menu, Monitor, ShieldCheck, X } from "lucide-react";
import { menu, pageInfo } from "@/config/navigation";
import { useDashboard } from "@/context/dashboard-context";
import { Tag } from "@/components/ui";

// Shared chrome; pages and dialogs are injected as children.
export default function AppShell({ children }: { children: ReactNode }) {
  const { collapsed, prefs, mobileNav, setMobileNav, setCollapsed, page, openPage, setWelcome, toast, setToast, backendState } = useDashboard();
  return <div className={"app-shell flex min-h-screen bg-canvas text-slate-100" + (collapsed ? " nav-collapsed" : "") + (prefs.compact ? " compact-layout" : "")}>
    {mobileNav && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={"app-sidebar sticky top-0 z-30 hidden h-screen w-[252px] shrink-0 flex-col border-r border-slate-700/60 bg-[#0d141d] p-4 lg:flex" + (mobileNav ? " mobile-open" : "")}>
      <div className="sidebar-brand flex items-center gap-3 pb-6"><span className="brand-symbol grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-emerald-950"><Command size={24} strokeWidth={2.5} /></span><div className="brand-text flex flex-col text-xs font-extrabold tracking-wide"><strong>LOCAL<span>MCP</span></strong><small>MANAGER</small></div><button className="icon-btn collapse-button" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
      <div className="sidebar-workspace mb-8 flex items-center gap-2.5 rounded-xl border border-slate-700/70 bg-[#182433] p-3"><div className="workspace-icon grid size-9 shrink-0 place-items-center rounded-lg bg-slate-700 text-slate-200"><Monitor size={20} /></div><span className="workspace-text flex min-w-0 flex-1 flex-col gap-1"><strong>Personal workspace</strong><small>Local installation</small></span><ChevronDown size={15} className="workspace-chevron" /></div>
      <nav className="main-nav grid gap-6" aria-label="Main navigation">{(["workspace", "management"] as const).map(group => <div className="nav-group grid gap-1" key={group}><div className="nav-group-name px-3 pb-2 text-[10px] font-extrabold tracking-[.16em] text-slate-500">{group === "workspace" ? "WORKSPACE" : "MANAGE"}</div>{menu.filter(item => item.group === group).map(item => <button className={"nav-item flex min-h-11 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" + (page === item.id ? " nav-active !border-emerald-900/70 !bg-emerald-950/60 !text-mint" : "")} key={item.id} onClick={() => openPage(item.id)} title={item.label}><item.icon size={19} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "connections" && <b className="nav-count">4</b>}</button>)}</div>)}</nav>
      <div className="sidebar-spacer grow" />
      <button className="sidebar-helper flex items-center gap-3 rounded-xl border border-emerald-900/60 bg-emerald-950/45 p-3 text-left" onClick={() => setWelcome(true)}><span className="helper-icon"><CircleHelp size={20} /></span><span><strong>Getting started?</strong><small>Follow the setup guide</small></span><ArrowRight size={15} /></button>
      <div className="sidebar-bottom flex items-center gap-2 border-t border-slate-700/70 pt-3"><div className="avatar">LM</div><div className="avatar-copy"><strong>Local User</strong><small>Preview workspace</small></div><Tag kind="purple">DEMO</Tag></div>
    </aside>
    <div className="app-content flex min-w-0 flex-1 flex-col">
      <header className="topbar flex h-[76px] shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-[#0c121b] px-5 lg:px-10"><div className="topbar-left flex items-center gap-3"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumbs flex items-center gap-2 text-xs text-slate-400"><span>Workspace</span><ChevronRight size={14} /><strong>{pageInfo[page].title}</strong></div></div><div className="topbar-right flex items-center gap-4"><span className="topbar-demo flex items-center gap-2 rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-[11px] font-semibold text-mint"><span className="status-spark" /> {backendState === "ready" ? "Local policy ready" : backendState === "loading" ? "Checking local policy" : "Local policy offline"}</span><button className="topbar-help" onClick={() => setWelcome(true)}><CircleHelp size={18} /></button><span className="topbar-divider" /><span className="top-avatar">LM</span></div></header>
      <main className="main-view mx-auto flex w-full max-w-[1510px] flex-1 flex-col gap-6 px-5 py-9 lg:px-10">{children}</main>
      <footer className="app-footer flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-5 text-[10px] text-slate-500 lg:px-10"><span>Local MCP Manager · Read-only alpha v0.3</span><span><ShieldCheck size={13} /> Policy {backendState === "ready" ? "available" : "unavailable"} · Agent not supervised</span></footer>
    </div>

    {toast && <div className="toast" role="status"><CheckCircle2 size={19} /> <span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast("")}><X size={15} /></button></div>}


  </div>;
}
