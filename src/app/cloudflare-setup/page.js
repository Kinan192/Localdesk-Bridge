"use client";

import { useEffect, useState } from "react";

const path = "/api/local/cloudflare/deployment";
const headers = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };

async function request(method, data, inspect = false) {
  const response = await fetch(path + (inspect ? "?inspect=1" : ""), {
    method, credentials: "same-origin", cache: "no-store",
    ...(data ? { headers, body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi pemilik diperlukan. Buka ulang dashboard melalui launcher lokal.");
    const info = await response.json().catch(() => ({}));
    if (info && typeof info.error === "string" && info.error.length < 400) {
      throw new Error(info.error);
    }
    throw new Error("Operasi Cloudflare tidak selesai. Periksa status resource secara read-only sebelum mencoba lagi.");
  }
  return response.json();
}

export default function CloudflareSetupPage() {
  const [paired, setPaired] = useState(null);
  const [record, setRecord] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [credentialAvailable, setCredentialAvailable] = useState(null);
  const [accountId, setAccountId] = useState("");
  const [domain, setDomain] = useState("");
  const [subdomain, setSubdomain] = useState("mcp");
  const [allowedEmail, setAllowedEmail] = useState("");
  const [redirects, setRedirects] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [approved, setApproved] = useState(false);
  const [publishApproved, setPublishApproved] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [readinessIssue, setReadinessIssue] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const [recoveryApproved, setRecoveryApproved] = useState(false);
  const [dnsReadiness, setDnsReadiness] = useState(null);
  const [dnsApproved, setDnsApproved] = useState(false);
  const [dnsIssue, setDnsIssue] = useState("");
  const [dnsFailure, setDnsFailure] = useState(null);
  const [dnsLockInfo, setDnsLockInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Belum ada perubahan pada Cloudflare.");
  const hostname = (subdomain.trim() + "." + domain.trim()).toLowerCase();
  const idValid = /^[a-f0-9]{32}$/i.test(accountId);
  const ready = paired === true && !busy && idValid && hostname === confirmation &&
    /^[a-z0-9-]+\.[a-z0-9.-]+$/.test(hostname) && allowedEmail.includes("@");
  const callbacks = redirects.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  const publishSafetyChecked = diagnostics?.access === "verified" &&
    diagnostics?.tunnel === "absent" && diagnostics?.dns === "available" &&
    diagnostics?.lock === "clear";
  const recoverableState = record?.phase === "access-ready" &&
    diagnostics?.access === "verified" && diagnostics?.tunnel === "absent" &&
    diagnostics?.tunnelId === null && diagnostics?.dns === "available" &&
    diagnostics?.lock === "held" && diagnostics?.hostname === hostname;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/local/owner", { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null),
      request("GET").catch(() => null),
      fetch("/api/local/cloudflare/setup-draft", { credentials: "same-origin", cache: "no-store" })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([owner, state, saved]) => {
      if (!mounted) return;
      setPaired(owner?.paired === true);
      setRecord(state);
      if (owner?.paired === true && state?.phase === "not-started" && saved?.draft) {
        setAccountId(saved.draft.accountId);
        setDomain(saved.draft.domain);
        setSubdomain(saved.draft.subdomain);
        setAllowedEmail(saved.draft.allowedEmail);
        setConfirmation(saved.draft.subdomain + "." + saved.draft.domain);
        setDraftRestored(true);
        setCredentialAvailable(saved.credentialAvailable === true);
        setMessage("Konfigurasi nonrahasia dari Credential Vault dipulihkan. Cloudflare belum diubah.");
      }
      if (state?.hostname && state?.accountId) {
        setAccountId(state.accountId);
        const dot = state.hostname.indexOf(".");
        if (dot > 0) {
          setSubdomain(state.hostname.slice(0, dot));
          setDomain(state.hostname.slice(dot + 1));
        }
        setConfirmation(state.hostname);
        if (state.allowedEmail) setAllowedEmail(state.allowedEmail);
        if (Array.isArray(state.redirectUris)) setRedirects(state.redirectUris.join("\n"));
      }
    }).catch(() => { if (mounted) setPaired(false); });
    return () => { mounted = false; };
  }, []);

  async function checkReadiness() {
    if (!ready || callbacks.length === 0 || record?.phase !== "not-started") return;
    setBusy(true);
    setReadiness(null);
    setReadinessIssue("");
    setApproved(false);
    setPublishApproved(false);
    setMessage("Memeriksa token, domain, DNS, Access, dan callback tanpa membuat resource...");
    try {
      const result = await request("POST", {
        action: "check", accountId, domain, subdomain, allowedEmail,
        confirmHostname: hostname, redirectUris: callbacks,
      });
      if (result.ready !== true || result.cloudflareMutated !== false ||
          result.hostname !== hostname || result.accountId !== accountId.toLowerCase()) {
        throw new Error("Verifikasi kesiapan tidak sesuai. Tidak ada perubahan Cloudflare.");
      }
      setReadiness(result);
      setReadinessIssue("");
      setMessage("Pemeriksaan berhasil. Baca persetujuan Tahap 1 lalu klik Siapkan Access + Managed OAuth jika setuju.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Pemeriksaan kesiapan gagal.";
      setReadinessIssue(detail);
      setMessage(detail);
    } finally { setBusy(false); }
  }

  async function inspectDeployment() {
    if (busy || paired !== true) return;
    setBusy(true);
    setDiagnostics(null);
    setRecoveryApproved(false);
    setPublishApproved(false);
    setMessage("Membaca status Access, Tunnel, DNS, dan deployment lock tanpa melakukan perubahan...");
    try {
      const result = await request("GET", undefined, true);
      setDiagnostics(result);
      setMessage(result.lock === "held"
        ? "Pemeriksaan selesai. Deployment lock aktif: jangan ulangi Publish atau hapus state lokal. Lihat detail hasil pemeriksaan."
        : "Status Cloudflare diperiksa secara read-only. Periksa hasilnya sebelum melanjutkan.");
    } catch {
      setMessage("Tidak dapat memeriksa status resource. Jangan ulangi pembuatan Tunnel/DNS.");
    } finally { setBusy(false); }
  }

  async function recoverDeployment() {
    if (busy || paired !== true || !ready || !recoveryApproved || !recoverableState) return;
    setBusy(true);
    setRecoveryApproved(false);
    setDiagnostics(null);
    setPublishApproved(false);
    setMessage("Memverifikasi ulang Access, Tunnel, DNS, dan lock sebelum pemulihan lokal...");
    try {
      const result = await request("POST", {
        action: "recover", confirmed: true, confirmHostname: hostname,
      });
      if (result.recovered !== true || result.cloudflareMutated !== false ||
          result.hostname !== hostname) throw new Error("Pemulihan belum dikonfirmasi.");
      setRecord(await request("GET"));
      setMessage("Lock lokal berhasil dipulihkan tanpa mengubah Cloudflare. Klik Periksa status Cloudflare lagi, lalu pastikan token memiliki Tunnel Write dan DNS Edit sebelum Publish.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Pemulihan ditolak karena kondisi belum dapat dipastikan aman. Lock tetap terjaga.");
    } finally { setBusy(false); }
  }

  async function checkDns() {
    if (paired !== true || busy || record?.phase !== "tunnel-ready") return;
    setDnsFailure(null);
    setBusy(true);
    setDnsReadiness(null);
    setDnsApproved(false);
    setDnsIssue("");
    setDnsLockInfo(null);
    setMessage("Memeriksa Access, route Tunnel, dan konflik DNS tanpa mengubah Cloudflare...");
    try {
      const response = await fetch("/api/local/cloudflare/dns-finalize", {
        credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (result.lockDiagnostics) setDnsLockInfo(result.lockDiagnostics);
      if (!response.ok || result.ready !== true || result.cloudflareMutated !== false ||
          result.hostname !== record.hostname || result.tunnelId !== record.tunnelId) {
        throw new Error(result.error || "Konfigurasi Tunnel/DNS belum dapat dipastikan aman.");
      }
      setDnsReadiness(result);
      setMessage("Pemeriksaan DNS berhasil. CNAME untuk Tunnel yang sudah ada dapat dibuat setelah persetujuan.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Pemeriksaan DNS gagal.";
      setDnsIssue(detail);
      setMessage(detail);
    } finally { setBusy(false); }
  }

  async function finalizeDns() {
    if (busy || paired !== true || record?.phase !== "tunnel-ready" ||
        !dnsApproved || !dnsReadiness?.ready ||
        dnsReadiness.hostname !== record.hostname || confirmation !== record.hostname) return;
    setBusy(true);
    setDnsApproved(false);
    setDnsReadiness(null);
    setDnsIssue("");
    setDnsFailure(null);
    setDnsLockInfo(null);
    setMessage("Memeriksa ulang lalu menyelesaikan CNAME DNS untuk Tunnel yang sudah dibuat...");
    try {
      const response = await fetch("/api/local/cloudflare/dns-finalize", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers,
        body: JSON.stringify({ confirmed: true, confirmHostname: record.hostname }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.phase !== "published" || result.dnsCompleted !== true ||
          result.hostname !== record.hostname || result.tunnelId !== record.tunnelId) {
        if (result.requiresInspection === true) {
          if (result.lockDiagnostics) setDnsLockInfo(result.lockDiagnostics);
          setDnsFailure({
            failedStage: result.failedStage || "unknown",
            httpStatus: result.cloudflareHttpStatus ?? null,
            localPhase: result.deployment?.phase || "unknown",
            lock: result.deployment?.lock || "unknown",
            errorCode: result.errorCode ?? null,
            errorKind: result.errorKind ?? null,
          });
        }
        throw new Error(result.error || "Publikasi DNS belum terkonfirmasi. Jangan ulangi sebelum inspeksi.");
      }
      setRecord(result);
      setMessage("CNAME DNS berhasil dibuat dan diverifikasi untuk Tunnel yang sudah ada. Access dan Tunnel tidak dibuat ulang.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Publikasi DNS belum aman.";
      setDnsIssue(detail);
      setMessage(detail);
      try { setRecord(await request("GET")); } catch { /* Preserve safe UI. */ }
    } finally { setBusy(false); }
  }

  async function apply(action) {
    const isPrepare = action === "prepare";
    if (!ready || (isPrepare ? !approved || !readiness || callbacks.length === 0 || record?.phase !== "not-started"
      : !publishApproved || !publishSafetyChecked || record?.phase !== "access-ready")) return;
    setBusy(true);
    setMessage("Memverifikasi dan mengirim permintaan Cloudflare...");
    try {
      const data = {
        action, accountId, domain, subdomain, allowedEmail, confirmHostname: hostname, confirmed: true,
        ...(isPrepare ? { redirectUris: callbacks } : {}),
      };
      const result = await request("POST", data);
      setRecord(result);
      setReadiness(null);
      setDiagnostics(null);
      setApproved(false);
      setPublishApproved(false);
      setMessage(isPrepare
        ? "Access dan Managed OAuth berhasil dibuat dan diverifikasi. DNS belum dipublikasikan."
        : "Tunnel dan DNS berhasil dibuat setelah verifikasi Access. Koneksi cloudflared dan AI Web belum aktif.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloudflare setup gagal aman.");
      setDiagnostics(null);
      try { setRecord(await request("GET")); } catch { /* Keep safe UI state. */ }
      setApproved(false);
      setPublishApproved(false);
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-slate-100">
      <a href="/setup-center" className="text-sm text-sky-300 underline">Kembali ke Setup Center</a>
      <h1 className="text-3xl font-semibold">Cloudflare Setup</h1>
      <p className="text-sm leading-6 text-slate-300">
        Setup dua tahap: 1) Access + pembatasan email + Managed OAuth; 2) Tunnel + DNS
        hanya setelah Access terverifikasi. Token dibaca dari OS Keychain di server.
        Dashboard lokal port 3100 tidak dipublikasikan.
      </p>
      {paired === null ? (
        <p role="status">Memeriksa sesi owner...</p>
      ) : !paired ? (
        <p className="rounded-xl border border-amber-600 p-4">Formulir terkunci. Lakukan owner pairing dari dashboard lokal.</p>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Konfigurasi yang disetujui</h2>
            {draftRestored && (
              <p className="rounded-lg border border-emerald-700 p-3 text-sm text-emerald-100">
                Account ID, domain, subdomain, dan email otomatis dimuat dari Credential Vault.
                {credentialAvailable === true
                  ? " Token tersedia di OS Keychain."
                  : " Token saat ini tidak bisa dibaca dari OS Keychain; periksa Credential Vault."}
              </p>
            )}
            {[
              ["Cloudflare Account ID", accountId, setAccountId, "32 karakter hex"],
              ["Domain aktif", domain, setDomain, "example.com"],
              ["Subdomain MCP", subdomain, setSubdomain, "mcp"],
              ["Email yang boleh login Access", allowedEmail, setAllowedEmail, "owner@example.com"],
            ].map(([label, value, setter, placeholder]) => (
              <label key={label} className="block space-y-1 text-sm">
                <span>{label}</span>
                <input value={value} placeholder={placeholder} disabled={busy || (record?.phase !== "not-started")}
                  onChange={event => { setter(event.target.value); setReadiness(null); setApproved(false); setPublishApproved(false); }}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
              </label>
            ))}
            <label className="block space-y-1 text-sm">
              <span>Redirect URL OAuth yang diizinkan (satu per baris, HTTPS)</span>
              <textarea value={redirects} rows={3} disabled={busy || record?.phase !== "not-started"}
                onChange={event => { setRedirects(event.target.value); setReadiness(null); setApproved(false); }}
                placeholder="https://client.example.org/oauth/callback"
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            <p className="text-xs text-slate-400">
              Gunakan callback URL persis dari klien yang akan diuji. Akses OAuth tidak mengizinkan
              sembarang redirect, termasuk localhost, secara default.
            </p>
            <label className="block space-y-1 text-sm">
              <span>Ketik ulang hostname yang akan dibuat untuk konfirmasi</span>
              <input value={confirmation} disabled={busy} placeholder={hostname || "mcp.example.com"}
                onChange={event => { setConfirmation(event.target.value.toLowerCase()); setReadiness(null); setApproved(false); setPublishApproved(false); }}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            {record?.phase === "not-started" && (
              <div className="space-y-3 rounded-lg border border-slate-600 p-4">
                <h3 className="font-semibold">Cek kesiapan Cloudflare</h3>
                <p className="text-sm text-slate-300">
                  Memeriksa credential tersimpan, domain, konflik DNS, Access, dan callback OAuth.
                  Pemeriksaan ini hanya membaca Cloudflare, tanpa membuat resource.
                </p>
                <button type="button" disabled={!ready || callbacks.length === 0} onClick={() => void checkReadiness()}
                  className="rounded-lg border border-sky-500 px-4 py-2 text-sky-200 disabled:opacity-40">
                  {busy ? "Memeriksa..." : "Cek kesiapan (read-only)"}
                </button>
                {readiness && (
                  <p role="status" className="text-sm text-emerald-300">
                    Domain dan hostname lolos pemeriksaan. Token dan Access bisa dibaca.
                    Pembuatan Access tetap membutuhkan izin Edit pada token.
                  </p>
                )}
                {readinessIssue && (
                  <div role="alert" className="space-y-3 rounded-lg border border-amber-600 p-4 text-sm text-amber-100">
                    <p>{readinessIssue}</p>
                    {readinessIssue.includes("Access apps") && (
                      <>
                        <p>
                          Token sebelumnya bisa membaca Zone/DNS, tetapi belum tentu memiliki izin Access.
                          Untuk pengujian membaca aplikasi diperlukan Account → Access: Apps and Policies → Read.
                          Untuk membuat Access pada Tahap 1 diperlukan izin Edit (Write).
                          Batasi token hanya pada akun dan zone milikmu.
                        </p>
                        <p>
                          Buat User API Token dengan izin sesuai di Cloudflare, kemudian verifikasi token baru
                          melalui Credential Vault dan pilih Ganti token tersimpan.
                          Setelah kembali ke halaman ini klik Cek kesiapan lagi.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex rounded-lg border border-slate-500 px-4 py-2 font-medium text-slate-100">
                            Buka Cloudflare User API Tokens
                          </a>
                          <a href="/credential-vault"
                            className="inline-flex rounded-lg border border-amber-400 px-4 py-2 font-medium text-amber-100">
                            Buka Credential Vault untuk ganti token
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Tahap 1 — Lindungi dengan Access & OAuth</h2>
            <p className="text-sm text-slate-300">
              Ini akan membuat resource sungguhan di akun Cloudflare. API token tersimpan harus
              memiliki izin Zone/DNS Read dan Access: Apps and Policies Write. Jika cek kesiapan
              gagal karena izin Access, buat token dengan izin yang tepat di Cloudflare lalu
              gunakan Ganti token tersimpan pada Credential Vault.
              Pengaturan Access hanya mengizinkan email di atas dan redirect OAuth yang disebutkan.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={approved} disabled={busy || !readiness || record?.phase !== "not-started"}
                onChange={event => setApproved(event.target.checked)} />
              Saya menyetujui pembuatan Access application dan Managed OAuth sungguhan untuk hostname yang dikonfirmasi.
              Saya memahami bahwa tindakan ini mengubah akun Cloudflare saya.
            </label>
            <button type="button" disabled={!ready || !readiness || !approved || callbacks.length === 0 ||
                record?.phase !== "not-started"} onClick={() => void apply("prepare")}
              className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
              {busy ? "Memproses..." : "Siapkan Access + Managed OAuth"}
            </button>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Tahap 2 — Publish Tunnel & DNS</h2>
            {record?.phase === "tunnel-ready" && (
              <div className="space-y-3 rounded-lg border border-sky-600 p-4">
                <h3 className="font-semibold">Selesaikan publikasi DNS (tanpa membuat Tunnel baru)</h3>
                <p className="text-sm text-slate-300">
                  Tunnel sudah dibuat. Aplikasi akan memeriksa ulang Access, email yang diizinkan,
                  konfigurasi ingress Tunnel dan apakah hostname DNS masih tersedia.
                  Jangan menekan tombol Publish Tunnel &amp; DNS lagi.
                </p>
                <button type="button" disabled={busy} onClick={() => void checkDns()}
                  className="rounded-lg border border-sky-500 px-4 py-2 text-sky-200 disabled:opacity-40">
                  Cek kelengkapan DNS (read-only)
                </button>
                {dnsReadiness && (
                  <div className="space-y-2 text-sm text-slate-200">
                    <p>Hostname: <strong>{dnsReadiness.hostname}</strong></p>
                    <p>Target: <strong>{dnsReadiness.target}</strong></p>
                    <p>Lock deployment: <strong>{dnsReadiness.lock}</strong></p>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" disabled={busy} checked={dnsApproved}
                        onChange={event => setDnsApproved(event.target.checked)} />
                      Saya menyetujui pembuatan satu DNS CNAME Proxied untuk hostname ini, memakai Tunnel yang sudah ada.
                    </label>
                    <button type="button" disabled={busy || !dnsApproved || !ready}
                      onClick={() => void finalizeDns()}
                      className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
                      Selesaikan Publikasi DNS
                    </button>
                  </div>
                )}
                {dnsLockInfo && (
                  <div role="status" className="space-y-1 rounded-lg border border-slate-600 p-3 text-sm text-slate-200">
                    <p>Lock deployment: <strong>{dnsLockInfo.deployment?.state || "unknown"}</strong>
                      {dnsLockInfo.deployment?.ageSeconds != null && <> ({dnsLockInfo.deployment.ageSeconds} detik)</>}
                    </p>
                    <p>Guard penyelesaian DNS: <strong>{dnsLockInfo.completion?.state || "unknown"}</strong>
                      {dnsLockInfo.completion?.ageSeconds != null && <> ({dnsLockInfo.completion.ageSeconds} detik)</>}
                    </p>
                    <p>Guard pemulihan lain: <strong>{dnsLockInfo.recovery?.state || "unknown"}</strong></p>
                    <p>Pemulihan lokal siap: <strong>{dnsLockInfo.canAttemptDnsRecovery === true ? "Ya" : "Belum"}</strong></p>
                    <p className="text-xs text-amber-200">Pemeriksaan hanya membaca metadata lock, tidak menghapus file atau membuat DNS.</p>
                  </div>
                )}
                {dnsIssue && <p role="alert" className="text-sm text-amber-200">{dnsIssue}</p>}
                {dnsFailure && (
                  <div role="alert" className="space-y-1 rounded-lg border border-amber-600 p-3 text-sm text-amber-100">
                    <p>Tahap kegagalan: <strong>{dnsFailure.failedStage}</strong>
                      {dnsFailure.httpStatus !== null && <> — Cloudflare HTTP {dnsFailure.httpStatus}</>}
                    </p>
                    <p>Status lokal setelah gagal: <strong>{dnsFailure.localPhase}</strong>, lock: <strong>{dnsFailure.lock}</strong></p>
                    {dnsFailure.errorKind && <p>Kategori error: <strong>{dnsFailure.errorKind}</strong>
                      {dnsFailure.errorCode && <> ({dnsFailure.errorCode})</>}
                    </p>}
                    <p>Jangan ulangi publikasi. Periksa status resource dan record DNS pada Cloudflare terlebih dahulu.</p>
                  </div>
                )}
              </div>
            )}
            {record?.phase !== "not-started" && (
              <div className="space-y-3 rounded-lg border border-slate-600 p-4">
                <h3 className="font-semibold">Periksa resource yang sudah dibuat</h3>
                <p className="text-sm text-slate-300">
                  Jika tahap sebelumnya menampilkan pesan gagal, periksa Access, Tunnel,
                  DNS, dan deployment lock lebih dahulu. Pemeriksaan tidak menulis ke Cloudflare.
                </p>
                <button type="button" disabled={busy} onClick={() => void inspectDeployment()}
                  className="rounded-lg border border-sky-500 px-4 py-2 text-sky-200 disabled:opacity-40">
                  {busy ? "Memeriksa..." : "Periksa status Cloudflare (read-only)"}
                </button>
                {diagnostics && (
                  <div role="status" className="space-y-1 text-sm text-slate-200">
                    <p>Access/OAuth: <strong>{diagnostics.access}</strong></p>
                    <p>Cloudflare Tunnel: <strong>{diagnostics.tunnel}</strong></p>
                    {diagnostics.tunnelId && <p>Tunnel ID ditemukan: {diagnostics.tunnelId}</p>}
                    <p>Hostname DNS: <strong>{diagnostics.dns}</strong></p>
                    <p>Deployment lock: <strong>{diagnostics.lock}</strong></p>
                    {(diagnostics.notes || []).map((note, index) => (
                      <p key={index} className="text-amber-200">{note}</p>
                    ))}
                    {diagnostics.lock === "held" && (
                      <p className="font-medium text-amber-200">
                        Publikasi tetap dikunci demi mencegah resource duplikat.
                        Jangan menghapus file lock secara manual.
                      </p>
                    )}
                    {recoverableState && (
                      <div className="mt-3 space-y-3 rounded-lg border border-amber-600 p-3">
                        <p className="font-medium text-amber-100">Pemulihan aman setelah operasi gagal</p>
                        <p className="text-slate-300">
                          Hanya memulihkan lock LOKAL setelah backend memeriksa ulang Access,
                          Tunnel dan DNS. Tidak menghapus Access atau membuat Tunnel/DNS.
                          Recovery ditolak jika operasi lama belum lewat 3 menit atau
                          ada kemungkinan resource yang tidak tercatat.
                        </p>
                        <label className="flex items-start gap-2">
                          <input type="checkbox" checked={recoveryApproved} disabled={busy}
                            onChange={event => setRecoveryApproved(event.target.checked)} />
                          Saya menyetujui pemeriksaan ulang dan pemulihan lock lokal untuk {hostname}.
                        </label>
                        <button type="button" disabled={!recoveryApproved || busy || !ready}
                          onClick={() => void recoverDeployment()}
                          className="rounded-lg border border-amber-400 px-4 py-2 font-semibold text-amber-100 disabled:opacity-40">
                          Periksa ulang & pulihkan lock lokal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-slate-300">
              Hanya tersedia jika tahap pertama terverifikasi. Akan membuat tunnel baru,
              mengarahkan ingress ke 127.0.0.1:8401 (endpoint /mcp, bukan dashboard),
              dan membuat CNAME setelah Access diverifikasi kembali. Token juga harus memiliki izin Cloudflare Tunnel Write dan DNS Write.
              Tahap ini tidak menjalankan cloudflared atau menghubungkan ChatGPT/Claude.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={publishApproved} disabled={busy || !publishSafetyChecked || record?.phase !== "access-ready"}
                onChange={event => setPublishApproved(event.target.checked)} />
              Saya menyetujui pembuatan tunnel dan publikasi DNS untuk hostname yang dikonfirmasi.
            </label>
            <button type="button" disabled={!ready || !publishApproved || !publishSafetyChecked || record?.phase !== "access-ready"}
              onClick={() => void apply("publish")}
              className="rounded-lg border border-amber-500 px-4 py-2 text-amber-100 disabled:opacity-40">
              {busy ? "Memproses..." : "Publikasikan Tunnel & DNS"}
            </button>
          </section>
        </>
      )}
      <section role="status" aria-live="polite" className="rounded-xl border border-slate-600 p-4 text-sm">
        <p>Status resource: <strong>{record?.phase || "belum diketahui"}</strong></p>
        <p>Alur izin: <strong>Persetujuan pengguna melalui dashboard</strong></p>
        {record?.accessAppId && <p>Access application: {record.accessAppId}</p>}
        {record?.accessAudience && <p>Access audience: {record.accessAudience}</p>}
        {record?.tunnelId && <p>Tunnel: {record.tunnelId}</p>}
        {record?.accessAudience && (
          <div className="mt-3 flex flex-wrap gap-3">
            <a href="/oauth-settings"
              className="inline-flex rounded-lg border border-indigo-500 px-4 py-2 font-medium text-indigo-200">
              Manage OAuth Redirect URLs (Tambah / Edit)
            </a>
            <a href="/cloudflare-config"
              className="inline-flex rounded-lg border border-sky-500 px-4 py-2 font-medium text-sky-200">
              Impor Access &amp; Hostname ke Remote MCP Service
            </a>
            {record?.tunnelId && (
              <a href="/tunnel-control"
                className="inline-flex rounded-lg border border-emerald-600 px-4 py-2 font-medium text-emerald-200">
                Start / Stop Cloudflare Tunnel
              </a>
            )}
          </div>
        )}
        <p className="mt-2">{message}</p>
        {dnsFailure && record?.phase !== "tunnel-ready" && (
          <p role="alert" className="mt-2 text-amber-200">
            DNS completion perlu ditinjau: tahap {dnsFailure.failedStage};
            status lokal {dnsFailure.localPhase}, lock {dnsFailure.lock}.
            Jangan mengulangi POST sebelum memeriksa DNS.
          </p>
        )}
      </section>
      <p className="text-xs text-slate-400">
        Jika deployment gagal setelah ada resource yang dibuat, periksa Cloudflare Dashboard sebelum
        mengulang. Sistem sengaja mengunci retry otomatis agar tidak membuat resource ganda.
      </p>
    </main>
  );
}
