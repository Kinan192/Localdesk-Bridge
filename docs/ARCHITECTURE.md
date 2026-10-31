# Architecture — Local MCP Manager v0.4 Remote Preview

**Target:** Aplikasi kecil untuk beberapa komputer milik sendiri atau teman. Tidak perlu SaaS, VPS, microservices, ataupun cloud database.  
**Status:** Audit terakhir yang diberikan pengguna pada 28 Oktober 2026 lulus (72 source files, 30 foundation tests, 3 MCP smoke tests, kedua TypeScript checks dan production build). Perubahan terbaru mengutamakan Web MCP dalam wizard dan AI Connections, sehingga **masih perlu audit ulang**. Real Cloudflare OAuth serta ChatGPT/Claude Web tools belum diuji. Fokus produk adalah pengguna baru, bukan tunnel milik developer.

## Arsitektur

```text
NEW USER (Windows / macOS / Linux)
    |
    v
Local MCP Manager Dashboard (127.0.0.1:3100)
    |-- First-run Web MCP wizard
    |-- Approve folders / read tools
    |-- Cloudflare configuration + MCP HTTP lifecycle (alpha)
    |
    v
Read-only MCP HTTP (127.0.0.1:8401/mcp)
    |-- Validate Cloudflare Access JWT
    |-- PolicyEngine -> FileEngine -> approved roots
    |
    v
Cloudflare Tunnel + Access Managed OAuth (future automated provisioning)
    |
    v
Claude Web / eligible ChatGPT Web custom MCP

Optional legacy mode: Claude Desktop / Claude Code via MCP stdio.
The dashboard port 3100 must NEVER be exposed through the tunnel.
```

**Remote Web MCP:** ChatGPT Web dan Claude Web dihubungkan ke `src/server/mcp/http.ts`, proses Node.js Streamable HTTP lokal pada `127.0.0.1:8401/mcp`. Cloudflare Tunnel mempublikasikan hostname khusus; Cloudflare Access Managed OAuth dan validasi JWT di origin diwajibkan. Dashboard Next.js port 3100 tetap privat. Kode sudah ditulis, tetapi remote belum diaktifkan.

**Catatan:** satu repo/package.json tidak berarti semua kode MCP harus berjalan di proses Next.js. Stdio dan remote HTTP menggunakan entry point terpisah di `src/server/mcp`, bukan monorepo.

## Project structure

```text
local-mcp-manager/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── context/
│   ├── config/
│   ├── lib/
│   ├── styles/
│   └── server/
│       ├── contracts/
│       ├── access/
│       ├── files/
│       ├── storage/
│       ├── audit/
│       ├── http/
│       ├── setup/
│       ├── onboarding/
│       ├── cloudflare/
│       ├── service/
│       └── mcp/
├── public/
├── tests/foundation/
├── scripts/
├── docs/
├── package.json
├── tsconfig.json
├── tsconfig.foundation.json
├── next.config.ts
└── postcss.config.mjs
```

## Modules

- `src/components/ui`: komponen presentasional reusable (Toggle, Modal, Panel).
- `src/features/*`: halaman domain + interaksi.
- `src/context`: state UI sementara (demo). Ini bukan sumber izin filesystem.
- `src/server/contracts`: Zod policy/tool/DTO schemas.
- `src/server/access`: autorisasi per root dan tool, default deny.
- `src/server/files`: path resolution dan file operations terbatas.
- `src/server/storage`: penyimpanan policy lokal, kontrak repository.
- `src/server/audit`: catatan hasil permintaan MCP yang dibatasi ukurannya, tanpa nama/path/isi file.
- `src/app/api/local/activity`: endpoint GET lokal untuk menampilkan log yang tersimpan pada Activity Logs.
- `src/server/setup` + `src/app/api/local/setup`: generator informasi koneksi MCP lokal; Claude Code/Claude Desktop wizard hanya menyajikan perintah/JSON untuk disalin.
- `src/server/onboarding` + `src/app/api/local/onboarding`: status progres first-run dan pemeriksaan OS/dependency/cloudflared binary (tanpa shell execution), disimpan di state directory lokal pengguna.
- `src/features/onboarding/first-run-wizard.tsx`: panduan 4 langkah untuk Windows, macOS dan Linux, dapat dilanjutkan dari Settings.
- `src/server/mcp/stdio.ts`: adapter MCP read-only lokal, 5 tools.
- `src/server/mcp/http.ts`: Streamable HTTP read-only dengan Cloudflare Access JWT (default fail-closed); startup kini dapat membaca konfigurasi dari penyimpanan lokal.
- `src/server/cloudflare` + `src/app/api/local/cloudflare`: menyimpan identifier routing Cloudflare yang sudah divalidasi melalui API localhost, tanpa membuat/mengubah tunnel atau menjalankan shell.
- `src/server/service` + `src/app/api/local/service`: supervisor sementara dalam proses Next.js untuk Start/Stop hanya MCP HTTP milik instalasi ini. Tidak mengendalikan cloudflared atau system service.
- `src/features/connections/remote-service-panel.tsx`: status dan kontrol manual MCP HTTP di AI Connections.
- `src/features/connections/remote-tunnel-setup.tsx`: panduan interaktif Cloudflare Tunnel di AI Connections.
- `src/app/api/local/status`: pemeriksaan terbatas apakah origin remote HTTP merespons dengan 401 (terlindungi), bukan koneksi pengguna.

