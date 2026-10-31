"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Cloud, FolderLock, MonitorCheck, RefreshCw, ShieldCheck, Terminal } from "lucide-react";
import { Modal } from "@/components/ui";
import { cloudflareReadOnlyTokenTemplateUrl } from "@/lib/cloudflare-token-template";
import { useDashboard } from "@/context/dashboard-context";

type State = { version: 1; step: number; mode: "local" | "new" | "existing" | null; dismissed: boolean };
type Summary = {
  onboarding: State;
  system: {
    platform: string; nodeVersion: string; dependenciesReady: boolean;
    missing: string[]; cloudflaredPresent: boolean;
  };
  fileAccess: { approvedRoots: number; readTools: number };
};
type Probe = { remoteHttp?: { state: string; port: number } };
type CloudflareHostnameCheck = {
  hostname: string;
  status: "blocked" | "candidate";
  dnsRecords: { id: string; name: string; type: string }[];
  note: string;
  accessPolicyChecked: false;
  tunnelChecked: false;
};
type CloudflarePreview = {
  status: "preview-only";
  zone: string;
  hostname: string;
  endpoint: string;
  prerequisite: string;
  requiredPermissions: string[];
  steps: { id: string; label: string; automatic: boolean }[];
};
const steps = [
  { label: "System Check", Icon: MonitorCheck },
  { label: "File Access", Icon: FolderLock },
  { label: "Web MCP Setup", Icon: Cloud },
  { label: "Connect & Verify", Icon: ShieldCheck },
];
const platformName = (value: string) =>
  value === "win32" ? "Windows" : value === "darwin" ? "macOS" : value === "linux" ? "Linux" : value;
const installHelp = (value: string) =>
  value === "win32" ? "Windows: install cloudflared with the official Windows installer or winget." :
  value === "darwin" ? "macOS: use Homebrew or the official cloudflared installation." :
  "Linux: install cloudflared using your distribution's package manager or Cloudflare package.";

