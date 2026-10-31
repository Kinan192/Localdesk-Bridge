# Frontend Architecture — Local MCP Manager

**Single Next.js app:** `~/Projects/local-mcp-manager/`.

## Structure

```text
src/
├── app/                      # Next.js layout, page, globals.css
├── components/
│   ├── dashboard.tsx         # Composition root
│   ├── layout/               # Sidebar, topbar, dialogs
│   └── ui/                   # Reusable presentational components
├── features/
│   ├── overview/
│   ├── file-access/
│   ├── mcp-tools/
│   ├── connections/
│   ├── activity/
│   └── settings/
├── config/navigation.ts
├── context/dashboard-context.tsx
├── lib/                      # Demo data dan utilitas
└── styles/                   # Tokens, shell, features, responsive
```

## Component responsibilities

- `app/`: route composition dan metadata. Bukan tempat operasi filesystem.
- `components/ui/`: komponen kecil reusable yang tidak mengatur policy MCP.
- `components/layout/`: sidebar, breadcrumb, modal dan layout utama.
- `features/`: halaman dan interaksi per domain; nantinya hooks/api clients tersendiri.
- `context/`: state UI **simulasi** saat ini. Jangan gunakan sebagai sumber izin sesungguhnya.
- `styles/`: CSS modular; `app/globals.css` mengimpor stylesheet yang dibutuhkan.

## Data flow

```
app/page.tsx
  -> DashboardProvider
      -> AppShell (sidebar / header)
          -> current feature page
          -> DashboardDialogs
```

Backend mendatang berkomunikasi lewat Next.js Route Handlers (`src/app/api/`), yang menghubungi modul di `src/server/`. Seluruh operasi file dan izin harus ditegakkan di server, bukan React.

## Current status

UI sudah dipindahkan dari `apps/dashboard/src` ke `src` tanpa perubahan desain yang direncanakan. Source dipindahkan menggunakan Arch Local MCP V2, bukan script otomatis. Perlu `npm run audit:all` dan browser regression check pada perangkat pengguna untuk konfirmasi hasil.

```bash
cd ~/Projects/local-mcp-manager
npm install
npm run audit:all
npm run dev
```

URL: `http://127.0.0.1:3100`. Directory `apps/dashboard` adalah legacy dan tidak digunakan lagi.

Ikuti `docs/ARCHITECTURE.md` untuk keseluruhan desain frontend dan backend.

