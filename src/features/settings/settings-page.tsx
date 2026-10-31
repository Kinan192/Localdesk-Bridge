import { Activity, Bell, BookOpen, Copy, Monitor, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useDashboard } from "@/context/dashboard-context";
import { Tag, Toggle, PageTitle, Panel, PanelTitle, IconBubble } from "@/components/ui";

export default function SettingsPage() {
  const { prefs,setPreference,resetDemo,copyText,setOnboardingOpen,backendState } = useDashboard();
    return <>
      <PageTitle page="settings" />
      <div className="settings-layout grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.4fr_.8fr]"><Panel><PanelTitle title="Agent preferences" subtitle="Preview settings stored locally in the browser" />
        {[
          { key: "confirmations" as const, icon: ShieldCheck, title: "Confirm sensitive actions", description: "Show an approval step before write or delete requests (planned)." },
          { key: "notifications" as const, icon: Bell, title: "Activity notifications", description: "Get local notifications about future MCP events (planned)." },
          { key: "analytics" as const, icon: Activity, title: "Show activity analytics", description: "Display sample request volume on the overview page." },
          { key: "compact" as const, icon: SlidersHorizontal, title: "Compact layout", description: "Use tighter spacing across dashboard panels." },
        ].map(setting => <div className="setting-row flex items-center gap-3 border-t border-slate-700/70 py-5" key={setting.key}><IconBubble icon={setting.icon} tone="blue" /><div><strong>{setting.title}</strong><p>{setting.description}</p></div><Toggle checked={prefs[setting.key]} label={setting.title} onChange={value => setPreference(setting.key, value)} /></div>)}
      </Panel>
      <div className="settings-side flex flex-col gap-4">
        <Panel><PanelTitle title="Setup & Connections" subtitle="Resume onboarding at any time" /><p className="mb-4 text-xs text-slate-400">Setup progress is stored locally for this installation. Completing the guide does not automatically activate a Cloudflare Tunnel.</p><button className="button button-primary button-full" onClick={() => setOnboardingOpen(true)}><BookOpen size={16} /> Open Setup Assistant</button></Panel>
        <Panel><PanelTitle title="This installation" /><div className="device-info mb-5 flex flex-wrap items-center gap-3"><div className="device-illustration"><Monitor size={26} /></div><strong>Local installation</strong><Tag kind="purple">READ-ONLY ALPHA</Tag></div><div className="device-details mb-4 divide-y divide-slate-700/60"><div><span>Project</span><strong>Local MCP Manager</strong></div><div><span>Release</span><strong>0.3.0 / Local MCP</strong></div><div><span>Backend</span><strong>{backendState === "ready" ? "Policy API connected" : backendState === "loading" ? "Checking..." : "Backend unavailable"}</strong></div><div><span>Dashboard</span><strong>localhost:3100</strong></div></div><button className="button button-secondary button-full" onClick={() => copyText(window.location.origin, "Dashboard URL copied.")}><Copy size={16} /> Copy dashboard URL</button></Panel>
        <Panel className="danger-panel border-rose-900/60"><PanelTitle title="Demo data" subtitle="Reset browser-only settings and examples" /><p>Your actual files and existing Arch MCP project will not be affected.</p><button className="button button-danger" onClick={resetDemo}><RotateCcw size={16} /> Reset demo data</button></Panel>
      </div></div>
    </>;
  }

