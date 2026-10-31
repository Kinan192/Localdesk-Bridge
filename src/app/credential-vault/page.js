"use client";

import { useEffect, useState } from "react";

const base = "/api/local/cloudflare";
const headers = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };
const accountIdPattern = /^[a-f0-9]{32}$/i;

async function localAction(url, method, payload) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // Never display an untrusted upstream error or server dump containing a token.
    if (response.status === 401) throw new Error("Sesi dashboard telah berakhir. Buka ulang dashboard melalui launcher lokal untuk masuk kembali.");
    if (response.status === 403) throw new Error("Pemeriksaan keamanan lokal menolak permintaan.");
    throw new Error("Permintaan gagal (HTTP " + response.status + "). Periksa keychain dan izin token.");
  }
  return response.json();
}

export default function CredentialVaultPage() {
  const [paired, setPaired] = useState(null);
  const [token, setToken] = useState("");
  const [zones, setZones] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [approved, setApproved] = useState(false);
  const [revokeId, setRevokeId] = useState("");
  const [revokeApproved, setRevokeApproved] = useState(false);
  const [setupAccountId, setSetupAccountId] = useState("");
  const [setupDomain, setSetupDomain] = useState("");
  const [setupSubdomain, setSetupSubdomain] = useState("mcp");
  const [setupEmail, setSetupEmail] = useState("");
  const [preflight, setPreflight] = useState(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [credentialAvailable, setCredentialAvailable] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Token yang sudah disimpan tidak ditampilkan kembali. Lanjutkan dengan cek hostname di bawah.");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/local/owner", { credentials: "same-origin", cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(info => { if (active) setPaired(info?.paired === true); })
      .catch(() => { if (active) setPaired(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (paired !== true) return;
    let active = true;
    fetch(base + "/setup-draft", { credentials: "same-origin", cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (!active || !result?.draft) return;
        setSetupAccountId(result.draft.accountId);
        setSetupDomain(result.draft.domain);
        setSetupSubdomain(result.draft.subdomain);
        setSetupEmail(result.draft.allowedEmail);
        setDraftSaved(true);
        setCredentialAvailable(result.credentialAvailable === true);
      }).catch(() => {});
    return () => { active = false; };
  }, [paired]);

  const accounts = Array.from(new Map(zones
    .filter(zone => zone.status === "active" && accountIdPattern.test(zone.accountId))
    .map(zone => [zone.accountId.toLowerCase(), zone.accountName])).entries());
  const validAccount = accounts.some(([id]) => id === accountId);
  const canSave = paired === true && !busy && approved && validAccount && token.length >= 20;

  function resetVerification(value) {
    setToken(value);
    setZones([]);
    setAccountId("");
    setApproved(false);
    setError(false);
    setMessage("Perubahan token memerlukan verifikasi ulang.");
  }

  async function verify() {
    if (busy || !token || paired !== true) return;
    setBusy(true);
    setZones([]);
    setApproved(false);
    try {
      const data = await localAction(base + "/verify", "POST", { token });
      const validZones = Array.isArray(data.zones) ? data.zones.filter(zone =>
        zone && typeof zone.accountId === "string" && accountIdPattern.test(zone.accountId) &&
        typeof zone.name === "string" && typeof zone.accountName === "string" &&
        zone.status === "active") : [];
      if (data.verified !== true || data.tokenStatus !== "active" || validZones.length === 0) {
        throw new Error("Token tidak mempunyai zona Cloudflare aktif yang dapat digunakan.");
      }
      setZones(validZones);
      setAccountId(validZones[0].accountId.toLowerCase());
      setError(false);
      setMessage("Verifikasi berhasil. Token belum disimpan. Pilih akun dan konfirmasi persetujuan.");
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Verifikasi gagal.");
    } finally { setBusy(false); }
  }

  async function store(method) {
    if (!canSave) return;
    const payload = { accountId, token, confirmed: true };
    setBusy(true);
    try {
      const result = await localAction(base + "/credentials", method, payload);
      if ((method === "POST" && result.stored !== true) ||
          (method === "PUT" && result.rotated !== true)) {
        throw new Error("Server belum mengonfirmasi penyimpanan credential.");
      }
      setError(false);
      setRevokeId(accountId); // Prefill local revoke form without persisting token.
      setSetupAccountId(accountId); // Reuse nonsecret Account ID for Cloudflare setup check.
      setCredentialAvailable(true);
      setDraftSaved(false);
      setPreflight(null);
      setRevokeApproved(false);
      setMessage(method === "POST"
        ? "Token berhasil disimpan di OS Keychain. Lanjutkan konfigurasi Cloudflare dari Setup Center."
        : "Token berhasil diperbarui di OS Keychain. Konfigurasi Cloudflare dapat dilanjutkan dari Setup Center.");
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Operasi keychain gagal.");
    } finally {
      setToken("");
      setZones([]);
      setAccountId("");
      setApproved(false);
      setBusy(false);
    }
  }

  async function checkSavedHostname() {
    if (busy || paired !== true || !accountIdPattern.test(setupAccountId) ||
        !setupDomain.trim() || !setupSubdomain.trim() || !setupEmail.trim()) return;
    setBusy(true);
    setPreflight(null);
    setDraftSaved(false);
    try {
      const result = await localAction(base + "/preflight/saved", "POST", {
        accountId: setupAccountId.trim(),
        domain: setupDomain.trim(),
        subdomain: setupSubdomain.trim(),
        allowedEmail: setupEmail.trim(),
      });
      const details = result && result.preflight;
      if (!details || !["candidate", "blocked"].includes(details.status) ||
          result.credentialSource !== "os-keychain" || result.canProvision !== false) {
        throw new Error("Hasil pemeriksaan Cloudflare tidak sesuai.");
      }
      setPreflight({ hostname: details.hostname, status: details.status, note: details.note });
      setDraftSaved(details.status === "candidate" && result.draftSaved === true);
      setCredentialAvailable(true);
      setError(false);
      setMessage(details.status === "candidate"
        ? "Tidak ditemukan DNS hostname yang sama. Belum boleh mempublikasikan MCP sebelum Access dan OAuth dikonfigurasi."
        : "Hostname sudah dipakai atau belum dapat diverifikasi aman. Pilih subdomain lain.");
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Pemeriksaan hostname gagal.");
    } finally { setBusy(false); }
  }

  async function revoke() {
    if (!revokeApproved || !accountIdPattern.test(revokeId) || busy || paired !== true) return;
    setBusy(true);
    try {
      const result = await localAction(base + "/credentials", "DELETE",
        { accountId: revokeId.toLowerCase(), confirmed: true });
      if (result.revoked !== true) throw new Error("Penghapusan credential belum dikonfirmasi.");
      setError(false);
      setMessage("Token lokal dihapus dari OS Keychain. Token Cloudflare masih harus dicabut di dashboard Cloudflare jika tidak diperlukan.");
      setRevokeId("");
      setSetupAccountId(current => current.toLowerCase() === revokeId.toLowerCase() ? "" : current);
      setPreflight(null);
      setDraftSaved(false);
      setCredentialAvailable(false);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Penghapusan keychain gagal.");
    } finally {
      setBusy(false);
      setRevokeApproved(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-7 px-5 py-12 text-slate-100">
      <header className="space-y-3">
        <a href="/setup-center" className="text-sm text-sky-300 underline underline-offset-4">Kembali ke Setup Center</a>
        <h1 className="text-3xl font-semibold">Cloudflare Credential Vault</h1>
        <p className="text-sm text-slate-400">Setelah cek hostname berhasil, tombol <strong>Lanjut ke Cloudflare Setup</strong> muncul di bawah formulir. Data nonrahasia akan tersimpan otomatis.</p>
        <p className="text-sm leading-6 text-slate-300">
          Developer alpha P1D-B. Token ditransfer melalui API lokal yang memerlukan sesi owner
          dan disimpan di OS Keychain. Halaman ini tidak mengubah Cloudflare Tunnel, Access, atau DNS.
        </p>
      </header>
      {paired === null ? (
        <p role="status" className="rounded-xl border border-slate-600 p-4">Memeriksa sesi owner...</p>
      ) : paired === false ? (
        <section className="rounded-xl border border-amber-700 bg-slate-900 p-5">
          <h2 className="font-semibold">Formulir Vault terkunci</h2>
          <p className="mt-2 text-sm text-slate-300">
            Formulir ini hanya tersedia pada sesi browser pemilik yang telah terautentikasi.
            Ikuti panduan pairing pada banner keamanan di bawah halaman.
          </p>
        </section>
      ) : (
        <>
          <section className="space-y-5 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Verifikasi dan simpan token</h2>
            <p className="text-sm text-slate-300">
              Gunakan API token Cloudflare dengan izin minimum. Token tidak ditaruh di URL, localStorage, atau log.
            </p>
            <p className="text-xs text-slate-400">Jika token sudah tersimpan, kolom ini memang kosong. Tidak perlu verifikasi atau simpan token lagi untuk melanjutkan.</p>
            <div className="space-y-2">
              <label htmlFor="vault-token" className="block text-sm font-medium">Cloudflare API token</label>
              <input id="vault-token" type="password" value={token} autoComplete="off" spellCheck={false}
                onChange={event => resetVerification(event.target.value)} disabled={busy}
                placeholder="Masukkan API token" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </div>
            <button type="button" disabled={busy || token.length < 20} onClick={() => void verify()}
              className="rounded-lg border border-sky-500 px-4 py-2 text-sky-200 disabled:opacity-40">
              {busy ? "Memproses..." : "Verifikasi token tanpa menyimpan"}
            </button>
            {accounts.length > 0 && (
              <div className="space-y-4 rounded-lg border border-slate-600 p-4">
                <div className="space-y-2">
                  <label htmlFor="vault-account" className="block text-sm">Akun Cloudflare terverifikasi</label>
                  <select id="vault-account" value={accountId}
                    onChange={event => { setAccountId(event.target.value); setApproved(false); }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3">
                    {accounts.map(([id, name]) => <option key={id} value={id}>{name} — {id}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input type="checkbox" className="mt-1" checked={approved}
                    onChange={event => setApproved(event.target.checked)} />
                  Saya menyetujui penyimpanan token pada OS Keychain untuk akun yang dipilih.
                </label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={!canSave} onClick={() => void store("POST")}
                    className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
                    Simpan token
                  </button>
                  <button type="button" disabled={!canSave} onClick={() => void store("PUT")}
                    className="rounded-lg border border-slate-500 px-4 py-2 disabled:opacity-40">
                    Ganti token tersimpan
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Periksa hostname dengan token tersimpan</h2>
            <p className="text-sm text-slate-300">
              Gunakan token di OS Keychain untuk mengecek zone dan bentrok DNS tanpa memasukkan token lagi.
              Pemeriksaan ini hanya membaca Cloudflare dan tidak membuat Tunnel, Access, atau DNS.
            </p>
            <div className="space-y-2">
              <label htmlFor="setup-account" className="block text-sm">Cloudflare Account ID</label>
              <input id="setup-account" value={setupAccountId} disabled={busy} autoComplete="off" spellCheck={false}
                placeholder="32 karakter heksadesimal"
                onChange={event => { setSetupAccountId(event.target.value); setPreflight(null); setDraftSaved(false); }}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </div>
            <div className="space-y-2">
              <label htmlFor="setup-domain" className="block text-sm">Domain di Cloudflare</label>
              <input id="setup-domain" value={setupDomain} disabled={busy} autoComplete="off"
                placeholder="example.com"
                onChange={event => { setSetupDomain(event.target.value); setPreflight(null); setDraftSaved(false); }}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </div>
            <div className="space-y-2">
              <label htmlFor="setup-subdomain" className="block text-sm">Subdomain MCP</label>
              <input id="setup-subdomain" value={setupSubdomain} disabled={busy}
                onChange={event => { setSetupSubdomain(event.target.value); setPreflight(null); setDraftSaved(false); }}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </div>
            <div className="space-y-2">
              <label htmlFor="setup-email" className="block text-sm">Email yang nantinya diizinkan oleh Access</label>
              <input id="setup-email" type="email" value={setupEmail} disabled={busy} autoComplete="off"
                placeholder="owner@example.com"
                onChange={event => { setSetupEmail(event.target.value); setPreflight(null); setDraftSaved(false); }}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            </div>
            <button type="button" onClick={() => void checkSavedHostname()}
              disabled={busy || !accountIdPattern.test(setupAccountId) ||
                !setupDomain.trim() || !setupSubdomain.trim() || !setupEmail.trim()}
              className="rounded-lg border border-sky-500 px-4 py-2 text-sky-200 disabled:opacity-40">
              {busy ? "Memeriksa..." : "Cek hostname & simpan konfigurasi (read-only)"}
            </button>
            {preflight && (
              <p role="status" className="rounded-lg border border-slate-600 p-3 text-sm text-slate-200">
                {preflight.hostname}: {preflight.status === "candidate" ? "Kandidat — belum siap publikasi" : "Terblokir"}
              </p>
            )}
            {draftSaved && credentialAvailable === true && (
              <div className="space-y-3 rounded-lg border border-emerald-700 p-4 text-sm">
                <p>Konfigurasi disimpan secara lokal tanpa token. Kamu bisa berpindah halaman tanpa mengisi ulang.</p>
                <a href="/cloudflare-setup"
                  className="inline-flex rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950">
                  Lanjut ke Cloudflare Setup
                </a>
              </div>
            )}
            {draftSaved && credentialAvailable === false && (
              <p className="text-sm text-amber-200">Konfigurasi tersimpan, tetapi credential tidak tersedia di OS Keychain. Verifikasi dan simpan token kembali sebelum setup.</p>
            )}
          </section>
          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Hapus token lokal</h2>
            <p className="text-sm text-slate-300">
              Masukkan Account ID yang tersimpan (32 karakter heksadesimal).
              Ini hanya menghapus token di perangkat lokal, bukan mencabut token Cloudflare.
            </p>
            <label htmlFor="vault-revoke" className="block text-sm">Cloudflare Account ID</label>
            <input id="vault-revoke" value={revokeId} spellCheck={false} autoComplete="off"
              disabled={busy} onChange={event => { setRevokeId(event.target.value); setRevokeApproved(false); }}
              placeholder="32 karakter heksadesimal"
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3" />
            <label className="flex items-start gap-3 text-sm leading-6">
              <input type="checkbox" checked={revokeApproved}
                onChange={event => setRevokeApproved(event.target.checked)} />
              Saya menyetujui penghapusan entri keychain lokal untuk akun ini.
            </label>
            <button type="button" disabled={busy || !revokeApproved || !accountIdPattern.test(revokeId)}
              onClick={() => void revoke()}
              className="rounded-lg border border-rose-500 px-4 py-2 text-rose-200 disabled:opacity-40">
              Hapus token dari keychain
            </button>
          </section>
        </>
      )}
      <p role="status" aria-live="polite" className={"rounded-lg border px-4 py-3 text-sm " +
        (error ? "border-rose-700 text-rose-200" : "border-slate-600 text-slate-300")}>
        {message}
      </p>
    </main>
  );
}
