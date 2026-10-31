"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ClipboardCopy, ExternalLink, FolderLock, RefreshCw, Terminal } from "lucide-react";
import { Modal, Tag } from "@/components/ui";
import { useDashboard } from "@/context/dashboard-context";
import type { LocalClientSetupInfo } from "@/server/setup/index";

type Client = "claude-desktop" | "claude-code";

function quoteArgument(value: string, platform: string): string {
  if (platform === "win32") return "'" + value.replaceAll("'", "''") + "'";
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export default function LocalClientSetup({
  client, onClose, onReviewRoots,
}: {
  client: Client;
  onClose: () => void;
  onReviewRoots: () => void;
}) {
  const { roots } = useDashboard();
  const [setup, setSetup] = useState<LocalClientSetupInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  const loadSetup = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/local/setup", { cache: "no-store", signal });
      const payload = await response.json() as { setup?: LocalClientSetupInfo; error?: string };
      if (!response.ok || !payload.setup) throw new Error(payload.error || "Cannot load local setup information.");
      if (signal?.aborted) return;
      setSetup(payload.setup);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Unknown connection error.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSetup(controller.signal);
    return () => controller.abort();
  }, [loadSetup]);

  const config = useMemo(() => {
    if (!setup) return null;
    const serverConfig = {
      command: setup.nodeCommand,
      args: setup.args,
      ...(setup.stateDirectoryOverride ? { env: { LOCAL_MCP_STATE_DIR: setup.stateDirectoryOverride } } : {}),
    };
    const json = JSON.stringify({ mcpServers: { "local-mcp-manager": serverConfig } }, null, 2);
    const envFlag = setup.stateDirectoryOverride
      ? "--env " + quoteArgument("LOCAL_MCP_STATE_DIR=" + setup.stateDirectoryOverride, setup.platform) + " "
      : "";
    const command = "claude mcp add --scope user " + envFlag + "--transport stdio local-mcp-manager -- " +
      [setup.nodeCommand, ...setup.args].map(item => quoteArgument(item, setup.platform)).join(" ");
    return { json, command };
  }, [setup]);

  async function copy(value: string, name: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
    } catch {
      setCopied("Clipboard permission denied. Select and copy the text manually.");
    }
  }

  const isDesktop = client === "claude-desktop";
  const approved = roots.filter(root => root.enabled).length;

  return <Modal title={isDesktop ? "Connect Claude Desktop" : "Connect Claude Code"}
    subtitle="Panduan konfigurasi MCP lokal — tidak mengubah pengaturan Claude secara otomatis."
    onClose={onClose} width="wide">
    <div className="grid gap-4 text-xs text-slate-300">
      <div className="flex flex-wrap items-center gap-2">
        <Tag kind="success">Local stdio · read-only</Tag>
        <Tag>{setup?.platform || "Device"}</Tag>
        <span className="text-slate-400">Konfigurasi khusus komputer ini</span>
      </div>

      {loading && <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 p-4">
        <RefreshCw className="animate-spin" size={17} /> Memeriksa Node.js dan file MCP lokal...
      </div>}
      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-4 text-rose-200">
        <AlertCircle size={16} className="mr-2 inline"/> {error}
        <button className="ml-3 font-semibold underline" onClick={() => void loadSetup()}>Coba lagi</button>
      </div>}

      {setup && !setup.dependenciesReady && <div role="alert" className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-amber-200">
        <strong>Persyaratan belum lengkap:</strong> {setup.missing.join(", ")}.
        Jalankan <code className="rounded bg-slate-900 px-1.5 py-1">npm install</code> di direktori project sebelum menghubungkan Claude.
      </div>}

      {setup && <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 font-semibold text-slate-100"><FolderLock size={17} className="text-emerald-300"/> Folder yang disetujui: {approved}</div>
        <p className="mt-2 leading-5 text-slate-400">Claude hanya dapat meminta akses ke folder dalam allowlist. Proses MCP membaca perubahan konfigurasi saat koneksi baru dimulai.</p>
        {approved === 0 && <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-800 px-3 py-2 font-semibold text-emerald-200 hover:bg-emerald-950/60" onClick={onReviewRoots}>Atur folder dahulu</button>}
      </div>}

      {config && <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-100">{isDesktop ? "Konfigurasi JSON" : "Perintah terminal"}</h3>
          <button disabled={!setup?.dependenciesReady} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            onClick={() => void copy(isDesktop ? config.json : config.command, isDesktop ? "JSON" : "Command")}>
            {copied === (isDesktop ? "JSON" : "Command") ? <Check size={15}/> : <ClipboardCopy size={15}/>}
            {copied === (isDesktop ? "JSON" : "Command") ? "Disalin" : "Copy"}
          </button>
        </div>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-700 bg-[#0a1019] p-4 text-[11px] leading-5 text-emerald-200"><code>{isDesktop ? config.json : config.command}</code></pre>
        {isDesktop ? <div className="grid gap-2 leading-5 text-slate-400">
          <p><strong className="text-slate-200">1.</strong> Buka file konfigurasi Claude Desktop: <code className="break-all text-sky-300">{setup?.desktopConfigFile || "Lokasi konfigurasi tidak dikenali"}</code>.</p>
          <p><strong className="text-slate-200">2.</strong> Tambahkan entry <code className="text-sky-300">local-mcp-manager</code> ke objek <code>mcpServers</code> yang sudah ada. <strong>Jangan menimpa konfigurasi MCP lain.</strong></p>
          <p><strong className="text-slate-200">3.</strong> Restart Claude Desktop, lalu periksa daftar local MCP tools dan coba <code>list_roots</code>.</p>
          {setup?.platform === "linux" && <p className="text-amber-200">Catatan Arch Linux: lokasi konfigurasi bergantung pada paket Claude Desktop yang kamu pasang. Gunakan menu Edit Config jika berbeda.</p>}
        </div> : <div className="grid gap-2 leading-5 text-slate-400">
          <p><strong className="text-slate-200">1.</strong> Jalankan perintah di atas pada terminal yang memiliki Claude Code CLI.</p>
          <p><strong className="text-slate-200">2.</strong> Verifikasi dengan <code className="text-sky-300">claude mcp get local-mcp-manager</code>, lalu cek <code>/mcp</code> dalam sesi Claude Code.</p>
          <p><strong className="text-slate-200">3.</strong> Mintalah Claude memanggil <code>list_roots</code> untuk memastikan tool dapat digunakan.</p>
          <p>Perintah ini menggunakan <code>--scope user</code>, sehingga konfigurasi berlaku untuk sesi Claude Code milik pengguna ini. Periksa izin folder terlebih dahulu.</p>
          {setup?.platform === "win32" && <p className="text-amber-200">Perintah Windows disiapkan untuk PowerShell.</p>}
        </div>}
        {copied && copied !== "JSON" && copied !== "Command" && <p role="status" className="text-amber-200">{copied}</p>}
        <a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-sky-300 hover:underline">
          Panduan MCP Claude Code <ExternalLink size={14}/>
        </a>
      </div>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-4">
        <button className="rounded-lg border border-slate-600 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-800" onClick={onClose}>Tutup</button>
        <button className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 font-bold text-emerald-950 hover:bg-emerald-200" onClick={onReviewRoots}><Terminal size={15}/> File Access</button>
      </div>
    </div>
  </Modal>;
}
