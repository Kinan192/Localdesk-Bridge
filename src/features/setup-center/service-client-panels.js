"use client";

import { publicMcpUrl, serviceFacts } from "./service-facts";

const buttonClass = "rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40";
const statusClass = "rounded-lg border border-slate-700 bg-slate-950/50 p-3";

export function ServiceControlPanel({ service, tunnel, remote, deployment, busy, onControl, onRefresh }) {
  const facts = serviceFacts(service, tunnel, remote, busy);
  const canRead = service && tunnel && remote;
  const phase = typeof deployment?.phase === "string" ? deployment.phase : "unknown";

  return (
    <section className="space-y-4" aria-label="Status layanan lokal">
      <p className="text-sm text-slate-300">Kelola proses LocalDesk dari sini. Semua data berasal dari status owner-protected lokal. Tidak ada pemeriksaan otomatis Cloudflare Healthy atau OAuth klien.</p>
      {!canRead && (
        <p role="alert" className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">
          Status layanan belum lengkap. Start/Stop dinonaktifkan sampai ketiga pemeriksaan lokal tersedia.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={statusClass}>
          <p className="text-xs text-slate-400">Remote MCP (proses terkelola)</p>
          <p className="mt-1 font-semibold">{facts.mcpState}</p>
          <p className="mt-1 text-xs text-slate-400">Managed: {facts.mcpManaged ? "Ya" : "Tidak"} · Config: {facts.configReady ? "Siap" : "Belum siap"}</p>
          <p className="mt-2 text-sm">{facts.mcpProtected ? "HTTP lokal menolak akses anonim (401)" : "Listener terlindungi belum terkonfirmasi"}</p>
          {remote?.remoteHttp?.port && <p className="mt-1 text-xs text-slate-400">Port lokal: {remote.remoteHttp.port}</p>}
        </div>
        <div className={statusClass}>
          <p className="text-xs text-slate-400">Cloudflared (proses terkelola)</p>
          <p className="mt-1 font-semibold">{facts.tunnelState}</p>
          <p className="mt-1 text-xs text-slate-400">Managed: {facts.tunnelManaged ? "Ya" : "Tidak"}</p>
          {tunnel?.status?.failureStage && (
            <p role="alert" className="mt-2 text-sm text-amber-200">
              Tahap gagal: {tunnel.status.failureStage}
              {tunnel.status.cloudflareHttpStatus != null ? " · HTTP " + tunnel.status.cloudflareHttpStatus : ""}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">Deployment tersimpan: {phase}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} type="button" disabled={!canRead || !facts.canStartMcp}
          onClick={() => onControl("/api/local/service", "start", "Permintaan start MCP dikirim")}>Start MCP</button>
        <button className={buttonClass} type="button" disabled={!canRead || !facts.canStopMcp}
          onClick={() => onControl("/api/local/service", "stop", "Permintaan stop MCP dikirim")}>Stop MCP</button>
        <button className={buttonClass} type="button" disabled={!canRead || !facts.canStartTunnel}
          onClick={() => onControl("/api/local/tunnel", "start", "Permintaan start Tunnel dikirim")}>Start Tunnel</button>
        <button className={buttonClass} type="button" disabled={!canRead || !facts.canStopTunnel}
          onClick={() => onControl("/api/local/tunnel", "stop", "Permintaan stop Tunnel dikirim")}>Stop Tunnel</button>
        <button className={buttonClass} type="button" disabled={busy} onClick={onRefresh}>Refresh status</button>
      </div>
      <p className="text-xs leading-5 text-amber-200">
        Start MCP dahulu, kemudian Tunnel. Sebelum Start Tunnel, pastikan tidak ada replica manual untuk Tunnel yang sama; konfirmasi akan diminta.
        Stop hanya mengendalikan child process milik LocalDesk, bukan cloudflared milik Arch Local MCP V2 atau proses lain.
      </p>
      <p className="text-xs leading-5 text-slate-400">
        Status published berarti metadata deployment tersimpan, bukan bukti Tunnel Healthy. Pastikan di Cloudflare Dashboard bahwa Tunnel benar-benar Healthy dan DNS sesuai.
        Status listener 401 juga bukan bukti login OAuth berhasil.
      </p>
    </section>
  );
}

export function AIClientVerificationPanel({ deployment, remote, tunnel, onRefresh, busy }) {
  const url = publicMcpUrl(deployment);
  const localHttp = remote?.remoteHttp?.state === "listening-protected";
  const tunnelRunning = tunnel?.status?.state === "running";
  return (
    <section className="space-y-4" aria-label="Verifikasi koneksi ChatGPT dan Claude">
      <p className="text-sm text-slate-300">
        Gunakan URL MCP HTTPS yang sama untuk kedua klien. Setiap klien memakai callback OAuth sendiri. Pemasangan konektor dan login dilakukan di masing-masing aplikasi.
      </p>
      <div className={statusClass}>
        <p className="text-xs text-slate-400">Endpoint MCP publik dari deployment tersimpan</p>
        <p className="mt-1 break-all font-mono text-sm">{url || "Belum ada hostname dengan deployment published yang valid"}</p>
        {url && <button type="button" className={buttonClass + " mt-3"} onClick={() => void navigator.clipboard.writeText(url).catch(() => {})}>Salin URL MCP</button>}
      </div>
      <div className={statusClass}>
        <p className="font-medium">Pemeriksaan sebelum menghubungkan klien</p>
        <p className="mt-2 text-sm">Remote MCP lokal: {localHttp ? "Listener terlindungi terdeteksi" : "Belum terkonfirmasi"}</p>
        <p className="mt-1 text-sm">Proses Tunnel terkelola: {tunnelRunning ? "Running" : "Tidak terkonfirmasi di LocalDesk"}</p>
        <p className="mt-1 text-sm">Cloudflare Tunnel Healthy / DNS eksternal: <strong>Belum diverifikasi oleh LocalDesk</strong></p>
        <p className="mt-1 text-sm">Login OAuth &amp; pemanggilan tools ChatGPT/Claude: <strong>Belum diverifikasi di masing-masing klien</strong></p>
      </div>
      <div className="space-y-3 text-sm">
        <p><strong>ChatGPT:</strong> buka pengaturan konektor/custom MCP, tambahkan URL HTTPS di atas, lalu lakukan login Cloudflare Access sesuai instruksi. Pastikan callback OAuth ChatGPT sudah tercantum pada langkah 6.</p>
        <p><strong>Claude:</strong> buka pengaturan Connectors dan tambahkan custom connector dengan URL HTTPS yang sama, gunakan alur sign-in/registrasi dinamis yang tersedia. Pastikan callback OAuth Claude tercantum pada langkah 6.</p>
        <p>Di <strong>masing-masing klien</strong>, uji <code>list_roots</code>, lalu <code>list_files</code> dan <code>read_file</code> pada folder yang sudah disetujui. Hanya respons tools dalam klien yang membuktikan akses aktual.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className={buttonClass}>Buka ChatGPT</a>
        <a href="https://claude.ai/" target="_blank" rel="noreferrer" className={buttonClass}>Buka Claude</a>
        <button type="button" className={buttonClass} disabled={busy} onClick={onRefresh}>Perbarui status lokal</button>
      </div>
      <p className="text-xs text-slate-400">
        Tidak ada status Connected otomatis di sini. Status lokal, Tunnel Healthy, dan keberhasilan tool call adalah tiga pembuktian yang berbeda.
        Jangan bagikan token, cookie, atau tautan owner pairing saat menguji.
      </p>
    </section>
  );
}
