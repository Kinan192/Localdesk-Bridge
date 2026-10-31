# Tailwind CSS v4 — Status Migrasi UI

**Path Next.js aktif:** `~/Projects/local-mcp-manager/src/app`
**Legacy (jangan diedit):** `~/Projects/local-mcp-manager/apps/dashboard/src/app`

## Kenapa masih ada CSS?

Template awal memang sudah menginstal Tailwind CSS v4 (`tailwindcss` dan `@tailwindcss/postcss`), tetapi banyak gaya sebelumnya ditulis sebagai CSS biasa di `src/styles/*.css`.

Mulai tahap perapian 28 Oktober 2026:
- `src/app/globals.css` memakai `@import "tailwindcss"` + `@theme` untuk design tokens.
- Shared UI: `primitives.tsx`, `panel.tsx`, `page-title.tsx`, dan `modal.tsx` menggunakan Tailwind utility classes.
- Shell/layout sidebar/topbar dan halaman Overview, File Access, MCP Tools, Connections, Activity, Settings telah mulai ditambah utility classes.
- Halaman File Access (informasi hak akses dan ringkasan root), MCP Tools (ringkasan/indikator progres), dan Overview (penandaan status live vs simulasi) diperbarui pada audit lanjutan.
- CSS lama **sementara tetap di-import** untuk elemen yang belum dimigrasi (hero orbit, charts, responsive submenu, form/button styling). Menghapusnya sekarang bisa merusak UI.

**Status:** Tailwind-first migration **in progress**, belum 100% Tailwind utility. Tidak ada rencana menjadikan CSS custom sebagai cara utama styling baru.

## Standards for new frontend changes

1. Pakai utility classes Tailwind pada `className` React sebagai pilihan utama.
2. Reusable UI ditempatkan pada `src/components/ui`; style variant di dalam modul TSX menggunakan class strings yang eksplisit.
3. Pakai `@theme` (Tailwind v4) untuk design tokens di `src/app/globals.css`.
4. Tidak membuat file CSS custom baru per feature.
5. CSS custom yang tersisa hanya untuk hal yang sulit direpresentasikan oleh utilitas, lalu dihapus setelah komponen pemakainya dimigrasi dan visual regression diverifikasi.
6. Jangan gunakan `apps/dashboard` lagi. Semua pengembangan di root `src/`.

## Audit command

```bash
cd ~/Projects/local-mcp-manager
npm run audit:all
```

Kesalahan awal `possibly missing icon Icon` adalah false positive: Icon merupakan alias destructured prop pada `IconBubble`. `scripts/audit-project.mjs` telah diperbaiki.

Build dan pengujian browser setelah perubahan ini belum bisa dijalankan melalui Arch Local MCP, karena konektor tidak menyediakan eksekusi terminal. Ikuti output audit yang dicetak di terminal pengguna.
