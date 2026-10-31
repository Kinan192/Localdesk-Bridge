# Local MCP Manager

> **Release refactor in progress (2026-10-31).** The older alpha sections below contain historical implementation notes and are not the current installation guide. For a current user flow and release gates see [User Guide](docs/USER-GUIDE-V1.md), [Release PRD](docs/PRD-V1-RELEASE-REFACTOR.md), and [Initial Security Review](docs/SECURITY-REVIEW-2026-10-31.md). The application has connected to ChatGPT Web and Claude Web in the owner's live environment, but clean-install E2E and release QA have not yet passed.
>
> Source-install dashboard flow: `npm install`, `npm run build`, then **`npm start`** (auto-launch local owner session). Open **http://127.0.0.1:3100/setup-center**. This is not a packaged Windows/macOS installer yet. **Remote file writes remain unavailable until security hardening and tests pass.**

Web app pribadi untuk mengatur akses file lokal yang dapat digunakan AI lewat Model Context Protocol (MCP). Dibuat untuk penggunaan sendiri/teman dekat, bukan SaaS atau sistem multi-tenant.

**Lokasi yang benar:** `~/Projects/local-mcp-manager/src/app/` berisi `page.tsx` dan `layout.tsx`. Folder `apps/dashboard/src/app/` merupakan **direktori lama** dan tidak digunakan.

**UI:** Tailwind CSS v4 dengan design tokens pada `src/app/globals.css`. Migrasi dari CSS prototipe lama ke utility classes sedang berlangsung; rincian ada di `docs/TAILWIND-MIGRATION.md`.

**Jika audit gagal:** script audit telah dikoreksi untuk tidak salah menandai alias properti `IconBubble({ icon: Icon })` sebagai import ikon yang hilang. Jalankan `npm install && npm run audit:all` lagi untuk validasi hasil compile.

## Arsitektur sederhana

**Satu project Next.js**, bukan monorepo. React frontend, Next.js API untuk policy, status, audit, dan setup MCP, serta backend TypeScript hidup dalam satu folder `src/`.

```text
local-mcp-manager/
├── src/
│   ├── app/              # Next.js halaman dan API
│   ├── components/       # Reusable UI
│   ├── features/         # 6 fitur dashboard
│   ├── context/          # State frontend demo
│   ├── config/           # Navigasi
│   ├── lib/              # Mock data + utility
│   ├── styles/           # Stylesheet modular
│   └── server/
│       ├── contracts/   # Schema Zod, types
│       ├── access/      # Policy dan izin
│       ├── files/       # File engine
│       ├── storage/     # Policy repository lokal
│       ├── audit/       # MCP activity logs
│       ├── setup/       # Config wizard paths
│       ├── onboarding/  # First-run state + OS checks
│       ├── cloudflare/  # Validated Cloudflare settings
│       ├── service/     # MCP HTTP process manager (alpha)
│       └── mcp/         # MCP stdio (read-only alpha)
├── public/
├── tests/foundation/
├── scripts/
├── docs/
├── package.json
├── next.config.ts
└── tsconfig.json
```

## Product priority: new users with no tunnel or development tools

**The primary user is a first-time Windows/macOS user who wants ChatGPT Web or Claude Web to read approved local files, without having an existing Cloudflare Tunnel.** The project owner's tunnel is not the onboarding acceptance test.

First-run now prioritizes **New Web MCP (recommended)** for ChatGPT Web / Claude Web, with **Existing Tunnel (advanced)** as a second option. Claude Desktop/Claude Code guides are relegated to an advanced legacy section. The Web option still requires manual external Cloudflare work; provisioning and OS installers are not implemented yet. Do not claim zero-touch onboarding is complete.

The new-user Web MCP wizard now includes a **Cloudflare setup preview for users who already own a domain**: enter the Cloudflare-managed domain, suggested MCP subdomain, and Access-allowed email. The preview validates these values and shows the future permissions and steps without contacting Cloudflare, storing API tokens, or changing DNS. `POST /api/local/cloudflare/preview` is a read-only planning action despite using guarded POST.

**Read-only Cloudflare preflight:** on a setup preview, the same one-time token validation also checks the **actual active Cloudflare zone** and looks for existing exact DNS records at the proposed hostname. This is a non-mutating candidate/collision check via `POST /api/local/cloudflare/preflight`; it does not verify Access or authorize publishing. Results are cleared if the proposed domain/subdomain/email changes. Latest host audit before P1C: 38 foundation tests, 3 MCP smoke tests, and production build passed. Owner-pairing changes require a new audit.

