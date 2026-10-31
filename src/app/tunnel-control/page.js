"use client";

import { useCallback, useEffect, useState } from "react";

const endpoint = "/api/local/tunnel";
const actionHeaders = {
  "Content-Type": "application/json",
  "X-Local-MCP-Action": "dashboard",
};

export default function TunnelControlPage() {
  const [status, setStatus] = useState(null);
  const [mcpStatus, setMcpStatus] = useState(null);
  const [paired, setPaired] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Memeriksa proses Tunnel lokal...");
  const refresh = useCallback(async () => {
    const [owner, tunnel, mcp] = await Promise.all([
      fetch("/api/local/owner", { cache: "no-store", credentials: "same-origin" }),
      fetch(endpoint, { cache: "no-store", credentials: "same-origin" }),
      fetch("/api/local/service", { cache: "no-store", credentials: "same-origin" }),
    ]);
    const ownerData = owner.ok ? await owner.json() : {};
    setPaired(ownerData.paired === true);
    if (!tunnel.ok || !mcp.ok) throw new Error("Status layanan tidak dapat diakses. Pastikan sesi pemilik masih aktif dan periksa server lokal.");
    const tunnelData = await tunnel.json();
    const mcpData = await mcp.json();
    setStatus(tunnelData.status);
    setMcpStatus(mcpData.status);
    setNotice("Status proses lokal diperbarui. Status Cloudflare Healthy diperiksa di dashboard Cloudflare.");
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/local/owner", { credentials: "same-origin", cache: "no-store" }),
      fetch(endpoint, { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/local/service", { credentials: "same-origin", cache: "no-store" }),
    ]).then(async ([owner, tunnel, mcp]) => {
      if (!active) return;
      const ownerData = owner.ok ? await owner.json() : {};
      setPaired(ownerData.paired === true);
      if (!tunnel.ok || !mcp.ok) throw new Error("Owner pairing diperlukan.");
      const [tunnelData, mcpData] = await Promise.all([tunnel.json(), mcp.json()]);
      if (!active) return;
      setStatus(tunnelData.status);
      setMcpStatus(mcpData.status);
      setNotice("Status lokal dimuat. Proses cloudflared yang dijalankan manual tidak dikendalikan halaman ini.");
    }).catch(error => { if (active) setNotice(error.message || "Tidak bisa membaca status."); });
    return () => { active = false; };
  }, []);

  async function act(action) {
    if (busy || paired !== true) return;
    setBusy(true);
    setNotice(action === "start"
      ? "Mengambil token Tunnel langsung dari Cloudflare (server-side) dan menjalankan konektor..."
      : "Menghentikan konektor cloudflared yang dikelola dashboard...");
    try {
      const response = await fetch(endpoint, {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: actionHeaders, body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.status) setStatus(data.status);
      if (!response.ok) throw new Error(data.error || "Operasi Tunnel gagal.");
      setNotice(action === "start"
        ? "Proses cloudflared lokal berjalan. Verifikasi status Healthy di Cloudflare dan konfigurasi DNS secara terpisah."
        : "Proses cloudflared yang dikelola dashboard telah dihentikan.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Tidak dapat mengubah proses Tunnel.");
    } finally { setBusy(false); }
  }

  const running = status?.state === "running";
  const mcpRunning = mcpStatus?.state === "running";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-slate-100">
      <a href="/setup-center" className="text-sm text-sky-300 underline">Kembali ke Setup Center</a>
      <h1 className="text-3xl font-semibold">Cloudflare Tunnel — Start / Stop</h1>
      <p className="text-sm leading-6 text-slate-300">
        Kelola konektor Tunnel milik Local MCP Manager tanpa menyalin token.
        Token didapat langsung dari Cloudflare API menggunakan credential OS Keychain.
        Tidak dipasang sebagai service sistem dan tidak dijalankan otomatis saat boot.
      </p>
      <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-950 p-3">
            <p className="text-xs text-slate-400">Remote MCP HTTP</p>
            <p className={mcpRunning ? "font-medium text-emerald-300" : "font-medium text-amber-300"}>
              {mcpStatus?.state || "unknown"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-950 p-3">
            <p className="text-xs text-slate-400">Managed Tunnel process</p>
            <p className={running ? "font-medium text-emerald-300" : "font-medium text-slate-300"}>
              {status?.state || "unknown"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-950 p-3">
            <p className="text-xs text-slate-400">PID / Tunnel terkelola</p>
            <p className="break-all text-xs">{status?.pid ?? "—"}</p>
            <p className="break-all text-xs text-slate-400">{status?.tunnelId || "—"}</p>
            <p className="mt-1 text-xs text-slate-300">
              Dikelola dashboard: <strong>{status?.managed ? "Ya" : "Tidak"}</strong>
            </p>
          </div>
        </div>
        <p role="status" aria-live="polite" className="rounded-lg border border-slate-600 p-3 text-sm">{notice}</p>
        {status?.state === "error" && (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-600 p-3 text-sm text-amber-100">
            <p><strong>Start Tunnel dari dashboard gagal.</strong> Status Healthy di Cloudflare bisa berasal dari konektor manual lain.</p>
            <p>Tahap gagal: <strong>{status.failureStage || "belum diketahui"}</strong>
              {status.cloudflareHttpStatus !== null && status.cloudflareHttpStatus !== undefined &&
                <> — Cloudflare HTTP <strong>{status.cloudflareHttpStatus}</strong></>}
            </p>
            <p>{status.lastError || "Tidak ada proses Tunnel yang dikelola dashboard."}</p>
            {status.failureStage === "connector-token" && (
              <p>Periksa izin Cloudflare Tunnel Write pada API Token yang tersimpan di OS Keychain. Token Tunnel tidak perlu ditempel ke browser.</p>
            )}
            {status.failureStage === "cloudflared-launch" && (
              <p>Periksa instalasi cloudflared dan PATH proses dashboard. Perintah cloudflared harus tersedia bagi Next.js.</p>
            )}
            {status.failureStage === "token-format" && (
              <p>Respons token Cloudflare belum cocok dengan format aman yang didukung aplikasi. Token tidak akan ditampilkan.</p>
            )}
          </div>
        )}
        {!status?.managed && (
          <p className="text-xs text-slate-300">
            Tidak ada proses cloudflared yang dimiliki dashboard ini. Tunnel dapat tetap Healthy jika ada replica lain yang dijalankan manual.
          </p>
        )}
        {paired === false && <p className="text-sm text-amber-200">Owner pairing diperlukan.</p>}
        {!mcpRunning && (
          <p className="text-sm text-amber-200">
            Mulai dari AI Connections → Remote MCP Service → Start MCP HTTP sebelum menyalakan Tunnel.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || paired !== true || !mcpRunning || running ||
              status?.state === "starting" || status?.state === "stopping"}
            onClick={() => void act("start")}
            className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
            Start Tunnel
          </button>
          <button type="button" disabled={busy || paired !== true || !status?.managed ||
              status?.state === "starting" || status?.state === "stopping"}
            onClick={() => void act("stop")}
            className="rounded-lg border border-slate-500 px-4 py-2 font-semibold disabled:opacity-40">
            Stop Tunnel
          </button>
          <button type="button" disabled={busy || paired !== true}
            onClick={() => { setBusy(true); void refresh().catch(error =>
              setNotice(error.message || "Gagal memuat status.")).finally(() => setBusy(false)); }}
            className="rounded-lg border border-slate-500 px-4 py-2 disabled:opacity-40">
            Refresh
          </button>
        </div>
        <p className="text-xs leading-5 text-amber-200">
          Jika Tunnel yang sama masih berjalan di terminal manual, hentikan dengan Ctrl+C sebelum
          menggunakan Start Tunnel di sini, agar tidak membuat replica tambahan.
          Tombol Stop tidak dapat mematikan proses atau service cloudflared lain yang sudah ada.
        </p>
      </section>
      <section className="space-y-2 text-sm text-slate-300">
        <h2 className="font-semibold text-slate-100">Verifikasi berikutnya</h2>
        <p>Periksa Tunnel baru menjadi Healthy di Cloudflare Dashboard dan DNS hostname mengarah ke
          Tunnel itu. Kemudian uji autentikasi Access dan MCP dari ChatGPT atau Claude Web.
          Proses running saja bukan bukti OAuth atau koneksi klien berhasil.</p>
        <p><a className="text-sky-300 underline" href="/cloudflare-setup">Buka Cloudflare Setup</a></p>
      </section>
    </main>
  );
}