## Lifecycle & boundaries

- `npm run dev` menjalankan dashboard lokal.
- `npm run mcp:stdio` disiapkan untuk dijalankan **oleh client MCP desktop**, bukan oleh Next.js dan bukan service publik.
- Root policy awal kosong, sehingga AI tidak dapat membaca file sampai pengguna menyetujui folder melalui konfigurasi aman.
- File engine mendefinisikan sepuluh operasi, tetapi MCP alpha **hanya mendaftarkan lima tool baca**.
- Mode write tetap tidak diekspos. Remote HTTP harus dijalankan secara eksplisit setelah Cloudflare Access Managed OAuth dikonfigurasi dan origin JWT validation berhasil diuji; sebelum itu tidak ada listener remote.
- Project lama `~/Projects/local-file-mcp` tetap berdiri sendiri dan tidak berubah.

## Next milestones — novice-first priority (updated 2026-10-28)

The **product acceptance test** is a first-time Windows/macOS user connecting ChatGPT Web or Claude Web, with no tunnel, no MCP installation and no Cloudflare experience. See `docs/NEW-USER-SETUP-ROADMAP.md`. The owner’s existing tunnel cannot count as a new-user success.

1. Validate the updated Web-first onboarding with `npm run audit:all`. New Web MCP is now the default; Existing Tunnel is advanced; desktop guides are hidden under optional legacy settings.
2. Implement beginner-friendly dependency installation and a supported Cloudflare browser-login/provisioning workflow. Require account and Cloudflare-managed domain for stable Web access.
3. Automate fresh tunnel/DNS/Access Managed OAuth setup via approved CLI or narrowly scoped official API integration, with consent and secure credential storage.
4. Verify actual authenticated Claude Web tools on a fresh installation, not solely against a developer’s preexisting tunnel.
5. Complete persistent Windows/macOS service helpers and installer packages. Existing in-process Service Manager remains alpha.

### Historical roadmap superseded

## Next milestones — priority order (reconciled 2026-10-28)

1. **Finish compile gate first:** `npm run typecheck && npm run audit:all`. The standalone foundation TypeScript checker rejected the `cache` property on Node's `RequestInit` in `src/server/service/index.ts`, even though Next.js's main checker passed. This property has been removed; latest host audit is still pending.
2. **Prove live remote connection next (original priority):** Configure a dedicated Cloudflare Access application with Managed OAuth and a protected tunnel route to the new MCP origin; do NOT modify the original MCP V4 or expose dashboard port 3100.
3. **Claude Web live integration test:** authorized sign-in, MCP `initialize`, `tools/list`, and `list_roots` / `read_file` on a non-sensitive approved test folder. A loopback HTTP 401 does NOT prove this works. Document any real OAuth/transport failures before further product features.
4. **Only after live connectivity is demonstrated:** revisit manual Start/Stop QA, implement robust cross-platform service management, launchers and installers for Windows/macOS/Linux.
5. Later: permission-gated write tools, harder filesystem race controls and production packaging.

**Correction:** the preliminary Phase 3A supervisor code was added early, before the live Claude Web test that had already been agreed as the next milestone. That code remains alpha and is not the current development priority.

## Known constraints

- Koneksi Arch Local MCP V2 saat ini tidak bisa menjalankan npm/Node di komputer pengguna. Refactor dan alpha MCP masih memerlukan runtime checks pada Arch Linux.
- Folder `apps/`, `packages/`, `reference-v4/` adalah sisa legacy; file aktif tidak bergantung pada folder tersebut. Tidak dibersihkan otomatis karena operasi direktori tidak tersedia dan menghapusnya sebelum audit build tidak aman.
- `docs/FRONTEND-ROADMAP.md` dan `docs/BACKEND-FOUNDATION.md` berasal dari fase sebelum migrasi. Gunakan dokumen ini sebagai struktur utama terbaru.