**Next milestone:** after owner pairing is verified, add a trusted native launcher and OS-protected secret storage, then Local MCP Manager can safely begin dedicated remotely-managed tunnel, Access Managed OAuth and DNS provisioning with explicit approval. No VPS required; no public endpoint before a restricted Access policy is ready. Never claim a preview/preflight has provisioned anything.

**P1C owner pairing (developer alpha):** before sending a Cloudflare API token to the read-only verify/preflight API, pair your local browser using `npm run owner:pair` and open the single-use URL. The ticket is transported in a URL fragment, redeemed for an HttpOnly SameSite=Strict signed cookie; the API token is not persisted. This is a **temporary developer step**, not an end-user requirement: the future packaged launcher must launch and pair the browser automatically. All mutation handlers for local policy, MCP service, saved Cloudflare configuration and onboarding now use owner-session guards; Cloudflare verification/preflight also requires an owner session. Owner pairing does not currently unlock Cloudflare provisioning writes. See `docs/OWNER-PAIRING.md`.

Current implementation priorities and acceptance criteria: `docs/NEW-USER-SETUP-ROADMAP.md`.

## First-Run Setup Assistant (Windows, macOS, Linux)

Saat instalasi pertama tanpa state onboarding, dashboard otomatis membuka wizard 4 tahap: **System Check → File Permissions → Web MCP Setup → Connect & Verify**. Pilihan **New Web MCP** terisi sebagai default; **Existing Tunnel** adalah opsi advanced. Progres disimpan di file `onboarding.json` dalam state directory pengguna, bukan di browser atau GitHub. Wizard tidak menjalankan shell, membuat tunnel, atau mengaktifkan service secara otomatis.

Wizard bisa dibuka kembali dari **Overview → Setup Assistant** maupun **Settings → Setup & Connections**. Panduan sistem operasi berbeda untuk Windows, macOS, dan Linux, sementara backend dan dashboard tetap satu project. Dokumentasi: `docs/FIRST-RUN-ONBOARDING.md`.

Ini masih **developer installation** (Node.js + npm diperlukan), belum aplikasi .exe/.dmg dengan runtime bawaan.

## Menjalankan dashboard (Windows, macOS, Linux)

**Versi source/developer:** pasang Node.js versi yang didukung Next.js 16, lalu clone repository melalui Git atau unduh ZIP project. Belum ada installer `.exe` atau `.dmg` satu klik; itu merupakan tahap berikutnya.

Buka terminal **PowerShell** (Windows) atau **Terminal** (macOS/Linux) di folder hasil clone, kemudian jalankan:

```bash
npm install
npm run dev
```

Buka `http://127.0.0.1:3100` di browser komputer tersebut. Pada pemakaian pertama, **Setup Assistant** terbuka otomatis untuk memandu System Check, File Access, Cloudflare dan koneksi AI. Pengguna dapat memilih New Tunnel atau Existing Tunnel, lalu melanjutkan setup dari **Settings → Setup & Connections**.

**Penting:** dashboard ini hanya untuk komputer lokal. Jangan melakukan port-forward atau mengarahkan Cloudflare Tunnel ke port 3100; akses AI web nantinya memakai listener MCP terpisah di `127.0.0.1:8401` setelah autentikasi Cloudflare Access disiapkan.

Untuk pengembangan di komputer pemilik project, direktori awal mungkin `~/Projects/local-mcp-manager`, tetapi pengguna lain dapat menyimpan clone di folder mana saja.

**Dashboard read-only alpha**: File Access dan MCP Tools sudah memanggil API lokal `/api/local/policy`, yang menyimpan izin ke `policy.json`. Perubahan berlaku ketika klien berikutnya menjalankan proses MCP stdio. Remote HTTP dapat dijalankan atau dihentikan dari AI Connections melalui supervisor sementara, setelah konfigurasi Cloudflare Access diisi. Status AI web client dan Cloudflare Tunnel belum diverifikasi; grafik masih contoh, sedangkan Activity Logs membaca audit nyata. Supervisor tidak persisten antar restart Next.js/OS.

## MCP HTTP Service Manager (Phase 3A)

Halaman **AI Connections → Remote MCP Service** sekarang memiliki tombol **Start MCP HTTP**, **Stop**, **Refresh**, dan shortcut ke pengaturan Cloudflare. Proses yang dimulai hanya `src/server/mcp/http.ts` di project ini; tidak ada shell executor, instalasi system service, atau kontrol tunnel lama. Aksi lewat endpoint localhost `/api/local/service` dengan pemeriksaan Host/Origin/CSRF.

