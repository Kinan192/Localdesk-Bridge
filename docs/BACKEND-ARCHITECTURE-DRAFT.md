# Backend Architecture — Local MCP Manager v0.3

**Scope:** aplikasi kecil satu pengguna per komputer, tanpa VPS atau cloud database. Backend ditempatkan di `src/server/` dalam satu project Next.js.

## Komponen

```text
src/server/
  contracts/       # Zod, error types, contracts
  access/          # Policy engine
  files/           # File engine + keamanan path
  storage/         # Config persistence lokal
  mcp/
    stdio.ts       # MCP lokal read-only alpha
```

## Cara kerja

- **Dashboard Next.js:** UI dan API Route Handlers; semua berjalan di `127.0.0.1:3100`.
- **MCP stdio:** proses Node.js yang dijalankan oleh Claude Desktop/Claude Code; bukan web server, tidak membuka port.
- **Policy engine:** hanya root folder dan tools yang eksplisit diizinkan. Default tidak ada root dan lima write tools disabled.
- **Filesystem engine:** operasi baca, listing, cari, metadata, create dir/file terbatas. Mode write belum didaftarkan sebagai MCP tools.
- **Local storage:** JSON policy repository alpha; SQLite dapat ditambahkan nanti jika kebutuhan log bertambah.

## Implementasi yang sudah ditulis

1. Shared Zod schemas dan tool contracts (10 IDs).
2. Per-folder dan per-tool authorization.
3. File Engine dengan batas path, ekstensi, ukuran, dan symlink/hardlink.
4. Repository JSON policy lokal.
5. MCP SDK v2 stdio alpha, mendaftarkan **5 read-only tools**.
6. Unit tests untuk foundation, belum dijalankan pada Arch.

## Belum ada

- Next.js API untuk mengatur root dan tools dari dashboard.
- Session/CSRF/Host validation untuk API local.
- Real dashboard status dan activity logs.
- Delete approval, safe edit/rename, dan hardened write.
- HTTPS/remote MCP untuk ChatGPT/Claude Web.
- Installer/packaging.

## Next implementation plan

1. `npm install && npm run audit:all` di root project.
2. Bangun pengaturan root policy lewat dashboard dengan protected Next.js local API.
3. Test MCP stdio dengan Claude/Inspector dan folder percobaan.
4. Lanjut lifecycle/health monitoring, logs, dan approval mutasi.
5. Hanya setelah aman, tambah koneksi HTTPS untuk ChatGPT/Claude Web.

**Penting:** AI tidak pernah mendapatkan kemampuan arbitrer menjalankan command/shell. Penulisan file remote tidak boleh aktif sebelum mitigasi filesystem TOCTOU diuji. Tidak ada kredensial pengguna atau file pribadi di repository.

Dokumentasi terbaru: `docs/ARCHITECTURE.md`.

