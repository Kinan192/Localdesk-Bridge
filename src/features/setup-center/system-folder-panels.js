"use client";

import { useState } from "react";
import { newFolderRoot } from "./folder-policy";

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

export function FolderAccessPanel({ policyResponse, busy, onAdd, onToggle, onRemove, onAccess, pendingDelete, onApproveDelete }) {
  const [label, setLabel] = useState("");
  const [absolutePath, setAbsolutePath] = useState("");
  const [access, setAccess] = useState("read");
  const [formError, setFormError] = useState("");

  const policy = ["read-only", "read-write"].includes(policyResponse?.mode)
    ? policyResponse.policy : null;
  const writeSupported = policyResponse?.writeRelease?.available === true;
  const roots = Array.isArray(policy?.roots) ? policy.roots : null;
  const available = roots !== null;
  const submitting = busy || !available;

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");
    try {
      if (access === "write" && !window.confirm("Berikan AI izin membuat, mengedit, mengganti nama, dan meminta penghapusan file pada folder ini?")) return;
      const payload = newFolderRoot(label, absolutePath, access);
      if (await onAdd(payload)) {
        setLabel("");
        setAbsolutePath("");
        setAccess("read");
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
    <section className="space-y-4" aria-label="Izin akses folder">
      <p className="text-sm text-slate-300">
        Pilih folder dan tentukan izin <strong>Read Only</strong> atau <strong>Read &amp; Write</strong>. Izin awal selalu Read Only; Write harus dipilih secara eksplisit.
      </p>
      {policyResponse?.writeRelease?.available === false && (
        <p role="status" className="rounded-lg border border-slate-700 p-3 text-xs leading-5 text-amber-200">
          Write hanya tersedia dengan sandbox Linux atau pada mode pengujian Windows (localdesk --windows-write-preview). Mode Windows belum setara isolasi sandbox Linux: gunakan folder khusus tanpa data sensitif. Penghapusan file selalu memerlukan persetujuan terpisah.
        </p>
      )}

      {Array.isArray(pendingDelete) && pendingDelete.length > 0 && (
        <div className={rowClass}>
          <h4 className="font-medium">Persetujuan penghapusan dari AI</h4>
          <p className="mt-1 text-xs text-amber-200">Periksa nama folder dan file sebelum menyetujui. Izin ini hanya berlaku sekali.</p>
          <ul className="mt-3 space-y-2">
            {pendingDelete.map(item => (
              <li key={item.id} className="rounded border border-slate-700 p-3">
                <p className="break-all text-sm">{item.file}</p>
                <p className="text-xs text-slate-400">Folder ID: {item.rootId}</p>
                <button className={buttonClass + " mt-2"} type="button" disabled={busy}
                  onClick={() => {
                    const root = roots?.find(r => r.id === item.rootId);
                    if (!root || !window.confirm("Setujui AI menghapus file '" + item.file + "' dalam folder '" + root.label + "'?")) return;
                    void onApproveDelete(item.id);
                  }}>Setujui hapus sekali</button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                      {root.access === "write" ? "Read & Write" : "Read Only"} · {root.enabled ? "Aktif" : "Nonaktif"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-400" htmlFor={"root-access-" + root.id}>Akses</label>
                    <select id={"root-access-" + root.id} className={inputClass}
                      value={root.access} disabled={submitting || (!writeSupported && root.access === "read")}
                      onChange={event => {
                        const selected = event.target.value;
                        if (selected === "write" && !window.confirm("Izinkan AI membuat dan mengubah file di folder '" + root.label + "'?")) return;
                        void onAccess(root.id, selected);
                      }}>
                      <option value="read">Read Only</option>
                      <option value="write" disabled={!writeSupported}>Read & Write</option>
                    </select>
                    <button type="button" className={buttonClass}
                      disabled={submitting}
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
        <h4 className="font-medium">Tambahkan folder</h4>
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
        <div>
          <label htmlFor="setup-root-access" className="mb-1 block text-sm text-slate-300">Izin akses</label>
          <select id="setup-root-access" className={inputClass} value={access}
            onChange={event => setAccess(event.target.value)} disabled={submitting}>
            <option value="read">Read Only</option>
            <option value="write" disabled={!writeSupported}>Read & Write</option>
          </select>
          {!writeSupported && <p className="mt-1 text-xs text-amber-200">Write belum tersedia pada sistem ini.</p>}
        </div>
        <p className="text-xs text-slate-400">
          Folder harus sudah ada dan menggunakan path absolut. Validasi keamanan dilakukan kembali oleh server; seluruh home, folder tersembunyi, symlink dan folder yang saling bertumpuk ditolak.
        </p>
        {formError && <p role="alert" className="text-sm text-amber-200">{formError}</p>}
        <button className={buttonClass} type="submit" disabled={submitting || (access === "write" && !writeSupported)}>Simpan izin folder</button>
      </form>
    </section>
  );
}
