# Local MCP Manager — Concept & PRD MVP v0.2

**Status:** Brainstorming, bukan final implementation spec.
**Tanggal:** 28 Oktober 2026
**Prinsip:** Self-hosted per-user, tanpa VPS, perangkat dan file saling terisolasi.

## 1. Product vision
Aplikasi MCP file manager yang mudah digunakan oleh pengguna nonteknis, mirip pengalaman onboarding Desktop Commander: install -> jalankan dashboard -> pilih root -> atur izin -> pilih AI client -> connect.

Versi pertama: **setiap pengguna menjalankan instalasi independen pada komputernya sendiri.** Tidak ada server cloud multi-tenant ataupun akun cloud yang diwajibkan. Ini berbeda dari shared cloud gateway di PRD lama.

## 2. Arsitektur versi awal

- **Next.js App Router (React)** di localhost: UI dashboard + Route Handlers sebagai Backend-for-Frontend untuk konfigurasi, status proses, health probes, dan activity logs.
- **Node.js / TypeScript Local MCP Agent** terpisah: implementasi MCP transports (stdio untuk client lokal, Streamable HTTP untuk remote), menjalankan operasi file dan otorisasi filesystem.
- **Local config + SQLite opsional** untuk root, tool permissions, audit, konektor; tidak memerlukan PostgreSQL/cloud DB MVP.
- **Process manager/launcher** menghidupkan/mematikan dashboard dan agent bersamaan, dengan command/installer sederhana.
- **Remote access opsional**: HTTPS tunnel ke MCP endpoint dengan otentikasi benar; jangan publikkan dashboard admin.
- Pertahankan akses file dari AI hanya melalui allowlist dan capability-specific authorization.

### Diagram
```
Pengguna -> Browser -> Next.js dashboard (localhost)
                            | Local API / control
                            v
                      Local MCP Agent
                         |  +-- File Engine / allowlist / audit
                         |  +-- MCP stdio -> Claude Desktop / Claude Code
                         +-- Auth + HTTP MCP (localhost) -> HTTPS tunnel -> ChatGPT/Claude Web
```

### Catatan batasan
- Next.js memakai React; bukan dua stack yang harus dipasang independen.
- Next.js Route Handlers bukan pengganti proses MCP long-running secara otomatis.
- Untuk Claude Web dan ChatGPT Web, localhost tidak dapat diakses secara langsung dari cloud. Dibutuhkan tunnel/endpoint HTTPS yang cocok.
- Tanpa VPS, tiap pemilik instalasi harus punya koneksi tunnel pribadi untuk akses remote.
- Cloudflare Tunnel sendiri tidak menggantikan autentikasi klien dan validasi identitas; transport dan OAuth/Access harus diperiksa untuk tiap AI client.

## 3. Draft layout dashboard

- **Overview**: device, status agent, koneksi AI, jumlah roots/tools, last activity, Start/Stop.
- **File Access**: tambah root dengan folder picker; permission read/write/edit/delete per root, safe default read-only.
- **MCP Tools**: 10 existing tools + enabled toggle, description, authorization layer.
- **Connections**: tab Claude Desktop, Claude Code, ChatGPT Web, Claude Web; setup wizard, URL + health/test + revoke.
- **Activity & Security**: paginated logs, allowed/denied errors, lokal-only; export CSV.
- **Settings**: koneksi remote, import/export config tanpa rahasia, update, diagnostics.
- **Onboarding**: Welcome -> Select folders -> Default permissions -> Start agent -> Connect client -> Test.

## 4. User stories / P0 requirements

1. Pemilik dapat menginstal, menjalankan, dan menghentikan app secara manual.
2. App tidak dapat membaca root yang belum disetujui.
3. UI menyediakan picker folder, status, dan toggle yang benar-benar mengubah policy backend.
4. Agent memakai kebijakan default-deny (read-only untuk folder yang baru disetujui).
5. File ops aman terhadap traversal, symlink, overwrites, concurrent edits, batas ukuran.
6. Client desktop dapat terhubung tanpa koneksi cloud melalui MCP stdio.
7. Client web dapat terhubung melalui HTTPS remote dengan autentikasi dan instruksi per client.
8. Tiap instalasi punya secret/identity berbeda; tidak ada secret di repo atau log.
9. User A tidak dapat memakai credentials/user roots milik B.
10. Stop agent membatalkan permintaan baru; sistem tidak otomatis start setelah reboot kecuali user memilih demikian.

## 5. Out of scope MVP

- Cloud multi-tenant gateway / VPS.
- Akun terpusat, shared device routing, database PostgreSQL.
- Sharing file antar pengguna.
- Remote shell arbitrer / command execution.
- Upload konten file ke cloud secara default.
- Marketplace publik / integrasi satu klik tanpa proses instalasi.

## 6. Arsitektur repo yang diusulkan

```
local-mcp-manager/
  apps/
    dashboard/      # Next.js + React
    agent/          # Node.js + TypeScript, MCP SDK
    launcher/       # start, stop, status, doctor
  packages/
    file-engine/
    access-policy/
    shared/
  reference-v4/     # snapshot kode lama; dibaca untuk migrasi
  docs/
```

## 7. Roadmap

- **0. Safe copy**: source snapshot dibuat, project lama tetap aman.
- **1. Local MVP**: agent cross-platform + Next.js UI, file permissions, logs, start/stop.
- **2. Installer**: distribusi untuk Windows dan Linux, guided setup.
- **3. Connectors**: Claude Desktop local, Claude Code; remote ChatGPT/Claude melalui tunnel + auth.
- **4. Beta teman**: isolasi instalasi, review UX, credential revocation, docs.
- **5. Optional hosted gateway**: hanya bila nanti tersedia infrastruktur dan kebutuhan nyata.

## 8. Decisions to settle
- Nama product dan platform pertama (Arch Linux/Windows).
- Apakah dashboard tetap local web tab atau desktop wrapper saat packaging.
- Setup tunnel: user-provided domain/Cloudflare account, atau penyedia relay managed di versi lain.
- Mekanisme delete: konfirmasi UI per request vs recycle bin default.