Ini masih pengelola proses *in-memory*, **bukan** Windows Service / macOS launchd / Linux systemd dan **bukan** pemeriksaan autentikasi OAuth eksternal. Saat ini dashboard harus tetap berjalan. Rincian, batasan keamanan dan QA: `docs/SERVICE-MANAGER.md`.

## Real MCP Activity Logs (Phase 3A)

Lima read-only MCP tools sekarang menulis aktivitas minimal (tool, root ID, waktu dan hasil) ke konfigurasi lokal. UI Activity Logs menampilkan log tersebut lewat `GET /api/local/activity`, bukan contoh. Data file, nama file, dan isi prompt tidak dicatat. Log dibatasi 1 MiB; lihat `docs/ACTIVITY-LOGS.md`.

Setelah perubahan Service Manager terbaru, jalankan `npm run audit:all` untuk validasi TypeScript, tests, dan build.

## Advanced/legacy Claude Desktop / Claude Code wizard

Buka **AI Connections → Advanced / legacy local client guides → Claude Desktop / Claude Code** untuk mendapatkan konfigurasi yang sesuai dengan absolute path instalasi ini. Pengguna menyalin JSON ke konfigurasi Desktop (gabungkan, jangan timpa entri lama) atau menjalankan perintah `claude mcp add` untuk Claude Code.

Wizard tidak mengubah pengaturan Claude, tidak membuka port, dan tetap read-only. Detail: `docs/CLAUDE-SETUP-WIZARD.md`.

## P1D-B Credential Vault (developer alpha)

**Security test status (2026-10-29):** Native OS keyring and owner-authorized credential APIs pass a full audit (94 source files, 58/58 foundation tests, 3 MCP smoke tests, Next.js production build). Only the native keyring smoke test used disposable synthetic values.

A standalone first-version credential interface has been created at **`http://127.0.0.1:3100/credential-vault`**. Open it manually in the same browser/profile where `/api/local/owner` reports `paired: true`. It verifies a Cloudflare token read-only, lets the user select the verified Cloudflare account, and requires explicit consent before saving/rotating that token into the native OS keychain. Revocation removes only the local credential and does **not** revoke the token at Cloudflare.

The UI is a new `src/app/credential-vault/page.js` page because the currently connected Arch MCP file tool does not permit reading/writing `.tsx` files; it has not yet been integrated into the AI Connections nav. Its new unit/static tests and browser workflow **require a fresh audit** before production use. No public tunnel, Cloudflare provisioning, or OS-level installer is enabled.

## Cloudflare Setup automation (developer alpha)

Cloudflare Setup is accessible at `http://127.0.0.1:3100/cloudflare-setup` from the Credential Vault page. **New source has NOT yet passed a host audit.** It implements two user-approved steps: first create and verify a restricted Access application with Managed OAuth; then recheck protection and hostname before creating a dedicated remotely managed tunnel and DNS CNAME. A stored Cloudflare API token is loaded only on the server from OS Keychain. The local dashboard at port 3100 is never routed through this tunnel.

Cloudflare setup now uses **user-driven dashboard approvals**, not a developer environment flag. With an owner-paired browser and token in OS Keychain, run **Cek kesiapan (read-only)** first; when it passes, explicitly approve Stage 1 Access + Managed OAuth creation for the exact hostname. Separate Stage 2 Tunnel/DNS approval is available only after verified Access. Unpaired requests, invalid input and missing permissions fail closed. New code requires a fresh host audit and no live Cloudflare writes have been executed during code development. See `docs/CLOUDFLARE-AUTO-SETUP.md`; cloudflared connector startup, ChatGPT/Claude Web connection and installers remain later tasks.

## Test dan build

```bash
npm run audit:all
```

Mencakup static imports, TypeScript foundation, unit tests policy/file, smoke test subprocess MCP stdio, TypeScript Next.js, dan production build. Jalankan pada terminal Windows, macOS, atau Linux di project lokal. Arch Local MCP yang digunakan untuk pengembangan hanya menyediakan operasi file.

## Remote MCP Web (Cloudflare Tunnel + Access)

Untuk ChatGPT Web / Claude Web, source `src/server/mcp/http.ts` menyediakan endpoint **MCP Streamable HTTP** pada port **8401**, terpisah dari dashboard Next.js port 3100. Keamanan: Cloudflare Tunnel + Access Managed OAuth, dan verifikasi JWT di origin. Server **tidak berjalan tanpa konfigurasi** team domain, Access AUD, dan hostname publik; hanya lima read-only tools.

