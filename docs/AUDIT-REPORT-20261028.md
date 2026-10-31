# Local MCP Manager — FE/Backend Audit

**Tanggal:** 28 Oktober 2026  
**Scope:** `~/Projects/local-mcp-manager`, bukan MCP lama.  
**Tool:** hanya Arch Local MCP V2.  
**Jenis pemeriksaan:** pembacaan source, pemeriksaan impor/nama komponen, inspeksi API contracts, policy/file engine, dan penguatan tes. Tidak ada eksekusi `npm`, `tsc`, Node.js, Next.js atau browser dari tool ini.

## Temuan frontend dan tindakan

1. **ERROR — Modal module missing:** `src/components/ui/index.ts` mengekspor `./modal`, tetapi file masih bernama `modal.tsx.ts`, bukan `modal.tsx`. Impor dashboard akan gagal. **FIXED:** nama sudah dikembalikan ke `modal.tsx`.
2. **ERROR — Undeclared icon Activity:** `src/features/settings/settings-page.tsx` menggunakan `icon: Activity` tetapi tidak mengimpor `Activity` dari `lucide-react`. Halaman Settings dapat gagal pada build/runtime. **FIXED:** import ditambahkan.
3. **CHECK — component refs:** halaman Overview, File Access, Tools, Connections, Activity serta modal dan settings telah diperiksa secara statis atas referensi komponen dan impor. Tidak ditemukan referensi JSX uppercase yang tidak diimpor pada halaman-halaman tersebut setelah perbaikan.
4. **CHECK — file structure:** komponen Next.js dan UI telah dikembalikan ke nama `.tsx` yang benar. Komponen yang direnam sementara saat audit telah dipulihkan.
5. **LIMITATION:** CSS/JSX TypeScript dan aplikasi browser belum build/test secara nyata; `npm run audit:all` akan memberikan hasil final.

## Temuan backend dan tindakan

1. **SECURITY HARDENING — local policy storage:** `JsonPolicyRepository.load()` sebelumnya membuka `policy.json` melalui `readFile` tanpa menolak symlink/hardlink. **FIXED:** periksa `lstat()` terlebih dahulu, tolak symlink/file tidak reguler dan hardlink.
2. **SECURITY HARDENING — storage directory:** `ensureDirectory()` memanggil `chmod` tanpa memeriksa apakah state directory berupa symlink. **FIXED:** validasi dengan `lstat` sebelum `chmod`.
3. **REGRESSION TEST:** tambah tes yang memastikan penyimpanan policy tidak mengikuti symlink yang diarahkan ke file lain.
4. **CHECK:** kontrak tools, default read-only, root allowlist, penolakan overlap, traversal/symlink, maximum bytes, create-exclusive, dan policy checks diperiksa dari source. Ini belum sama dengan test runtime.
5. **KNOWN LIMIT:** `edit_file`, `rename_file`, `delete_file` masih `NOT_IMPLEMENTED` dan default OFF. MCP Agent, supervisor dan dashboard API belum diimplementasi.
6. **KNOWN SECURITY LIMIT:** parent path TOCTOU dapat terjadi jika proses lokal lain aktif mengganti symlink. Jangan mengekspos write operations melalui remote MCP hingga hardening tingkat filesystem selesai.

## Audit tooling ditambahkan

- `scripts/audit-project.mjs`: static checks untuk referensi import lokal, CSS import, temporary extension, dan potensi ikon yang tidak diimpor.
- `package.json`: `npm run audit:static` dan `npm run audit:all`.
- `tests/foundation/local-storage.test.ts`: regression test symlink storage.

## Jalankan di Arch Linux

```bash
cd ~/Projects/local-mcp-manager
npm install
npm run audit:all
```

`audit:all` menjalankan static import audit, TypeScript foundation, unit tests foundation, TypeScript frontend, dan Next.js production build. Ini tidak me-restart layanan MCP lama dan tidak membuat port publik.

Jika ada error, kirim output utuh supaya bisa dikoreksi melalui Arch Local MCP V2. Jangan gunakan RDC kecuali diminta eksplisit.

**Status:** perbaikan source telah diterapkan. Verifikasi eksekusi dan browser masih pending.
