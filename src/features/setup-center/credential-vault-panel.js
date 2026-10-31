"use client";

import { useRef, useState } from "react";
import {
  ACCOUNT_ID_RE, CLOUD_TOKEN_RE, activeVerifiedAccounts,
  credentialPayload, revokeCredentialPayload, confirmedVaultOutcome,
} from "./credential-flow";

const cloudflareBase = "/api/local/cloudflare";
const headers = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };
const fieldClass = "w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50";
const actionClass = "rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40";

/** Requests remain owner-only and same-origin. Never display untrusted provider bodies/errors. */
async function localCredentialAction(path, method, payload) {
  const response = await fetch(cloudflareBase + path, {
    method, credentials: "same-origin", cache: "no-store", headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi owner sudah berakhir. Jalankan localdesk untuk pairing ulang.");
    if (response.status === 403) throw new Error("Permintaan ditolak pemeriksaan keamanan owner dan origin.");
    throw new Error("Operasi Cloudflare/Keychain gagal (HTTP " + response.status + "). Periksa izin token dan OS Keychain.");
  }
  return response.json();
}

export function CredentialVaultPanel({ credentialInfo, parentBusy, onRefresh }) {
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [approved, setApproved] = useState(false);
  const [revokeId, setRevokeId] = useState("");
  const [revokeApproved, setRevokeApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");

  // React discards component-local token state when leaving this wizard step.
  // Never cache the token in persistent wizard state or browser storage.

  const draft = credentialInfo?.draft;
  const status = !credentialInfo || typeof credentialInfo !== "object"
    ? "unknown" : !draft ? "no-draft"
      : credentialInfo.credentialAvailable === true ? "available" : "unavailable";
  // A missing owner-protected status response is not permission to mutate.
  const disabled = busy || parentBusy || status === "unknown";
  const canVerify = !disabled && CLOUD_TOKEN_RE.test(token);
  const canStore = !disabled && approved && CLOUD_TOKEN_RE.test(token) &&
    accounts.some(account => account.id === accountId);

  function resetVerification(nextToken) {
    setToken(nextToken);
    setAccounts([]);
    setAccountId("");
    setApproved(false);
    setOutcome("");
    setError("");
  }

  async function runVerify() {
    if (!canVerify || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setAccounts([]);
    setAccountId("");
    setApproved(false);
    setError("");
    setOutcome("");
    try {
      const result = await localCredentialAction("/verify", "POST", { token });
      const choices = activeVerifiedAccounts(result);
      if (!choices.length) throw new Error("Token belum menghasilkan akun dengan zone aktif yang terverifikasi.");
      setAccounts(choices);
      setAccountId(choices[0].id);
      setOutcome("Token aktif dan akun ditemukan. Token BELUM disimpan. Pilih akun lalu berikan persetujuan.");
    } catch (err) {
      // A failure should not leave unverified credentials eligible for saving.
      setError(err instanceof Error ? err.message : "Verifikasi gagal.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function store(method) {
    if (!canStore || inFlight.current) return;
    if (method === "PUT" && !window.confirm(
      "Ganti token yang tersimpan untuk akun ini di OS Keychain? Tindakan ini dapat memengaruhi koneksi yang sedang dipakai."
    )) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setOutcome("");
    const selectedId = accountId;
    try {
      const payload = credentialPayload(selectedId, token, approved);
      const result = await localCredentialAction("/credentials", method, payload);
      if (!confirmedVaultOutcome(method, result, selectedId)) {
        throw new Error("Server tidak mengonfirmasi hasil operasi credential untuk akun yang dipilih.");
      }
      setRevokeId(selectedId);
      setRevokeApproved(false);
      setOutcome(method === "POST"
        ? "Token berhasil disimpan di OS Keychain. Lanjutkan ke langkah Access & Tunnel untuk membuat/memeriksa draft."
        : "Token berhasil diganti di OS Keychain. Periksa kembali konfigurasi pada langkah berikutnya.");
      void onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Penyimpanan token gagal.");
    } finally {
      // Never keep submitted secret bytes in wizard state after a save attempt.
      setToken("");
      setAccounts([]);
      setAccountId("");
      setApproved(false);
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function revoke() {
    if (disabled || inFlight.current || !revokeApproved || !ACCOUNT_ID_RE.test(revokeId)) return;
    if (!window.confirm(
      "Hapus token Cloudflare untuk Account ID ini dari OS Keychain lokal? Token Cloudflare di server tetap aktif."
    )) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setOutcome("");
    const selectedId = revokeId;
    try {
      const payload = revokeCredentialPayload(selectedId, revokeApproved);
      const result = await localCredentialAction("/credentials", "DELETE", payload);
      if (!confirmedVaultOutcome("DELETE", result, selectedId)) {
        throw new Error("Server belum mengonfirmasi pencabutan credential lokal.");
      }
      setRevokeId("");
      setOutcome("Entri token lokal berhasil dihapus. Jika token Cloudflare tak diperlukan lagi, cabut juga melalui Cloudflare Dashboard.");
      void onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Penghapusan entri Keychain gagal.");
    } finally {
      setRevokeApproved(false);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label="Cloudflare Credential Vault" className="space-y-4">
      <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-4 text-sm">
        <h4 className="font-semibold">Status token yang tersimpan</h4>
        {status === "available" ? (
          <p className="mt-2 text-emerald-300">Token tersedia di OS Keychain untuk Account ID pada draft tersimpan. Isi token lagi hanya jika ingin menggantinya.</p>
        ) : status === "unavailable" ? (
          <p className="mt-2 text-amber-200">Draft sudah tersimpan, tetapi token untuk akun tersebut tidak tersedia atau OS Keychain terkunci.</p>
        ) : status === "no-draft" ? (
          <p className="mt-2 text-slate-300">Belum ada setup draft untuk memeriksa token yang mungkin sudah tersimpan. Jangan membuat token duplikat jika sebelumnya sudah menyimpan; lanjutkan ke konfigurasi Cloudflare atau masukkan token hanya bila perlu.</p>
        ) : (
          <p className="mt-2 text-amber-200">Status OS Keychain belum dapat diperiksa. Simpan atau ganti token hanya setelah sesi owner dan status sistem tersedia.</p>
        )}
        {draft?.accountId && ACCOUNT_ID_RE.test(draft.accountId) && (
          <p className="mt-2 break-all font-mono text-xs text-slate-400">Draft Account ID: {draft.accountId}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">Status draft bukan bukti bahwa OAuth ChatGPT/Claude sudah terhubung. Token yang tersimpan tidak bisa dibaca kembali melalui UI.</p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700 p-4">
        <h4 className="font-semibold">Verifikasi dan simpan token</h4>
        <p className="text-sm text-slate-300">Gunakan Cloudflare User API Token dengan izin minimum. Verifikasi hanya membaca akun dan zone, bukan membuat Tunnel, Access, atau DNS.</p>
        <label htmlFor="wizard-cloudflare-token" className="block text-sm font-medium">Cloudflare API Token</label>
        <input id="wizard-cloudflare-token" className={fieldClass} type="password"
          value={token} maxLength={256} autoComplete="off" spellCheck={false}
          onChange={event => resetVerification(event.target.value)} disabled={disabled}
          placeholder="Masukkan token jika perlu menyimpan atau mengganti" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={actionClass} disabled={!canVerify}
            onClick={() => void runVerify()}>
            {busy ? "Memproses..." : "Verifikasi token tanpa menyimpan"}
          </button>
          <button type="button" className={actionClass} disabled={disabled || !token}
            onClick={() => resetVerification("")}>Hapus input token</button>
        </div>

        {accounts.length > 0 && (
          <div className="space-y-3 rounded-lg border border-slate-600 bg-slate-950/30 p-3">
            <label htmlFor="wizard-cloudflare-account" className="block text-sm font-medium">
              Akun Cloudflare terverifikasi
            </label>
            <select id="wizard-cloudflare-account" className={fieldClass} value={accountId}
              disabled={disabled} onChange={event => { setAccountId(event.target.value); setApproved(false); }}>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>{account.name} — {account.id}</option>
              ))}
            </select>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={approved} disabled={disabled}
                onChange={event => setApproved(event.target.checked)} />
              Saya mengizinkan penyimpanan atau penggantian token terverifikasi untuk akun pilihan saya di OS Keychain.
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!canStore} className={actionClass}
                onClick={() => void store("POST")}>Simpan token</button>
              <button type="button" disabled={!canStore} className={actionClass}
                onClick={() => void store("PUT")}>Ganti token tersimpan</button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700 p-4">
        <h4 className="font-semibold">Cabut token lokal (opsional)</h4>
        <p className="text-sm text-slate-300">Tindakan ini hanya menghapus entri OS Keychain di komputer, bukan menonaktifkan token di Cloudflare. Tidak perlu dilakukan saat setup normal.</p>
        <label htmlFor="wizard-cloudflare-revoke" className="block text-sm font-medium">Cloudflare Account ID</label>
        <input id="wizard-cloudflare-revoke" className={fieldClass} value={revokeId}
          maxLength={32} autoComplete="off" spellCheck={false} disabled={disabled}
          onChange={event => { setRevokeId(event.target.value); setRevokeApproved(false); }}
          placeholder="32 karakter heksadesimal" />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={revokeApproved} disabled={disabled}
            onChange={event => setRevokeApproved(event.target.checked)} />
          Saya menyetujui penghapusan entri token lokal untuk Account ID ini.
        </label>
        <button type="button" className={actionClass}
          disabled={disabled || !revokeApproved || !ACCOUNT_ID_RE.test(revokeId)}
          onClick={() => void revoke()}>Hapus token dari OS Keychain</button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">{error}</p>}
      {outcome && <p role="status" aria-live="polite" className="rounded-lg border border-slate-600 p-3 text-sm text-slate-300">{outcome}</p>}
    </section>
  );
}
