"use client";

import { useEffect, useState } from "react";
import { SetupNavigation } from "@/components/setup-navigation";

const ownerHeaders = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };

async function read(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) throw new Error("Sesi pemilik diperlukan untuk mengubah konfigurasi. Buka ulang dashboard melalui launcher lokal.");
  if (!response.ok) throw new Error("Gagal membaca konfigurasi lokal.");
  return response.json();
}

export default function CloudflareConfigImportPage() {
  const [paired, setPaired] = useState(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(null);
  const [teamDomain, setTeamDomain] = useState("");
  const [applicationAudience, setApplicationAudience] = useState("");
  const [publicHostname, setPublicHostname] = useState("");
  const [port, setPort] = useState(8401);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Membaca konfigurasi dari deployment Cloudflare...");

  useEffect(() => {
    let active = true;
    Promise.all([
      read("/api/local/owner"),
      read("/api/local/cloudflare"),
      read("/api/local/cloudflare/import-preview"),
    ]).then(([owner, existing, imported]) => {
      if (!active) return;
      setPaired(owner.paired === true);
      if (owner.paired !== true) {
        setMessage("Pairing owner dari dashboard lokal diperlukan.");
        return;
      }
      setPreview(imported.preview);
      const current = existing.config;
      if (existing.configured && current) {
        setSaved(true);
        setTeamDomain(current.teamDomain);
        setApplicationAudience(current.applicationAudience);
        setPublicHostname(current.publicHostname);
        setPort(current.port);
        setMessage("Konfigurasi Remote MCP tersimpan. Tidak akan ditimpa otomatis.");
      } else if (imported.preview) {
        setApplicationAudience(imported.preview.applicationAudience);
        setPublicHostname(imported.preview.publicHostname);
        setTeamDomain(imported.preview.teamDomain || "");
        setPort(imported.preview.port);
        setMessage(imported.preview.teamDomain
          ? "Hostname, AUD, dan Team Domain berhasil ditemukan. Tinjau lalu simpan."
          : "Hostname dan AUD terisi otomatis. Team Domain perlu diisi sekali karena izin baca organisasi Cloudflare tidak tersedia.");
      } else {
        setMessage("Belum ditemukan deployment Access terverifikasi untuk diimpor.");
      }
    }).catch(error => {
      if (active) { setPaired(false); setMessage(error.message || "Gagal membaca konfigurasi."); }
    });
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
      setMessage("Konfigurasi Remote MCP tersimpan. Kembali ke AI Connections lalu klik Refresh dan Start MCP HTTP.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penyimpanan tidak berhasil.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-slate-100">
      <SetupNavigation current="/cloudflare-config" />
      
      <h1 className="text-3xl font-semibold">Import Cloudflare ke Remote MCP</h1>
      <p className="text-sm leading-6 text-slate-300">
        Menggunakan kembali hostname dan Access AUD yang sudah dibuat oleh Cloudflare Setup.
        Tidak membuat Tunnel, DNS, Access, atau menjalankan proses apa pun.
      </p>
      <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <p role="status" aria-live="polite" className="rounded-lg border border-slate-600 p-3 text-sm">{message}</p>
        {preview && (
          <div className="space-y-2 text-sm text-slate-300">
            <p>Deployment phase: <strong>{preview.deploymentPhase}</strong></p>
            <p>Sumber: <strong>Cloudflare Setup lokal</strong></p>
            {preview.deploymentPhase !== "published" && (
              <p className="text-amber-300">
                Tunnel/DNS belum tercatat sebagai published. Pastikan tahap itu selesai sebelum menyambungkan klien Web.
              </p>
            )}
          </div>
        )}
        {paired === true && (preview || saved) && (
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
      {saved && (
        <a href="/tunnel-control"
          className="inline-flex rounded-lg border border-sky-500 px-4 py-2 font-medium text-sky-200">
          Kelola Cloudflare Tunnel (Start / Stop)
        </a>
      )}
      <p className="text-sm text-slate-400">
        Konfigurasi ini hanya berisi identifier. Tidak menyimpan API token atau Tunnel connector token.
        Server MCP harus dijalankan secara terpisah dan tetap memverifikasi Cloudflare Access JWT.
        Dashboard port 3100 tidak dipublikasikan.
      </p>
    </main>
  );
}
