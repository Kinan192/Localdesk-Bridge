"use client";

import { useState } from "react";
import { newReadRoot } from "./folder-policy";

const rowClass = "rounded-lg border border-slate-700 bg-slate-950/40 p-3";
const inputClass = "w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50";
const buttonClass = "rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40";

export function SystemCheckPanel({ system, busy, onRefresh }) {
  if (!system) {
    return (
      <div className={rowClass} role="status">
        Pemeriksaan sistem belum tersedia. Pastikan sesi owner aktif dan coba Perbarui status.
        <button className={buttonClass + " mt-3 block"} type="button" disabled={busy} onClick={onRefresh}>
          Periksa ulang
        </button>
      </div>
    );
  }
  return (
    <section aria-label="Hasil pemeriksaan sistem" className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className={rowClass}>
          <dt className="text-xs text-slate-400">Platform</dt>
          <dd className="mt-1 font-medium">{system.platform || "Tidak tersedia"}</dd>
        </div>
        <div className={rowClass}>
          <dt className="text-xs text-slate-400">Node.js</dt>
          <dd className="mt-1 font-medium">{system.nodeVersion || "Tidak tersedia"}</dd>
        </div>
        <div className={rowClass}>
          <dt className="text-xs text-slate-400">Dependencies project</dt>
          <dd className={"mt-1 font-medium " + (system.dependenciesReady ? "text-emerald-300" : "text-amber-200")}>
            {system.dependenciesReady ? "Terdeteksi" : "Perlu diperiksa"}
          </dd>
        </div>
        <div className={rowClass}>
          <dt className="text-xs text-slate-400">Cloudflared (binary)</dt>
          <dd className={"mt-1 font-medium " + (system.cloudflaredPresent ? "text-emerald-300" : "text-amber-200")}>
            {system.cloudflaredPresent ? "Terdeteksi" : "Tidak ditemukan"}
          </dd>
        </div>
      </dl>
      {Array.isArray(system.missing) && system.missing.length > 0 && (
        <div className={rowClass} role="status">
          <p className="text-sm text-amber-200">Komponen yang belum ditemukan:</p>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-300">
            {system.missing.map(item => <li key={item} className="break-words">{item}</li>)}
          </ul>
        </div>
      )}
      <p className="text-xs leading-5 text-slate-400">
        Pemeriksaan hanya membaca kondisi perangkat. Binary Cloudflared yang tersedia belum membuktikan Tunnel Healthy atau koneksi AI berhasil.
      </p>
      <button className={buttonClass} type="button" disabled={busy} onClick={onRefresh}>
        Periksa ulang sistem
      </button>
    </section>
  );
}

export function FolderAccessPanel({ policyResponse, busy, onAdd, onToggle, onRemove }) {
  const [label, setLabel] = useState("");
  const [absolutePath, setAbsolutePath] = useState("");
  const [formError, setFormError] = useState("");

  const policy = policyResponse?.mode === "read-only" ? policyResponse.policy : null;
  const roots = Array.isArray(policy?.roots) ? policy.roots : null;
  const available = roots !== null;
  const submitting = busy || !available;

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");
    try {
      const payload = newReadRoot(label, absolutePath);
      if (await onAdd(payload)) {
        setLabel("");
        setAbsolutePath("");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Input folder tidak valid.");
    }
  }

  function confirmRemoval(root) {
    if (submitting) return;
    if (!window.confirm("Hapus izin folder '" + root.label + "' dari LocalDesk? File aslinya tidak akan dihapus.")) return;
    void onRemove(root.id);
  }

  return (
    <section className="space-y-4" aria-label="Izin folder baca">
      <p className="text-sm text-slate-300">
        Pilih hanya folder yang diperlukan. Izin saat ini <strong>Read Only</strong>; Read &amp; Write belum tersedia dan tidak dapat diaktifkan dari wizard.
      </p>

      <div className={rowClass}>
        <h4 className="font-medium">Folder yang telah disetujui</h4>
        {!available && (
          <p className="mt-2 text-sm text-amber-200" role="status">
            Kebijakan folder belum dapat diverifikasi. Perubahan dinonaktifkan.
          </p>
        )}
        {available && roots.length === 0 && (
          <p className="mt-2 text-sm text-slate-400">Belum ada folder yang diberikan akses.</p>
        )}
        {available && roots.length > 0 && (
          <ul className="mt-3 space-y-3">
            {roots.map(root => (
              <li key={root.id} className="rounded-lg border border-slate-700 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{root.label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-400">{root.absolutePath}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {root.access === "read" ? "Read Only" : "Izin tidak dikenal — perlu pemeriksaan"} · {root.enabled ? "Aktif" : "Nonaktif"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={buttonClass}
                      disabled={submitting || root.access !== "read"}
                      onClick={() => void onToggle(root.id, !root.enabled)}>
                      {root.enabled ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button type="button" className={buttonClass} disabled={submitting}
                      onClick={() => confirmRemoval(root)}>Cabut izin</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className={rowClass + " space-y-3"} onSubmit={submit}>
        <h4 className="font-medium">Tambahkan folder — Read Only</h4>
        <div>
          <label htmlFor="setup-root-label" className="mb-1 block text-sm text-slate-300">Nama folder</label>
          <input id="setup-root-label" className={inputClass} type="text" maxLength={80}
            required autoComplete="off" value={label} onChange={event => setLabel(event.target.value)}
            placeholder="Contoh: Project kerja" disabled={submitting} />
        </div>
        <div>
          <label htmlFor="setup-root-path" className="mb-1 block text-sm text-slate-300">Path absolut folder</label>
          <input id="setup-root-path" className={inputClass} type="text" maxLength={4096}
            required autoComplete="off" spellCheck={false} value={absolutePath}
            onChange={event => setAbsolutePath(event.target.value)}
            placeholder="/home/username/Projects/contoh" disabled={submitting} />
        </div>
        <p className="text-xs text-slate-400">
          Folder harus sudah ada dan menggunakan path absolut. Validasi keamanan dilakukan kembali oleh server; seluruh home, folder tersembunyi, symlink dan folder yang saling bertumpuk ditolak.
        </p>
        {formError && <p role="alert" className="text-sm text-amber-200">{formError}</p>}
        <button className={buttonClass} type="submit" disabled={submitting}>Berikan akses baca</button>
      </form>
    </section>
  );
}
