"use client";

import { useCallback, useEffect, useState } from "react";

const headers = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };

async function read(path) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401
    ? "Sesi browser berakhir. Buka ulang dashboard melalui perintah start di terminal."
    : "Status layanan tidak dapat diperiksa (HTTP " + response.status + ").");
  return response.json();
}
async function action(path, name) {
  const response = await fetch(path, {
    method: "POST", credentials: "same-origin", cache: "no-store", headers,
    body: JSON.stringify({ action: name }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "Permintaan gagal (HTTP " + response.status + ").");
  return value;
}
const steps = [
  { title: "File Access", description: "Pilih folder lokal yang boleh dibaca AI.", href: "/", label: "Kelola di File Access" },
  { title: "Cloudflare Credential", description: "Verifikasi token dan simpan ke OS Keychain.", href: "/credential-vault", label: "Kelola credential" },
  { title: "Access, OAuth & DNS", description: "Buat proteksi identitas dan satu hostname MCP.", href: "/cloudflare-setup", label: "Konfigurasi Cloudflare" },
  { title: "Remote MCP Configuration", description: "Impor hostname, Access audience, dan pengaturan listener.", href: "/cloudflare-config", label: "Periksa konfigurasi" },
  { title: "OAuth Client Callbacks", description: "Kelola callback ChatGPT dan Claude tanpa membuat Tunnel ulang.", href: "/oauth-settings", label: "Kelola redirect URL" },
];
function Status({ tone, children }) {
  return <span className={"rounded-full px-2.5 py-1 text-xs font-medium " +
    (tone === "ok" ? "bg-emerald-950 text-emerald-200" :
      tone === "warn" ? "bg-amber-950 text-amber-200" : "bg-slate-800 text-slate-300")}>
    {children}
  </span>;
}
export default function SetupCenterPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [issue, setIssue] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setIssue("");
    try {
      const owner = await read("/api/local/owner");
      if (owner.paired !== true) {
        setData({ paired: false });
        setIssue("Browser belum memiliki sesi pemilik yang aktif. Jalankan dashboard menggunakan npm start.");
        return;
      }
      const results = await Promise.allSettled([
        read("/api/local/policy"),
        read("/api/local/cloudflare/deployment"),
        read("/api/local/status"),
        read("/api/local/service"),
        read("/api/local/tunnel"),
      ]);
      setData({
        paired: true,
        policy: results[0].status === "fulfilled" ? results[0].value : null,
        deployment: results[1].status === "fulfilled" ? results[1].value : null,
        remote: results[2].status === "fulfilled" ? results[2].value : null,
        service: results[3].status === "fulfilled" ? results[3].value : null,
        tunnel: results[4].status === "fulfilled" ? results[4].value : null,
      });
      if (results.some(x => x.status === "rejected")) {
        setIssue("Sebagian status belum tersedia. Periksa konfigurasi pada tahap terkait.");
      }
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Status dashboard tidak dapat dimuat.");
      setData(null);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function control(path, actionName, description) {
    if (busy || data?.paired !== true) return;
    setBusy(true);
    setNotice("");
    setIssue("");
    try {
      await action(path, actionName);
      setNotice(description + ". Status akan diperiksa ulang.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Perubahan status belum dapat diverifikasi.");
    } finally {
      setBusy(false);
      void refresh();
    }
  }
  const folderCount = data?.policy?.policy?.roots?.filter(x => x.enabled)?.length ?? 0;
  const phase = data?.deployment?.phase || "not-started";
  const mcp = data?.remote?.remoteHttp?.state === "listening-protected";
  const tunnel = data?.tunnel?.status?.state === "running";
  const url = data?.deployment?.hostname ? "https://" + data.deployment.hostname + "/mcp" : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-5 text-slate-100 sm:p-8">
      <header className="space-y-2">
        <a href="/" className="text-sm text-sky-300 hover:underline">Dashboard</a>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Setup Center</h1>
            <p className="mt-1 text-sm text-slate-400">Satu tempat untuk menyiapkan koneksi AI dengan aman.</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void refresh()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40">
            Perbarui status
          </button>
        </div>
      </header>
      {notice && <p role="status" className="rounded-lg border border-emerald-800 p-3 text-sm text-emerald-200">{notice}</p>}
      {issue && <p role="alert" className="rounded-lg border border-amber-800 p-3 text-sm text-amber-200">{issue}</p>}
      {data?.paired === true && <>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400">Folder disetujui</p>
            <p className="mt-2 text-xl font-semibold">{folderCount}</p>
            <Status tone={folderCount ? "ok" : "warn"}>{folderCount ? "Tersedia" : "Belum ada"}</Status>
          </div>
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400">Cloudflare deployment</p>
            <p className="mt-2 text-xl font-semibold">{phase}</p>
            <Status tone={phase === "published" ? "ok" : "warn"}>
              {phase === "published" ? "Tersimpan" : "Perlu pemeriksaan"}
            </Status>
          </div>
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-xs text-slate-400">MCP listener & Tunnel</p>
            <p className="mt-2 text-xl font-semibold">{mcp && tunnel ? "Berjalan" : "Perlu pemeriksaan"}</p>
            <Status tone={mcp && tunnel ? "ok" : "warn"}>
              {mcp ? "MCP aktif" : "MCP tidak terdeteksi"} · {tunnel ? "Tunnel aktif" : "Tunnel belum terkonfirmasi"}
            </Status>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Langkah konfigurasi</h2>
          {steps.map((step, i) => (
            <div key={step.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">{i + 1}</span>
                <div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{step.description}</p>
                </div>
              </div>
              <a href={step.href}
                className="rounded-lg border border-sky-600 px-3 py-2 text-sm text-sky-200 hover:bg-slate-800">
                {step.label}
              </a>
            </div>
          ))}
        </section>
        <section className="space-y-3 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold">Jalankan layanan</h2>
          <p className="text-sm text-slate-400">Semua layanan tetap berjalan di perangkat ini. Pengaturan tidak mengekspose dashboard ke internet.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Status tone={mcp ? "ok" : "warn"}>Remote MCP: {mcp ? "Protected listener" : "Belum aktif"}</Status>
            <button type="button" disabled={busy} onClick={() => void control("/api/local/service", "start", "Permintaan start MCP dikirim")}
              className="rounded-lg border border-sky-600 px-3 py-2 text-sm text-sky-200 disabled:opacity-40">Start MCP</button>
            <button type="button" disabled={busy} onClick={() => void control("/api/local/service", "stop", "Permintaan stop MCP dikirim")}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40">Stop MCP</button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Status tone={tunnel ? "ok" : "warn"}>Tunnel: {tunnel ? "Managed process active" : "Belum aktif/di luar kontrol dashboard"}</Status>
            <button type="button" disabled={busy} onClick={() => void control("/api/local/tunnel", "start", "Permintaan start Tunnel dikirim")}
              className="rounded-lg border border-sky-600 px-3 py-2 text-sm text-sky-200 disabled:opacity-40">Start Tunnel</button>
            <button type="button" disabled={busy} onClick={() => void control("/api/local/tunnel", "stop", "Permintaan stop Tunnel dikirim")}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40">Stop Tunnel</button>
          </div>
        </section>
        <section className="space-y-2 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold">Hubungkan AI Assistant</h2>
          <p className="text-sm text-slate-400">Gunakan Server URL yang sama di ChatGPT dan Claude. Setiap client memiliki callback OAuth masing-masing.</p>
          <p className="break-all rounded-lg bg-slate-950 p-3 font-mono text-sm">{url || "Hostname belum dipublikasikan"}</p>
          <div className="flex flex-wrap gap-3">
            <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Buka ChatGPT</a>
            <a href="https://claude.ai/" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Buka Claude</a>
          </div>
          <p className="text-xs text-slate-400">Konektor belum diverifikasi hanya berdasarkan status proses lokal. Uji list_roots di masing-masing client.</p>
        </section>
      </>}
    </main>
  );
}
