"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, ExternalLink, LockKeyhole, ShieldAlert } from "lucide-react";
import { Modal, Tag } from "@/components/ui";

type Provider = "chatgpt" | "claude-web";

export default function RemoteTunnelSetup({
  provider, onClose,
}: { provider: Provider; onClose: () => void }) {
  const [hostname, setHostname] = useState("");
  const [team, setTeam] = useState("");
  const [audience, setAudience] = useState("");
  const [port, setPort] = useState("8401");
  const [copied, setCopied] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const domainValid = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(hostname.trim()) &&
    !hostname.trim().startsWith("http");
  const teamValid = /^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team.trim());
  const audValid = audience.trim().length >= 16 && !/\s/.test(audience);
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535 && ![3100,3030,8001].includes(portNumber);
  const prepared = domainValid && teamValid && audValid && portValid;
  const values = useMemo(() => {
    const host = hostname.trim().toLowerCase();
    // MCP HTTP loads these validated settings from the user's private state.
    // No environment variables or secrets need to be copied into the shell.
    const launch = "npm run mcp:http";
    return {
      launch,
      remoteUrl: "https://" + host + "/mcp",
      originUrl: "http://127.0.0.1:" + port,
    };
  }, [hostname, port]);

  useEffect(() => {
    let active = true;
    void fetch("/api/local/cloudflare", { cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as {
          config?: { teamDomain: string; applicationAudience: string; publicHostname: string; port: number } | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Cannot load saved configuration.");
        if (!active) return;
        if (payload.config) {
          setTeam(payload.config.teamDomain);
          setAudience(payload.config.applicationAudience);
          setHostname(payload.config.publicHostname);
          setPort(String(payload.config.port));
          setSaved(true);
        }
      })
      .catch(error => { if (active) setConfigError(error instanceof Error ? error.message : "Configuration unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveConfig() {
    if (!prepared) return;
    setSaving(true);
    setConfigError("");
    try {
      const response = await fetch("/api/local/cloudflare", {
        method: "PUT", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-local-mcp-action": "dashboard" },
        body: JSON.stringify({
          teamDomain: team.trim(), applicationAudience: audience.trim(),
          publicHostname: hostname.trim(), port: portNumber,
        }),
      });
      const payload = await response.json() as { config?: unknown; error?: string };
      if (!response.ok || !payload.config) throw new Error(payload.error || "Configuration was not saved.");
      setSaved(true);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "Failed to save.");
    } finally { setSaving(false); }
  }

  async function clearConfig() {
    if (!window.confirm("Remove saved Cloudflare settings from this computer? This does not delete the Cloudflare Tunnel.")) return;
    setSaving(true);
    setConfigError("");
    try {
      const response = await fetch("/api/local/cloudflare", {
        method: "DELETE", headers: { "Content-Type": "application/json", "x-local-mcp-action": "dashboard" },
      });
      if (!response.ok) {
        const payload = await response.json() as {error?: string};
        throw new Error(payload.error || "Unable to clear settings.");
      }
      setSaved(false);
      setHostname("");
      setTeam("");
      setAudience("");
      setPort("8401");
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "Failed to clear.");
    } finally { setSaving(false); }
  }

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { setCopied("Copy blocked by browser. Select text manually."); }
  }

  return <Modal title="Cloudflare Tunnel · Remote MCP"
    subtitle={provider === "chatgpt" ? "Remote endpoint for ChatGPT Web" : "Remote endpoint for Claude Web"}
    onClose={onClose} width="wide">
    <div className="grid gap-4 text-xs text-slate-300">
      <div className="flex flex-wrap gap-2">
        <Tag kind="purple">Streamable HTTP</Tag>
        <Tag kind="success">Cloudflare Access OAuth</Tag>
        <Tag kind="blue">Read-only</Tag>
      </div>
      <div className="rounded-xl border border-amber-800/70 bg-amber-950/30 p-4">
        <div className="flex items-center gap-2 font-bold text-amber-200"><ShieldAlert size={17}/> Belum siap dibuka ke internet</div>
        <p className="mt-2 leading-5 text-amber-100">Jangan buat tunnel tanpa Cloudflare Access dengan Managed OAuth dan kebijakan izin hanya untuk akunmu. Endpoint MCP menolak koneksi tanpa JWT Access valid. Dashboard Next.js port 3100 tidak boleh dimasukkan ke tunnel.</p>
      </div>
      <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/50 p-4 leading-5">
        <h3 className="font-bold text-slate-100">1. Siapkan Cloudflare</h3>
        <p>Buat aplikasi <strong>Cloudflare Access</strong> untuk satu hostname MCP. Izinkan alamat email milikmu saja dan aktifkan <strong>Managed OAuth</strong>.</p>
        <p>Di <strong>Cloudflare Zero Trust → Networking → Tunnels</strong>, buat tunnel dan route Published application untuk hostname MCP tersebut, diarahkan ke <code className="text-mint">{values.originUrl}</code>.</p>
        <p>Aktifkan <strong>Protect with Access</strong> pada route tunnel bila tersedia. Klien MCP web harus mendukung OAuth resource indicator (RFC 8707). Jangan gunakan Quick Tunnel publik tanpa Access.</p>
        <a href="https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sky-300 hover:underline">Dokumentasi Managed OAuth <ExternalLink size={13}/></a>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h3 className="font-bold text-slate-100">2. Isi pengaturan server MCP</h3>
        <label className="grid gap-1.5">Public hostname MCP (tanpa https://)
          <input value={hostname} onChange={e=>{setHostname(e.target.value);setSaved(false);}} placeholder="mcp.contohdomain.com"
            className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint"/>
        </label>
        <label className="grid gap-1.5">Cloudflare Access team domain
          <input value={team} onChange={e=>{setTeam(e.target.value);setSaved(false);}} placeholder="namatim.cloudflareaccess.com"
            className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint"/>
        </label>
        <label className="grid gap-1.5">Access Application AUD tag
          <input value={audience} onChange={e=>{setAudience(e.target.value);setSaved(false);}} placeholder="Audience tag dari Cloudflare Access"
            className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint"/>
        </label>
        <p className="text-[11px] text-slate-400">Hostname, team domain dan AUD disimpan di konfigurasi lokal pengguna, bukan di GitHub atau browser. Menyimpan data tidak membuat tunnel otomatis. <strong>Jangan masukkan tunnel token atau API key.</strong></p>
        <label className="grid gap-1.5">Local MCP HTTP port
          <input type="number" min={1024} max={65535} value={port}
            onChange={e=>{setPort(e.target.value);setSaved(false);}}
            className="rounded-lg border border-slate-600 bg-slate-800 p-2.5 text-slate-100 outline-none focus:border-mint"/>
        </label>
        <p className="text-[11px] text-slate-400">Jika MCP HTTP sudah berjalan, restart prosesnya agar pengaturan baru berlaku. Port pada Cloudflare Tunnel harus sama dengan port lokal di atas.</p>
        {loading && <p className="text-slate-400">Memuat konfigurasi tersimpan...</p>}
        {saved ? <Tag kind="success"><Check size={12}/> Saved locally (not connected)</Tag> :
          <p className="text-amber-200">Isi ketiga kolom dengan nilai Cloudflare yang valid, kemudian simpan untuk menampilkan perintah.</p>}
        {configError && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-rose-200">{configError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!prepared || loading || saving}
            className="rounded-lg bg-mint px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
            onClick={() => void saveConfig()}>{saving ? "Saving..." : saved ? "Save again" : "Save locally"}</button>
          {saved && <button type="button" disabled={saving} onClick={() => void clearConfig()}
            className="rounded-lg border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800">Clear saved config</button>}
        </div>
      </div>

      {prepared && saved && <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h3 className="font-bold text-slate-100">3. Jalankan MCP HTTP lokal</h3>
        <p>Di terminal Windows, macOS, atau Linux pada direktori project, setelah <code>npm install</code> dan <code>npm run audit:all</code> berhasil. Server menggunakan konfigurasi yang disimpan:</p>
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[#0a1019] p-3 text-[11px] text-emerald-200">{values.launch}</pre>
          <button className="rounded-lg border border-slate-600 p-2 text-slate-100 hover:bg-slate-700" onClick={()=>void copy(values.launch,"launch")} aria-label="Copy launch command">{copied==="launch"?<Check size={16}/>:<Clipboard size={16}/>}</button>
        </div>
        <p>Pastikan <code>cloudflared</code> berjalan dengan tunnel aktif. Public URL MCP:</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all text-sky-300">{values.remoteUrl}</code>
          <button className="rounded-lg border border-slate-600 p-2 text-slate-100 hover:bg-slate-700" onClick={()=>void copy(values.remoteUrl,"url")} aria-label="Copy MCP URL">{copied==="url"?<Check size={16}/>:<Clipboard size={16}/>}</button>
        </div>
      </div>}

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 leading-5">
        <div className="flex items-center gap-2 font-bold text-slate-100"><LockKeyhole size={16} className="text-mint"/> 4. Hubungkan ke layanan web</div>
        <p className="mt-2">{provider === "chatgpt" ?
          "Buka Plugins di ChatGPT Web → Add custom MCP server (jika tersedia di paket/workspace kamu), gunakan HTTPS URL dari atas dan selesaikan OAuth Cloudflare Access." :
          "Di Claude Web buka Customize → Connectors → Add custom connector, masukkan HTTPS URL dari atas dan ikuti sign-in Cloudflare Access."}</p>
        <p className="mt-2 text-slate-400">Ketersediaan custom MCP bergantung pada paket/izin akun. Kompatibilitas Cloudflare Managed OAuth dengan ChatGPT/Claude perlu diverifikasi lewat login dan uji tool sungguhan. Fitur ini tidak otomatis menghubungkan atau menguji koneksi layanan web.</p>
      </div>
      {copied && copied !== "url" && copied !== "launch" && <p role="status" className="text-amber-200">{copied}</p>}
      <div className="flex justify-end">
        <button className="rounded-lg bg-mint px-4 py-2 font-bold text-emerald-950" onClick={onClose}>Tutup</button>
      </div>
    </div>
  </Modal>;
}
