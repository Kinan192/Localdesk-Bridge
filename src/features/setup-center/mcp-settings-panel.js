"use client";

import { useEffect, useState } from "react";

const ownerHeaders = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };

async function read(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) throw new Error("Sesi pemilik diperlukan untuk mengubah konfigurasi. Buka ulang dashboard melalui launcher lokal.");
  if (!response.ok) throw new Error("Gagal membaca konfigurasi lokal.");
  return response.json();
}

export function MCPSettingsPanel({ embedded = false, onNavigateStep = null, onConfigured = null }) {
  const [paired, setPaired] = useState(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(null);
  const [importIssue, setImportIssue] = useState("");
  const [teamDomain, setTeamDomain] = useState("");
  const [applicationAudience, setApplicationAudience] = useState("");
  const [publicHostname, setPublicHostname] = useState("");
  const [port, setPort] = useState(8401);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Membaca konfigurasi dari deployment Cloudflare...");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        // Pairing is checked before requesting any owner-only configuration.
        const owner = await read("/api/local/owner");
        if (!active) return;
        if (owner?.paired !== true) {
          setPaired(false);
          setMessage("Pairing owner dari dashboard lokal diperlukan.");
          return;
        }
        // Existing configuration must remain readable and authoritative.
        // A failed optional Cloudflare Organization lookup must not hide it.
        const existing = await read("/api/local/cloudflare");
        if (!active) return;
        setPaired(true);
        // Saved settings are authoritative: show them immediately, without
        // waiting for the optional Cloudflare provider request to complete.
        const current = existing.config;
        if (existing.configured && current) {
          setSaved(true);
          setTeamDomain(current.teamDomain);
          setApplicationAudience(current.applicationAudience);
          setPublicHostname(current.publicHostname);
          setPort(current.port);
          setImportIssue("");
          setMessage("Konfigurasi Remote MCP tersimpan. Tidak akan ditimpa otomatis.");
          return;
        }
        // Optional import may fail if Cloudflare Organizations Read/Keychain is
        // unavailable. Never treat that as proof the saved local config is absent.
        const imported = await read("/api/local/cloudflare/import-preview").catch(() => null);
        const importedPreview = imported?.preview || null;
        // When the optional preview endpoint is unavailable, existing local
        // deployment metadata can still prefill hostname and Access AUD.
        // It is explicitly a local snapshot, not an external verification.
        let localFallback = null;
        if (!importedPreview && !existing.configured) {
          const deployment = await read("/api/local/cloudflare/deployment").catch(() => null);
          if (deployment && ["access-ready", "tunnel-ready", "published"].includes(deployment.phase) &&
              typeof deployment.hostname === "string" &&
              typeof deployment.accessAudience === "string" &&
              deployment.accessAudience) {
            localFallback = {
              publicHostname: deployment.hostname,
              applicationAudience: deployment.accessAudience,
              teamDomain: null,
              teamDomainNeedsEntry: true,
              port: 8401,
              deploymentPhase: deployment.phase,
              source: "local-deployment-fallback",
            };
          }
        }
        if (!active) return;
        const availablePreview = importedPreview || localFallback;
        setPreview(availablePreview);
        setImportIssue(importedPreview ? "" : localFallback
          ? "Hasil impor Cloudflare tidak tersedia. Hostname dan AUD diisi dari metadata deployment lokal; verifikasi sebelum menyimpan."
          : "Tidak ada konfigurasi yang dapat diimpor. Isi manual hanya jika Anda sudah memverifikasi informasi Cloudflare.");
        if (availablePreview) {
          setApplicationAudience(availablePreview.applicationAudience);
          setPublicHostname(availablePreview.publicHostname);
          setTeamDomain(availablePreview.teamDomain || "");
          setPort(availablePreview.port);
          setMessage(availablePreview.teamDomain
            ? "Hostname, AUD, dan Team Domain tersedia untuk ditinjau. Belum disimpan."
            : "Hostname dan AUD berasal dari deployment lokal. Team Domain harus diisi dari Cloudflare Zero Trust sebelum menyimpan.");
        } else {
          setMessage("Konfigurasi belum tersimpan dan hasil impor tidak tersedia. Form dapat diisi manual; tidak ada perubahan otomatis.");
        }
      } catch {
        if (active) {
          setPaired(false);
          setMessage("Sesi owner atau konfigurasi lokal tidak dapat diverifikasi. Perubahan dinonaktifkan.");
        }
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    if (!paired || !publicHostname || !applicationAudience || !teamDomain || busy) return;
    setBusy(true);
    setMessage("Menyimpan identifier nonrahasia ke konfigurasi MCP lokal...");
    try {
      const response = await fetch("/api/local/cloudflare", {
        method: "PUT", credentials: "same-origin", cache: "no-store",
        headers: ownerHeaders,
        body: JSON.stringify({ teamDomain, applicationAudience, publicHostname, port: Number(port) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.configured !== true) throw new Error(
        "Konfigurasi tidak dapat disimpan. Periksa Team Domain, hostname, dan AUD.",
      );
      setSaved(true);
      if (onConfigured) void onConfigured();
      setMessage("Konfigurasi Remote MCP tersimpan. Kembali ke AI Connections lalu klik Refresh dan Start MCP HTTP.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penyimpanan tidak berhasil.");
    } finally { setBusy(false); }
  }

  return (
    <div className={embedded ? "min-w-0 space-y-4 text-slate-100" : "space-y-6 text-slate-100"}>
      {embedded
        ? <h4 className="text-base font-semibold">Import Cloudflare ke Remote MCP</h4>
        : <h1 className="text-3xl font-semibold">Import Cloudflare ke Remote MCP</h1>}
      <p className="text-sm leading-6 text-slate-300">
        Menggunakan kembali hostname dan Access AUD yang sudah dibuat oleh Cloudflare Setup.
        Tidak membuat Tunnel, DNS, Access, atau menjalankan proses apa pun.
      </p>
      <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <p role="status" aria-live="polite" className="rounded-lg border border-slate-600 p-3 text-sm">{message}</p>
        {importIssue && <p role="status" className="text-sm text-amber-200">{importIssue}</p>}
        {preview && (
          <div className="space-y-2 text-sm text-slate-300">
            <p>Deployment phase: <strong>{preview.deploymentPhase}</strong></p>
            <p>Sumber: <strong>{preview.source === "local-deployment-fallback" ? "Metadata deployment lokal (belum diverifikasi ulang ke Cloudflare)" : "Cloudflare Setup lokal"}</strong></p>
            {preview.deploymentPhase !== "published" && (
              <p className="text-amber-300">
                Tunnel/DNS belum tercatat sebagai published. Pastikan tahap itu selesai sebelum menyambungkan klien Web.
              </p>
            )}
          </div>
        )}
        {paired === true && (
          <form onSubmit={save} className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span>Hostname publik MCP</span>
              <input value={publicHostname} onChange={e => setPublicHostname(e.target.value)}
                required disabled={busy}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Access Application AUD</span>
              <input value={applicationAudience} onChange={e => setApplicationAudience(e.target.value)}
                required disabled={busy}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Access Team Domain</span>
              <input value={teamDomain} onChange={e => setTeamDomain(e.target.value)}
                placeholder="namateam.cloudflareaccess.com" required disabled={busy}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            {preview?.teamDomainNeedsEntry && !saved && (
              <p className="text-xs leading-5 text-amber-200">
                Temukan Team Domain di Cloudflare Zero Trust → Settings → Team name and domain.
                Ini berbeda dengan domain publik MCP. Tidak perlu menambah izin API hanya untuk mengisinya.
              </p>
            )}
            <label className="block space-y-1 text-sm">
              <span>Port MCP HTTP lokal</span>
              <input type="number" min={1024} max={65535} value={port}
                onChange={e => setPort(e.target.value)} disabled={busy}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            <button type="submit" disabled={busy || !teamDomain || !publicHostname || !applicationAudience}
              className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
              {busy ? "Menyimpan..." : saved ? "Perbarui konfigurasi MCP" : "Simpan konfigurasi MCP"}
            </button>
          </form>
        )}
      </section>
      {saved && (embedded && onNavigateStep ? (
        <button type="button" onClick={() => onNavigateStep(6)}
          className="inline-flex rounded-lg border border-sky-500 px-4 py-2 font-medium text-sky-200">
          Lanjut ke MCP &amp; Tunnel services
        </button>
      ) : (
        <a href="/tunnel-control"
          className="inline-flex rounded-lg border border-sky-500 px-4 py-2 font-medium text-sky-200">
          Kelola Cloudflare Tunnel (Start / Stop)
        </a>
      ))}
      <p className="text-sm text-slate-400">
        Konfigurasi ini hanya berisi identifier. Tidak menyimpan API token atau Tunnel connector token.
        Server MCP harus dijalankan secara terpisah dan tetap memverifikasi Cloudflare Access JWT.
        Dashboard port 3100 tidak dipublikasikan.
      </p>
    </div>
  );
}