Buka dashboard → **AI Connections** → **ChatGPT Web** / **Claude Web** → **Configure tunnel**, atau ikuti instruksi langkah demi langkah di `docs/CLOUDFLARE-TUNNEL.md`. Tidak ada token tunnel/cloudflare yang disimpan oleh wizard.

Cloudflare Configuration Manager sekarang menyimpan hostname, Access team domain, dan AUD melalui dashboard ke file lokal pengguna (`cloudflare.json`), lalu `npm run mcp:http` membaca pengaturan itu tanpa perlu mengulang environment variables. Pengaturan tidak membuat tunnel atau login OAuth otomatis. Lihat `docs/CLOUDFLARE-CONFIG-MANAGER.md`. **Jangan pernah mengarahkan tunnel ke port 3100**. Jalankan `npm run audit:all` setelah perubahan Phase 2 ini sebelum mencoba MCP HTTP.

## Cloudflare Tunnel Start / Stop (dashboard alpha)

Halaman baru **`http://127.0.0.1:3100/tunnel-control`** tersedia dari Cloudflare Setup dan Cloudflare Config. Dengan Cloudflare Setup yang sudah memiliki dedicated Tunnel ID, konfigurasi hostname/AUD/port 8401 yang cocok, dan Remote MCP HTTP sudah berjalan, pengguna dapat klik **Start Tunnel**. Server mengakses Cloudflare Tunnel token dari API resmi menggunakan User API Token yang sudah ada di OS Keychain; token tidak pernah masuk ke browser, file konfigurasi, atau argumen CLI. `cloudflared` dijalankan hanya sebagai proses lokal terkelola, bukan systemd atau auto-boot. **Stop Tunnel** hanya menghentikan child milik dashboard. Jika sebelumnya Tunnel baru sudah berjalan manual di terminal, hentikan dengan Ctrl+C terlebih dahulu agar tidak menambah replica.

**Status:** perubahan ini menambah tests dan perlu audit host `npm run audit:all` sebelum real-case test. Rujukan: `docs/TUNNEL-CONTROL-ALPHA.md`. Existing Tunnel `arch-local-mcp` tidak disentuh. Dashboard port 3100 tidak pernah diekspos.

## Local MCP alpha (read-only)

Server MCP menggunakan official TypeScript SDK v2 lewat stdio. Tidak membuka port dan tidak mengaktifkan akses remote.

```bash
npm run mcp:stdio
```

Perintah berjalan menunggu MCP client melalui stdin; bukan UI. Untuk pengujian gunakan MCP Inspector / klien desktop, setelah dependency terpasang.

Semua roots pada awalnya **kosong** dan hanya dapat diisi melalui policy milik instalasi pengguna. AI Connections kini menyediakan wizard menyalin konfigurasi MCP lokal untuk Claude Desktop/Claude Code. Koneksi tidak otomatis terpasang dan belum dipantau. Hanya 5 operasi read-only yang didaftarkan pada stdio alpha. Operasi write belum diekspos karena perlu izin, approval dan hardening filesystem.

## Keamanan dan kompatibilitas

- Project aktif lama `~/Projects/local-file-mcp/` **tidak diubah**.
- Dashboard dibatasi ke localhost.
- Tidak memerlukan VPS, PostgreSQL, atau akun cloud.
- Remote ChatGPT/Claude Web belum aktif. Koneksi tersebut nanti memerlukan HTTPS serta otorisasi.
- Tidak ada shell/command execution oleh AI.
- Eksekusi build dan unit tests perlu dilakukan di komputer pengguna: konektor Arch Local hanya mengizinkan operasi file, tidak menjalankan terminal.

## Direktori lama / backup

Sisa `apps/`, `packages/`, dan `reference-v4/` adalah **legacy backup, tidak dipakai dalam build baru**. Migrasi file source aktif sudah dilakukan, tetapi Arch Local MCP tidak memiliki fungsi penghapusan folder dan tidak bisa memindahkan direktori sekaligus. Jangan jalankan project dari `apps/dashboard/` lagi. Setelah build root lulus, backup dapat dipindahkan/dibersihkan terpisah.

Dokumentasi utama: `docs/ARCHITECTURE.md`, `docs/FRONTEND-ARCHITECTURE.md`, dan `docs/BACKEND-FOUNDATION.md`.



