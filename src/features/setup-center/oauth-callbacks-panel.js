"use client";

import { useCallback, useEffect, useState } from "react";

const endpoint = "/api/local/cloudflare/oauth-redirects";
const headers = { "Content-Type": "application/json", "X-Local-MCP-Action": "dashboard" };

function validate(items) {
  if (items.length < 1 || items.length > 8) return "Gunakan 1 sampai 8 Redirect URL.";
  const urls = items.map(item => item.trim());
  if (new Set(urls).size !== urls.length) return "Setiap Redirect URL harus unik.";
  for (const raw of urls) {
    try {
      const wildcard = raw.endsWith("/*");
      const uri = new URL(wildcard ? raw.slice(0, -1) : raw);
      if (uri.protocol !== "https:" || !uri.hostname || uri.username || uri.password ||
          uri.hash || uri.search || uri.port || raw.includes("%") ||
          (raw.includes("*") && !wildcard) || uri.hostname === "localhost" ||
          uri.hostname === "127.0.0.1" || raw.length > 300) throw new Error();
    } catch {
      return "Gunakan URL HTTPS tanpa query atau fragment. Wildcard hanya boleh berupa /* di akhir path.";
    }
  }
  return "";
}

export function OAuthCallbacksPanel({ embedded = false, onChanged = null }) {
  const [snapshot, setSnapshot] = useState(null);
  const [urls, setUrls] = useState([]);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    setConsent(false);
    setUncertain(false);
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.redirectUris)) {
        throw new Error(data.error || (response.status === 401
          ? "Owner pairing diperlukan. Buka dashboard dari browser lokal yang sudah dipasangkan."
          : "Tidak dapat membaca daftar OAuth dari Cloudflare."));
      }
      setSnapshot(data);
      setUrls([...data.redirectUris]);
      setMessage("Redirect URL terbaru berhasil dibaca langsung dari Cloudflare.");
    } catch (e) {
      setSnapshot(null);
      setUrls([]);
      setError(e instanceof Error ? e.message : "Gagal memuat OAuth settings.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function edit(index, value) {
    setConsent(false);
    setUrls(previous => previous.map((item, i) => i === index ? value : item));
  }
  function add() {
    setConsent(false);
    setUrls(previous => [...previous, ""]);
  }
  function remove(index) {
    setConsent(false);
    setUrls(previous => previous.filter((_, i) => i !== index));
  }

  const normalized = urls.map(uri => uri.trim());
  const validation = validate(urls);
  const changed = snapshot && JSON.stringify(normalized) !== JSON.stringify(snapshot.redirectUris);

  async function save() {
    if (!snapshot || busy || uncertain || !consent || validation || !changed) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT", credentials: "same-origin", cache: "no-store", headers,
        body: JSON.stringify({
          confirmed: true, confirmHostname: snapshot.hostname,
          expectedUris: snapshot.redirectUris, redirectUris: normalized,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.verified !== true) {
        setUncertain(data.requiresInspection === true);
        throw new Error(data.error || "Perubahan belum dapat dikonfirmasi. Periksa status Cloudflare.");
      }
      setSnapshot({ ...snapshot, redirectUris: data.redirectUris, inSyncWithLocalState: true });
      if (onChanged) void onChanged();
      setUrls([...data.redirectUris]);
      setConsent(false);
      setMessage(data.updated
        ? "Redirect URL diperbarui dan diverifikasi di Cloudflare. Access, Tunnel, dan DNS tidak dibuat ulang."
        : "Daftar Redirect URL sudah sesuai dengan Cloudflare.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Perubahan tidak terkonfirmasi.");
    } finally { setBusy(false); }
  }

  return (
    <div className={embedded ? "min-w-0 space-y-4 text-slate-100" : "space-y-6 text-slate-100"}>
      <div className="space-y-2">
        {embedded
          ? <h4 className="text-base font-semibold">Manage OAuth Redirect URLs</h4>
          : <h1 className="text-2xl font-bold">Manage OAuth Redirect URLs</h1>}
        <p className="text-sm text-slate-300">
          Kelola callback ChatGPT, Claude, atau client lain dari dashboard lokal.
          Perubahan hanya memodifikasi Access application yang sudah ada.
        </p>
      </div>
      <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Cloudflare Managed OAuth</h2>
            <p className="text-sm text-slate-300">Hostname: {snapshot?.hostname || "Belum tersedia"}</p>
            <p className="text-xs text-slate-400">Status deployment: {snapshot?.phase || "tidak diketahui"}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy}
            className="rounded-lg border border-sky-500 px-3 py-2 text-sm text-sky-200 disabled:opacity-40">
            Muat ulang dari Cloudflare
          </button>
        </div>
        {snapshot && (
          <>
            {!snapshot.inSyncWithLocalState && (
              <p role="status" className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">
                Callback di Cloudflare berbeda dari metadata lokal. Menyimpan dari halaman ini
                akan menyinkronkan metadata setelah verifikasi berhasil.
              </p>
            )}
            <div className="space-y-3">
              {urls.map((url, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 space-y-1 text-sm">
                    <span className="block text-slate-300">Redirect URL {index + 1}</span>
                    <input type="url" value={url} onChange={event => edit(index, event.target.value)}
                      disabled={busy || uncertain} placeholder="https://client.example.com/callback"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 disabled:opacity-50" />
                  </label>
                  <button type="button" disabled={busy || uncertain || urls.length < 2}
                    onClick={() => remove(index)}
                    className="rounded-lg border border-rose-500 px-3 py-2 text-sm text-rose-200 disabled:opacity-40">
                    Hapus
                  </button>
                </div>
              ))}
              <button type="button" onClick={add} disabled={busy || uncertain || urls.length >= 8}
                className="rounded-lg border border-sky-500 px-3 py-2 text-sm text-sky-200 disabled:opacity-40">
                + Tambah Redirect URL
              </button>
              <p className="text-xs text-slate-400">
                Maksimal 8 URL HTTPS. Gunakan callback yang diberikan oleh ChatGPT/Claude.
                Wildcard /* hanya di akhir path dan gunakan sesuai kebutuhan.
              </p>
            </div>
            {validation && <p role="alert" className="text-sm text-amber-200">{validation}</p>}
            {changed && !validation && (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={consent} disabled={busy || uncertain}
                  onChange={event => setConsent(event.target.checked)} />
                Saya menyetujui perubahan OAuth Redirect URLs pada Access application
                untuk {snapshot.hostname}.
              </label>
            )}
            <button type="button" disabled={busy || uncertain || !changed || !consent || Boolean(validation)}
              onClick={() => void save()}
              className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
              {busy ? "Memproses..." : "Simpan & Verifikasi ke Cloudflare"}
            </button>
          </>
        )}
        {error && <p role="alert" className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">{error}</p>}
        {uncertain && <p className="text-sm text-amber-200">
          Jangan klik Simpan berulang kali. Periksa Access application di Cloudflare
          sebelum memuat ulang dan mencoba lagi.
        </p>}
        {message && <p role="status" className="text-sm text-emerald-200">{message}</p>}
      </section>
    </div>
  );
}