export default function FirstRunWizard() {
  const { onboardingOpen, setOnboardingOpen, openPage, setGuide } = useDashboard();
  const [data, setData] = useState<Summary | null>(null);
  const [remote, setRemote] = useState<Probe | null>(null);
  const [cloudflareConfig, setCloudflareConfig] = useState<"checking" | "configured" | "not-configured" | "unavailable">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("");
  const [allowedEmail, setAllowedEmail] = useState("");
  const [subdomain, setSubdomain] = useState("mcp");
  const [preview, setPreview] = useState<CloudflarePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [tokenChecking, setTokenChecking] = useState(false);
  const [zoneError, setZoneError] = useState("");
  const [zoneResult, setZoneResult] = useState<null | {
    verified: true; credentialStored: false; canProvision: false;
    zones: { id: string; name: string; status: string; accountName: string }[];
    truncated: boolean;
    preflight?: CloudflareHostnameCheck;
  }>(null);

  const load = useCallback(async (first = false) => {
    setError("");
    setCloudflareConfig("checking");
    try {
      const result = await fetch("/api/local/onboarding", { cache: "no-store" });
      const body = await result.json() as Summary & { error?: string };
      if (!result.ok) throw new Error(body.error || "Could not check this installation.");
      setData(body);
      if (first && !body.onboarding.dismissed) setOnboardingOpen(true);
      const status = await fetch("/api/local/status", { cache: "no-store" });
      if (status.ok) setRemote(await status.json() as Probe);
      try {
        const configResponse = await fetch("/api/local/cloudflare", { cache: "no-store" });
        const config = await configResponse.json() as { configured?: boolean };
        setCloudflareConfig(configResponse.ok ?
          (config.configured ? "configured" : "not-configured") : "unavailable");
      } catch {
        setCloudflareConfig("unavailable");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Setup check failed."); }
  }, [setOnboardingOpen]);
  useEffect(() => { void load(true); }, [load]);

  async function update(patch: Partial<Pick<State,"step" | "mode" | "dismissed">>): Promise<boolean> {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/local/onboarding", {
        method:"PATCH", cache:"no-store",
        headers: { "Content-Type":"application/json", "x-local-mcp-action":"dashboard" },
        body: JSON.stringify(patch),
      });
      const body = await response.json() as { onboarding?: State; error?: string };
      if (!response.ok || !body.onboarding) throw new Error(body.error || "Cannot save setup progress.");
      const next = body.onboarding;
      setData(current => current ? {...current, onboarding:next} : current);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup save failed.");
      return false;
    } finally { setBusy(false); }
  }
  async function prepareCloudflarePlan() {
    setPreviewBusy(true);
    setPreview(null);
    setZoneResult(null);
    setPreviewError("");
    try {
      const response = await fetch("/api/local/cloudflare/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-local-mcp-action": "dashboard" },
        body: JSON.stringify({ domain, subdomain, allowedEmail }),
      });
      const result = await response.json() as { preview?: CloudflarePreview; error?: string };
      if (!response.ok || !result.preview) {
        throw new Error(result.error || "Could not validate the Cloudflare setup plan.");
      }
      setPreview(result.preview);
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : "Preview unavailable.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function verifyCloudflare() {
    const candidate = apiToken;
    setApiToken(""); // Never retain the token in UI state after submission.
    setZoneError("");
    setZoneResult(null);
    setTokenChecking(true);
    try {
      const response = await fetch(preview ? "/api/local/cloudflare/preflight" : "/api/local/cloudflare/verify", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-local-mcp-action": "dashboard" },
        body: JSON.stringify(preview ? { token: candidate, domain, subdomain, allowedEmail } : { token: candidate }),
      });
      const payload = await response.json() as { verified?: true; credentialStored?: false; canProvision?: false;
        zones?: { id:string;name:string;status:string;accountName:string }[];
        truncated?:boolean;preflight?:CloudflareHostnameCheck;error?:string };
      if (!response.ok || !payload.verified || !payload.zones) {
        throw new Error(payload.error || "Verification failed.");
      }
      setZoneResult({ verified:true, credentialStored:false, canProvision:false,
        zones:payload.zones, truncated:Boolean(payload.truncated), preflight:payload.preflight });
    } catch (cause) {
      setZoneError(cause instanceof Error ? cause.message : "Verification unavailable.");
    } finally { setTokenChecking(false); }
  }

  async function close() { if (await update({ dismissed:true })) setOnboardingOpen(false); }
  async function navigate(page: "roots" | "connections", client?: "chatgpt" | "claude-web" | "claude-desktop" | "claude-code") {
    if (!(await update({ dismissed:true }))) return;
    setOnboardingOpen(false);
    openPage(page);
    if (client) setGuide(client);
  }

  if (!onboardingOpen) return null;
  const current = data?.onboarding.step ?? 0;
  const mode = data?.onboarding.mode;
  const sys = data?.system;
  const roots = data?.fileAccess;
  const online = remote?.remoteHttp?.state === "listening-protected";

  return <Modal title="Welcome to Local MCP Manager"
    subtitle="First-time setup for Windows, macOS, and Linux. Progress is saved locally."
    onClose={() => void close()} width="wide">
    <div className="grid gap-5 text-sm text-slate-200">
      <div className="grid grid-cols-4 gap-2">
        {steps.map(({label,Icon},i) => <button key={label} type="button" disabled={!data || busy}
          onClick={() => void update({step:i})}
          className={"flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-[11px] " +
            (i===current ? "border-emerald-400 bg-emerald-950/50 text-mint" : "border-slate-700 bg-slate-900 text-slate-400")}>
          <Icon size={19}/><span className="hidden sm:block">{label}</span><span className="sm:hidden">{i+1}</span>
        </button>)}
      </div>
      {!data && !error && <div className="flex items-center gap-2 p-4 text-slate-400"><RefreshCw className="animate-spin" size={16}/> Checking system...</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-rose-200">
        {error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button>
      </div>}
      {data && current === 0 && <div className="grid gap-3">
        <h3 className="text-lg font-bold">1. System Check</h3>
        <p className="text-slate-400">Detected without installing software or running terminal commands.</p>
        <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p>Platform: <strong>{platformName(sys!.platform)}</strong></p>
          <p>Node.js: <strong>{sys!.nodeVersion}</strong></p>
          <p>Project dependencies: <strong className={sys!.dependenciesReady?"text-mint":"text-amber-200"}>{sys!.dependenciesReady?"Available":"Incomplete"}</strong></p>
          <p>cloudflared: <strong className={sys!.cloudflaredPresent?"text-mint":"text-amber-200"}>
            {sys!.cloudflaredPresent?"Binary found (running status not checked)":"Not detected"}
          </strong></p>
          {!sys!.dependenciesReady && <p className="text-xs text-amber-200">Missing: {sys!.missing.join(", ")}</p>}
        </div>
        <p className="rounded-lg bg-slate-800 p-3 text-xs">{installHelp(sys!.platform)}</p>
        <button className="flex items-center gap-1 self-start text-xs text-sky-300" onClick={() => void load()}><RefreshCw size={14}/> Recheck</button>
      </div>}
      {data && current === 1 && <div className="grid gap-3">
        <h3 className="text-lg font-bold">2. File Permissions</h3>
        <p className="text-slate-400">Approve only non-sensitive folders you want AI assistants to read. No folder is allowed automatically.</p>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="font-semibold">{roots!.approvedRoots} approved folders</p>
          <p className="mt-1 text-xs text-slate-400">{roots!.readTools} of 5 read-only tools enabled</p>
          <button className="mt-4 rounded-lg border border-emerald-700 px-3 py-2 text-xs text-mint"
            onClick={() => void navigate("roots")}>Open File Access</button>
        </div>
        <p className="text-xs text-amber-200">If this stays empty, connections may work but no private files are readable.</p>
      </div>}
      {data && current === 2 && <div className="grid gap-3">
        <h3 className="text-lg font-bold">3. Connect ChatGPT Web or Claude Web</h3>
        <p className="text-slate-400">This app is designed for cloud AI to access user-approved local files securely. Start with a new protected Web MCP connection; existing tunnels are an advanced option.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([{id:"new",label:"New Web MCP (recommended)",desc:"For first-time ChatGPT Web / Claude Web users without an existing tunnel.",Icon:Cloud},
            {id:"existing",label:"Use existing tunnel (advanced)",desc:"For users who already have a Cloudflare Tunnel.",Icon:Terminal}] as const)
            .map(item => <button key={item.id} disabled={busy} type="button"
              onClick={() => void update({ mode:item.id })}
              className={"flex flex-col gap-2 rounded-xl border p-4 text-left " +
                (mode===item.id?"border-emerald-400 bg-emerald-950/40":"border-slate-700 bg-slate-900/60")}>
              <item.Icon size={23} className="text-mint"/><strong>{item.label}</strong>
              <span className="text-xs leading-5 text-slate-400">{item.desc}</span>
              {mode===item.id && <span className="flex items-center gap-1 text-xs text-mint"><CheckCircle2 size={14}/> Selected</span>}
            </button>)}
        </div>
        {mode==="local" && <div className="grid gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-xs">
          <strong className="text-sm text-amber-100">Previous local-client selection</strong>
          <p>Your previous onboarding choice is still saved, but this wizard now focuses on ChatGPT Web and Claude Web. Choose New Web MCP above to continue with browser-based AI.</p>
          <button className="self-start rounded-lg border border-emerald-700 px-3 py-2 text-mint"
            onClick={() => void update({ mode: "new" })}>Switch to Web MCP</button>
        </div>}
        {mode==="new" && <div className="grid gap-3 rounded-xl border border-slate-700 p-4 text-xs">
          <strong className="text-sm text-white">New user setup: Cloudflare account and protected MCP hostname</strong>
          <p>A stable, Access-protected MCP web hostname requires a Cloudflare account and a domain managed by Cloudflare. Cloudflare Quick Tunnels are temporary development URLs, not the recommended secure web MCP setup.</p>
          <p>Local MCP Manager will eventually handle setup automatically using a remotely-managed Cloudflare Tunnel. This version offers a safe, read-only preview; it does not yet change Cloudflare resources.</p>
          <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
            <strong className="text-sm text-slate-100">Prepare your Cloudflare setup</strong>
            <p>Already own a domain? Enter it below. The domain must also be active in your Cloudflare DNS account. No API tokens or tunnel credentials are needed for this preview.</p>
            <label className="grid gap-1">
              Your domain (without https://)
              <input type="text" value={domain} placeholder="example.com"
                onChange={e=>{setDomain(e.target.value);setPreview(null);setZoneResult(null);}}
                autoComplete="off"
                className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint" />
            </label>
            <label className="grid gap-1">
              MCP subdomain
              <input type="text" value={subdomain} placeholder="mcp"
                onChange={e=>{setSubdomain(e.target.value);setPreview(null);setZoneResult(null);}}
                autoComplete="off"
                className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint" />
            </label>
            <label className="grid gap-1">
              Email allowed to access this MCP
              <input type="email" value={allowedEmail} placeholder="you@example.com"
                onChange={e=>{setAllowedEmail(e.target.value);setPreview(null);setZoneResult(null);}}
                autoComplete="email"
                className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint" />
            </label>
            <button type="button" className="self-start rounded-lg bg-mint px-3 py-2 font-bold text-slate-950 disabled:opacity-40"
              disabled={previewBusy || !domain.trim() || !allowedEmail.trim()}
              onClick={() => void prepareCloudflarePlan()}>
              {previewBusy ? "Checking..." : "Preview Cloudflare setup"}
            </button>
            {previewError && <p role="alert" className="rounded-lg border border-rose-700 p-2 text-rose-200">{previewError}</p>}
            {preview && <div className="grid gap-2 rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3">
              <strong className="text-mint">Proposed endpoint: {preview.endpoint}</strong>
              <p>{preview.prerequisite}</p>
              <p className="font-semibold text-slate-100">The setup assistant will need permission to:</p>
              <ul className="list-inside list-disc text-slate-300">
                {preview.requiredPermissions.map(permission=><li key={permission}>{permission}</li>)}
              </ul>
              <p className="font-semibold text-slate-100">Provisioning stages (not executed yet):</p>
              <ol className="list-inside list-decimal text-slate-300">
                {preview.steps.map(stage=><li key={stage.id}>{stage.label}</li>)}
              </ol>
              <p className="text-amber-200">Preview only. No Cloudflare connection, API token, DNS record, Access policy, or tunnel has been created.</p>
            </div>}
          </div>
          <div className="flex flex-wrap gap-3">
            <a className="text-sky-300 underline" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Open Cloudflare account</a>
            <a className="text-sky-300 underline" href="https://developers.cloudflare.com/tunnel/get-started/" target="_blank" rel="noreferrer">Tunnel and domain requirements</a>
          </div>
          <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
            <strong className="text-sm text-white">Verify Cloudflare domain and proposed MCP hostname</strong>
            <p>Use a short-lived Cloudflare token limited to Zone Read and DNS Read for this check. With a setup preview, this also checks whether the proposed MCP hostname already exists in DNS. All checks remain read-only. The token is sent only to the localhost API and directly to Cloudflare. It is not stored, and this does not grant provisioning access.</p>
            <a className="text-sky-300 underline" href={cloudflareReadOnlyTokenTemplateUrl()} target="_blank" rel="noreferrer">Create scoped API token in Cloudflare</a>
            <label className="grid gap-1">Cloudflare API token (never Global API Key)
              <input type="password" value={apiToken} autoComplete="off"
                onChange={e=>{setApiToken(e.target.value);setZoneResult(null);setZoneError("");}}
                placeholder="Paste a short-lived token with Zone Read + DNS Read"
                className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint"/>
            </label>
            <button type="button" disabled={tokenChecking || apiToken.trim().length < 20}
              className="self-start rounded-lg border border-emerald-700 px-3 py-2 text-mint disabled:opacity-40"
              onClick={()=>void verifyCloudflare()}>
              {tokenChecking ? "Checking Cloudflare..." :
                preview ? "Verify domain & MCP hostname" : "Verify token and list domains"}
            </button>
            {zoneError && <p role="alert" className="rounded-lg border border-rose-700 p-2 text-rose-200">{zoneError}</p>}
            {zoneResult && <div className="grid gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3">
              <strong className="text-mint">Token active — credentials not saved</strong>
              <p>{zoneResult.zones.length} domain(s) visible to this token. Listing a domain does not establish write access or enable a tunnel.</p>
              <ul className="list-inside list-disc">
                {zoneResult.zones.map(zone=><li key={zone.id}>{zone.name} — {zone.status} ({zone.accountName})</li>)}
              </ul>
              {zoneResult.truncated && <p>Only the first 250 domains are shown.</p>}
              {zoneResult.preflight && <div className="grid gap-2 rounded-lg border border-slate-700 p-3">
                <strong className={zoneResult.preflight.status === "candidate" ? "text-mint" : "text-amber-200"}>
                  {zoneResult.preflight.status === "candidate" ? "No exact DNS collision found" : "Hostname blocked by existing DNS"}
                </strong>
                <p className="break-all">{zoneResult.preflight.hostname}</p>
                <p>{zoneResult.preflight.note}</p>
                {zoneResult.preflight.dnsRecords.map(record=>
                  <p key={record.id}>Existing DNS: {record.type} — {record.name}</p>)}
                <p className="text-amber-100">Access policy and tunnel configuration have not been verified. Provisioning remains disabled.</p>
              </div>}
            </div>}
          </div>
          <p>Claude Web supports custom remote MCP connectors. ChatGPT custom MCP features depend on the user's plan and workspace permissions; the app cannot grant those permissions.</p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-emerald-700 px-3 py-2 text-mint"
              onClick={() => void navigate("connections","claude-web")}>Setup Claude Web</button>
            <button className="rounded-lg border border-slate-600 px-3 py-2 text-slate-100"
              onClick={() => void navigate("connections","chatgpt")}>Setup ChatGPT Web</button>
          </div>
        </div>}
        {mode==="existing" && <div className="grid gap-3 rounded-xl border border-slate-700 p-4 text-xs">
          <strong className="text-sm text-white">Advanced: existing tunnel</strong>
          <p>Keep your old routes intact. Add a separate MCP hostname pointing to http://127.0.0.1:8401, protect it with a dedicated Cloudflare Access application and enable Managed OAuth.</p>
          <button className="self-start rounded-lg border border-emerald-700 px-3 py-2 text-mint"
            onClick={() => void navigate("connections","claude-web")}>Configure existing tunnel</button>
        </div>}
      </div>}
      {data && current === 3 && <div className="grid gap-3">
        <h3 className="text-lg font-bold">4. Verify Web MCP Connection</h3>
        <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-xs">
          <strong className="text-sm text-white">Setup readiness — these are separate checks</strong>
          <p>cloudflared: <strong>{sys?.cloudflaredPresent ? "Binary detected (tunnel not verified)" : "Not detected"}</strong></p>
          <p>Cloudflare identifiers: <strong>{cloudflareConfig === "configured" ? "Saved locally; Access not verified" :
            cloudflareConfig === "not-configured" ? "Not configured" :
            cloudflareConfig === "checking" ? "Checking..." : "Unavailable"}</strong></p>
          <p>Protected origin: <strong>{online ? "401 on localhost; JWT protection observed" : "Not verified"}</strong></p>
          <p>Claude/ChatGPT Web OAuth: <strong>Not verified — requires a real client login and tool call</strong></p>
        </div>
        {mode==="local" ? <>
          <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4">
            <p className="font-semibold text-amber-100">Your previous setup selected a local desktop client.</p>
            <p className="mt-2 text-xs text-slate-300">This wizard now focuses on Web MCP for Claude Web and ChatGPT Web. Choose Web MCP to configure a protected remote connection.</p>
          </div>
          <button className="self-start rounded-lg border border-emerald-700 px-3 py-2 text-xs text-mint"
            onClick={() => void update({ mode: "new", step: 2 })}>Switch to Web MCP</button>
        </> : <>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <p>Remote MCP HTTP: <strong className={online?"text-mint":"text-amber-200"}>
              {online?"Listening; anonymous requests rejected (401)":"Not confirmed running"}
            </strong></p>
            <p className="mt-2 text-xs text-slate-400">This does NOT prove Cloudflare Tunnel, Access OAuth or any AI web client is connected. The real test is OAuth login followed by initialize, tools/list and list_roots.</p>
            <button className="mt-3 flex items-center gap-1 text-xs text-sky-300"
              onClick={() => void load()}><RefreshCw size={14}/> Recheck local listener</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-emerald-700 px-3 py-2 text-xs text-mint"
              onClick={() => void navigate("connections","claude-web")}>Configure Claude Web</button>
            <button className="rounded-lg border border-slate-600 px-3 py-2 text-xs"
              onClick={() => void navigate("connections","chatgpt")}>Configure ChatGPT Web</button>
          </div>
        </>}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
        <button disabled={busy} className="px-2 py-2 text-xs text-slate-400" onClick={() => void close()}>
          Save & close (resume from Settings)
        </button>
        <div className="flex gap-2">
          <button disabled={!data || busy || current===0} className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs disabled:opacity-40"
            onClick={() => void update({ step:Math.max(0,current-1) })}><ArrowLeft size={14}/> Back</button>
          {current<3?<button disabled={!data || busy || (current===2 && !mode)}
            className="flex items-center gap-1 rounded-lg bg-mint px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
            onClick={() => void update({ step:current+1 })}>Next <ArrowRight size={14}/></button>:
            <button disabled={busy} className="rounded-lg bg-mint px-3 py-2 text-xs font-bold text-slate-950"
              onClick={() => void close()}>Save progress</button>}
        </div>
      </div>
    </div>
  </Modal>;
}
