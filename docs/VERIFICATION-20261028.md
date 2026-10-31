# Verifikasi setelah perbaikan — 28 Oktober 2026

## Scope
Project aktif: `~/Projects/local-mcp-manager`. Tidak ada perubahan pada `~/Projects/local-file-mcp`.

## Perbaikan source diterapkan
- `tsconfig.foundation.json` memisahkan modul foundation/MCP dari adapter HTTP Next.js. `src/server/http/local-only.ts` hanya dikompilasi oleh `npm run typecheck` dan `next build`, mengatasi error `next/server` dalam typecheck NodeNext foundation tanpa menghilangkan pengecekan endpoint.
- `scripts/audit-project.mjs` mengaudit berkas wajib `.tsx` Next.js dan enam feature page; test MCP juga masuk static scan.
- `tests/foundation/local-policy.test.ts` menguji penyimpanan root read-only, enable/disable root, toggle read tool, penolakan write tool, dan revoke root menggunakan state sementara.
- `tests/mcp/stdio-smoke.test.ts` menguji handshake MCP via subprocess, tool list read-only, default allowlist kosong, dan penolakan root tak dikenal. Test memakai temporary `LOCAL_MCP_STATE_DIR`; tidak menyentuh policy MCP lama.
- `package.json` menambahkan `npm run test:mcp` ke `audit:all`.
- File Access dan MCP Tools: migrasi Tailwind utility tambahan; Overview dan AppShell membedakan policy live dengan agent/analytics demo.
- Integrasi awal yang sudah ada: `src/context/dashboard-context.tsx` -> `/api/local/policy` -> `src/server/http/local-policy.ts` -> `JsonPolicyRepository`. Status agent via `/api/local/status` masih `not-managed`.

## Runtime fix — Local API HTTP 403

Log `npm run dev` memperlihatkan halaman Next.js 200, tetapi dua GET API `/api/local/policy` dan `/api/local/activity` mendapat 403. Keduanya memakai `ensureLocalRequest` di `src/server/http/local-only.ts`.

**Penyebab yang ditemukan pada source:** guard lama mewajibkan `request.headers.host === new URL(request.url).host`. Next.js dapat menormalisasi `request.url` sebagai `localhost` sementara browser memakai `127.0.0.1`; keduanya seharusnya sah.

**Perbaikan diterapkan:**
- `src/server/http/localhost-policy.ts` membuat validasi Host lokal independen dari host pada URL internal Next.js.
- `src/server/http/local-only.ts` menggunakan validasi tersebut.
- Host yang diizinkan hanya `127.0.0.1:3100` dan `localhost:3100`; domain/port lain tetap 403.
- Request mutasi POST/PATCH/DELETE tetap memerlukan Origin yang persis cocok dengan Host, `Content-Type: application/json`, serta `x-local-mcp-action: dashboard`.
- Regression tests di `tests/foundation/localhost-policy.test.ts` dan script npm `test` telah diperbarui.

**Belum diuji pada runtime pengguna setelah patch.** Jalankan `npm run audit:all`, lalu restart `npm run dev`; periksa `curl -i http://127.0.0.1:3100/api/local/status`, `/api/local/policy`, dan `/api/local/activity?limit=1`. Semua GET seharusnya menghasilkan HTTP 200 bila storage lokal sehat.

## BELUM diverifikasi
Arch Local MCP V2 hanya mampu baca/tulis/rename file, tidak bisa mengeksekusi Node, npm, TypeScript compiler, browser, atau subprocess. Perubahan source belum dinyatakan lulus sampai langkah di bawah berhasil.

## Jalankan pada komputer Arch Linux

```bash
cd ~/Projects/local-mcp-manager
npm run audit:all
```

Jika berhasil, jalankan dashboard:

```bash
npm run dev
```

Di terminal lain:

```bash
curl -i http://127.0.0.1:3100/api/local/status
curl -i http://127.0.0.1:3100/api/local/policy
```

Lakukan QA manual di browser `http://127.0.0.1:3100`: buka Overview, File Access, MCP Tools, Connections, Activity, Settings; pastikan File Access dan MCP Tools mengambil state lokal dan status agent tidak mengaku sedang hidup. Untuk menguji perubahan policy, gunakan hanya folder percobaan yang bukan folder sensitif.

## Keamanan dan batasan
MCP stdio mendaftarkan 5 tool baca saja; write, delete, rename, edit belum diaktifkan. UI menyimpan real policy lokal, tetapi dashboard hanya dilindungi guard localhost + Origin/custom header (belum ada autentikasi akun/owner). Jangan ekspos port 3100 lewat tunnel. MCP stdio tidak dikelola lifecycle/statusnya dari UI. Jangan menghapus folder legacy sampai audit/build lulus.
