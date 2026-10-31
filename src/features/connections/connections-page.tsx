import { ArrowRight, Cloud, Info, Laptop, LockKeyhole, ShieldCheck, Sparkles, Terminal, BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Platform } from "@/lib/demo";
import { useDashboard } from "@/context/dashboard-context";
import RemoteServicePanel from "@/features/connections/remote-service-panel";
import { Tag, PageTitle, Panel, PanelTitle, IconBubble } from "@/components/ui";

type Client = { id: Platform; icon: LucideIcon; accent: string; desc: string; category: string };

const webClients: Client[] = [
  { id: "claude-web", icon: Cloud, accent: "blue", desc: "Connect Claude in your browser to approved local folders through an authenticated remote MCP endpoint.", category: "Claude Web" },
  { id: "chatgpt", icon: Sparkles, accent: "green", desc: "Connect ChatGPT Web where custom remote MCP connections are permitted by your plan and workspace.", category: "ChatGPT Web" },
];

const desktopClients: Client[] = [
  { id: "claude-desktop", icon: Laptop, accent: "orange", desc: "Optional local stdio connection, independent of the Web MCP tunnel.", category: "Claude Desktop" },
  { id: "claude-code", icon: Terminal, accent: "purple", desc: "Optional CLI connection through a local MCP process.", category: "Claude Code" },
];

export default function ConnectionsPage() {
  const { setGuide, setOnboardingOpen } = useDashboard();
  return <>
    <PageTitle page="connections"><Tag kind="purple">Web MCP priority</Tag></PageTitle>
    <div className="info-strip flex items-start gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/40 p-4 text-emerald-200">
      <Info size={18}/>
      <div>
        <strong>Connect ChatGPT or Claude Web to this computer</strong>
        <span>Designed for a first-time user. Start from the Setup Assistant even if you have no Cloudflare account or tunnel. The dashboard guides you, but creating Cloudflare infrastructure is not automated yet.</span>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="button button-primary" onClick={() => setOnboardingOpen(true)}>
        <BookOpen size={16}/> Start new-user Web MCP setup <ArrowRight size={16}/>
      </button>
    </div>

    <div className="connection-grid mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {webClients.map(client => <div className="connection-card rounded-2xl border border-slate-700/70 bg-panel p-5 sm:p-6" key={client.id}>
        <div className="connection-top mb-5 flex items-start justify-between">
          <div className={"client-logo logo-" + client.accent}><client.icon size={27}/></div>
          <Tag kind="purple">Remote Web MCP</Tag>
        </div>
        <h2>{client.category}</h2>
        <p>{client.desc}</p>
        <div className="connection-bottom mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
          <span><span className="inactive-dot" /> Setup available (not verified)</span>
          <button className="button button-secondary" onClick={() => setGuide(client.id)}>Configure Web MCP <ArrowRight size={15}/></button>
        </div>
      </div>)}
    </div>

    <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div>
              <p className="font-semibold text-slate-100">Cloudflare Credential Vault</p>
              <p className="text-sm text-slate-300">Verifikasi dan kelola API token dengan OS Keychain lokal.</p>
            </div>
            <a href="/credential-vault" className="inline-flex rounded-lg border border-sky-600 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-slate-800">
              Buka Credential Vault
            </a>
          </div>
          <RemoteServicePanel />
        </>

    <Panel className="connect-security mt-4">
      <PanelTitle title="Web MCP security" subtitle="Before enabling a public hostname" />
      <div className="security-cards grid grid-cols-1 gap-4 md:grid-cols-3">
        <div><IconBubble icon={LockKeyhole} tone="mint"/><strong>Cloudflare Access required</strong><p>Only authenticated and authorized clients may access the MCP listener. A saved hostname is not proof of OAuth.</p></div>
        <div><IconBubble icon={ShieldCheck} tone="blue"/><strong>Approved folders only</strong><p>Every remote tool request is checked against the local read-only policy.</p></div>
        <div><IconBubble icon={Cloud} tone="purple"/><strong>Dashboard stays private</strong><p>Cloudflare Tunnel must point at MCP HTTP, never the dashboard on port 3100.</p></div>
      </div>
    </Panel>

    <details className="mt-4 rounded-2xl border border-slate-700/70 bg-panel p-5">
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced / legacy local client guides (optional)</summary>
      <p className="mt-3 text-xs leading-5 text-slate-400">Local stdio clients are supported for compatibility but are not the focus of this product.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {desktopClients.map(client => <div className="rounded-xl border border-slate-700 p-4" key={client.id}>
          <div className="flex items-center gap-2"><client.icon size={19}/><strong>{client.category}</strong></div>
          <p className="mt-2 text-xs text-slate-400">{client.desc}</p>
          <button className="button button-secondary mt-3" onClick={() => setGuide(client.id)}>Open legacy guide <ArrowRight size={14}/></button>
        </div>)}
      </div>
    </details>
  </>;
}


