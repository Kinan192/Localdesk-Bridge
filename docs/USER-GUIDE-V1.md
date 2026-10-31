# Panduan Instalasi dan Koneksi — Local MCP Manager

**Status:** panduan pengguna untuk source-install kandidat v1.0; fitur satu-perintah perlu uji host. Ini BUKAN klaim bahwa installer Windows/macOS sudah dirilis.

## 1. Prasyarat

- Komputer Windows, macOS, atau Linux dengan Node.js versi yang didukung Next.js 16 dan npm.
- Akses internet untuk memasang dependency serta menghubungkan ChatGPT/Claude Web.
- Akun Cloudflare, domain yang sudah menjadi zone **Active** di Cloudflare, dan metode login Cloudflare Zero Trust Access.
- Program `cloudflared` resmi (untuk koneksi Tunnel) terpasang pada komputer yang menjalankan MCP.
- Jangan port-forward dashboard, jangan buka port dashboard 3100 ke internet, dan jangan menyimpan token dalam repository.

**Penting:** pengguna hanya memilih folder yang ingin dibagikan. Folder lain, home secara keseluruhan, dan direktori tersembunyi tidak otomatis diberikan kepada AI.

## 2. Instalasi pertama dari kode sumber

```bash
git clone <URL_REPOSITORY_RESMI>
cd local-mcp-manager
npm install
npm run build
npm start
```

Alamat default dashboard adalah `http://127.0.0.1:3100`. `npm start` menggunakan launcher terpercaya untuk menjalankan Next.js, membuat **tiket autentikasi pemilik sementara**, lalu membuka browser lokal. Jika browser tidak terbuka, klik tautan localhost privat yang ditampilkan terminal dalam dua menit. Jangan membagikan tautan pairing itu. Sesi browser dapat berakhir setelah delapan jam, dan startup baru akan menyiapkan tiket baru. Tidak perlu menjalankan `owner:pair` secara terpisah.

**Auto-start setelah pairing:** pada mode produksi `npm start`, jika deployment Cloudflare dan akses Keychain sudah dikonfigurasi dengan benar, aplikasi otomatis mencoba menghidupkan **Remote MCP HTTP** terlebih dahulu, lalu **Tunnel** setelah pairing pemilik berhasil. Ini tidak membuat Access/Tunnel/DNS baru dan tidak menjamin login klien sudah sukses. Status kegagalan dapat dilihat di dashboard; tombol Start tetap tersedia sebagai tindakan pemulihan. Untuk mematikan auto-start, jalankan `npm run start:manual` (contohnya jika ada replica cloudflared independen). `npm run dashboard:dev` tetap manual.

**Developer only:** `npm run dashboard:dev` menjalankan launcher yang sama dengan Next.js development mode. `npm run dev` tanpa launcher tetap tersedia untuk debugging dan mungkin mengharuskan pairing manual; bukan alur pengguna umum.

Jika `npm start` menolak karena build belum ada, jalankan `npm run build` lebih dahulu. Jika port 3100 sedang digunakan, hentikan instance lama sebelum memulai instance baru.

**Siklus hidup proses:** bila MCP HTTP dan Cloudflare Tunnel dijalankan melalui tombol Start di dashboard, keduanya adalah proses yang dikelola dashboard dan ikut berhenti ketika `npm start` ditutup dengan `Ctrl+C`. Ini disengaja untuk mode start/stop manual dan bukan berarti resource Tunnel/Access di Cloudflare dihapus. Proses `cloudflared` yang dijalankan **secara independen** di terminal atau service lain tidak boleh dihentikan oleh dashboard. Untuk koneksi remote tetap online, dashboard dan layanan yang dikelolanya perlu tetap berjalan, atau gunakan instance independen yang dikonfigurasi terpisah.

### Uji perintah global `localdesk` untuk pengembang (sementara)

Fitur CLI awal sudah dibuat, tetapi **belum dipublikasikan ke npm**. Setelah instalasi source dan `npm run build`, hubungkan executable dari direktori project:

```bash
cd ~/Projects/local-mcp-manager
chmod +x bin/localdesk.mjs
mkdir -p "$HOME/.local"
npm_config_prefix="$HOME/.local" npm link
export PATH="$HOME/.local/bin:$PATH"
cd ~
localdesk --help
localdesk --version
localdesk
```

Sekarang `localdesk` menggunakan launcher yang sama dengan `npm start`, termasuk pairing dan auto-start layanan bila konfigurasinya siap. `localdesk --manual-services` menonaktifkan auto-start. Jika dashboard sudah aktif, perintah ini menolak startup kedua karena port 3100 terpakai, tanpa menghentikan proses yang lain. Tombol/menu Terminal UI ala 9Router belum dibuat; targetnya milestone M4. Jika muncul `EACCES` ke `/usr/lib/node_modules` di Arch Linux, jangan gunakan `sudo npm link`: pakai prefix pengguna seperti pada perintah di atas. Untuk melepas link pengembangan, gunakan `npm_config_prefix="$HOME/.local" npm unlink -g local-mcp-manager`. Jika membuka terminal baru dan `localdesk` tidak ditemukan, tambahkan `$HOME/.local/bin` ke `PATH` shell secara permanen.

**Belum tersedia untuk pengguna umum:** `npm install -g localdesk` dari registry npm tanpa clone. Nama paket, build output, dependency produksi (termasuk runtime tsx dan Keychain native), izin executable, dan QA Windows/macOS/Linux harus divalidasi sebelum publikasi di M6.

## 3. Pusat penyiapan

Langkah pertama memeriksa Node.js, dependency aplikasi dan keberadaan binary cloudflared (pemeriksaan lokal saja). Tahap berikutnya memilih folder yang akan disetujui, lalu credential Cloudflare, deployment Access & Tunnel, MCP settings, OAuth callbacks, layanan, dan koneksi kedua AI client. Indikator konfigurasi tidak berarti koneksi client telah diuji.

Buka `http://127.0.0.1:3100/setup-center`. Tahap **Pemeriksaan sistem** kini menampilkan status platform, Node.js, dependency dan binary cloudflared serta tombol periksa ulang tanpa mengubah perangkat. Tahap **Folder & permissions** memungkinkan tambah, aktif/nonaktif, dan cabut akses **Read Only** langsung dari wizard. Tahap **Cloudflare Credential** kini memungkinkan verifikasi token, pemilihan akun, penyimpanan, rotasi, atau penghapusan token lokal OS Keychain langsung di wizard. Tahap **Access & Tunnel** sekarang juga berjalan langsung di wizard dengan pemeriksaan read-only, review status, dan persetujuan terpisah untuk tiap operasi yang dapat mengubah Cloudflare. Halaman konfigurasi lama tetap tersedia sebagai kompatibilitas hingga seluruh M2 selesai. Halaman MCP Config dan OAuth masih dalam migrasi.

1. **File Access:** pada langkah Folder & permissions di Setup Center, masukkan nama dan path absolut direktori nyata, lalu pilih **Berikan akses baca**. Gunakan **Nonaktifkan/Aktifkan** atau **Cabut izin** jika diperlukan; cabut izin tidak menghapus file di disk. Seluruh home, root disk, folder tersembunyi, symlink, dan path saling bertumpuk ditolak server. Write belum tersedia sampai keamanan filesystem dinyatakan aman.
2. **Credential Vault:** pada langkah Cloudflare Credential dalam Setup Center, masukkan scoped User API Token hanya bila diperlukan, verifikasi zona aktif dan pilih akun, lalu setujui penyimpanan di OS Keychain. Token tidak pernah ditampilkan kembali atau disimpan di browser. Jika token sudah tersimpan, hindari mengganti/mencabutnya tanpa kebutuhan. Indikator status Keychain bergantung pada draft Account ID yang tersedia; tanpa draft, status belum dapat dipastikan. Jangan gunakan Global API Key.
3. **Cloudflare Setup:** pada langkah Access & Tunnel di wizard, isi account/domain/subdomain, email yang diizinkan serta callback OAuth resmi. Jalankan cek kesiapan read-only dan periksa hasil hostname, zone, DNS, Access, dan callback. Pembuatan Access + Managed OAuth membutuhkan persetujuan eksplisit tersendiri; publish Tunnel/DNS memerlukan inspeksi dan persetujuan baru. Jika resource Cloudflare sudah dibuat, cek status read-only; jangan mengulang deployment atau menghapus lock manual. Tidak ada perubahan Cloudflare hanya karena membuka wizard.
4. **Remote MCP Configuration:** impor hostname, team domain dan audience dari deployment Cloudflare yang tersimpan.
5. **OAuth Redirect URLs:** tambahkan callback ChatGPT/Claude ke existing Access app. Jangan menghapus URL klien yang masih dipakai.
6. **Layanan:** Start Remote MCP (hanya 127.0.0.1:8401), lalu Start dedicated Tunnel. Jika proses cloudflared dijalankan sendiri, hindari membuat replica yang tak perlu. Dashboard 3100 tidak boleh menjadi ingress Tunnel.
7. **Clients:** hubungkan ChatGPT Web/Claude Web menggunakan URL MCP HTTPS yang sama. Lakukan login via Cloudflare Access menggunakan email yang diizinkan.
8. **Verify:** di setiap klien minta `list_roots`, lalu uji `list_files` dan `read_file` pada file uji dalam folder yang sudah disetujui.

## 4. Cloudflare API Token: izin yang dibutuhkan

Token sebaiknya dibatasi hanya pada akun dan zone milik pengguna:

- Account — Access: Apps and Policies Read/Edit.
- Account — Cloudflare Tunnel / Cloudflare One Connector Read/Edit.
- Zone — Zone Read.
- Zone — DNS Read/Edit.

Dashboard dapat memakai token baca terbatas hanya untuk discovery, tetapi setup yang melakukan pembuatan Access/Tunnel/DNS membutuhkan Write/Edit sesuai fitur. Token disimpan lewat Credential Vault OS Keychain, bukan pada file .env, browser storage, repo, atau URL.

## 5. Callback OAuth dan konektor AI

Simpan callback **tepat seperti yang ditampilkan klien** atau yang didokumentasikan secara resmi. Saat ini Claude menggunakan `https://claude.ai/api/mcp/auth_callback`, dan dukungan domain tambahan dapat diperiksa pada dokumentasi Anthropic saat setup. ChatGPT dapat menghasilkan callback per-koneksi, sehingga jangan mengarang ID callback.

Untuk ChatGPT Web: buat custom MCP connector menggunakan `https://<subdomain.domain>/mcp`, pilih OAuth/DCR sesuai metadata yang ditemukan, login melalui Access, uji `list_roots`.

Untuk Claude Web: Customize → Connectors → Add custom connector → Name + MCP Server URL; pilih **Sign in now**, **Register automatically (DCR)**, **Streamable HTTP**; simpan lalu login Access. Menu **Plugins → Create a plugin** digunakan untuk skill dan BUKAN tempat membuat koneksi MCP.

**Jangan menilai connected hanya dari HTTP 401 anonim, DNS/Tunnel healthy, atau login.** Status final membutuhkan pemanggilan tool MCP yang benar-benar berhasil dari klien yang dipilih.

## 6. Error umum

| Gejala | Penyebab yang perlu diperiksa | Tindakan aman |
|---|---|---|
| Dashboard meminta autentikasi pemilik | Tiket belum ditukarkan atau sesi kadaluarsa | Jalankan ulang launcher dari akun OS lokal dan gunakan tautan baru |
| Cloudflare token ditolak | Token tidak aktif, tidak cukup scope, atau salah akun | Verifikasi/rotasi token; jangan mengurangi Access policy |
| Access terdeteksi, tetapi Tunnel belum healthy | Connector `cloudflared` belum berjalan atau token Tunnel bermasalah | Periksa listener dan status connector secara terpisah |
| 401 pada GET MCP tanpa token | Access melindungi endpoint | Ini normal; lanjut uji OAuth melalui ChatGPT/Claude |
| OAuth DCR gagal | Redirect URI tidak diizinkan atau registrasi klien gagal | Muat ulang callback di OAuth Settings dan periksa respons registrasi |
| MCP tools kosong | Folder belum ditambahkan atau tools tidak enabled | Periksa File Access dan izin tool |
| Write tidak bisa dipilih | Fitur remote write belum lolos security hardening | Tetap read-only, jangan memaksa mengaktifkan lewat API |

## 7. Audit sebelum penerbitan

Jalankan di komputer pengembang:

```bash
npm run audit:all
npm audit --omit=dev --audit-level=high
npm ls next react react-dom
```

Tambahkan lint dan browser end-to-end test sebelum menandai rilis final. Uji instalan kosong menggunakan state directory **khusus tes**, jangan menghapus state atau token user yang sedang berfungsi.

## Referensi resmi

- Cloudflare Managed OAuth: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- Anthropic Remote MCP connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- OpenAI MCP: https://platform.openai.com/docs/mcp
- Next.js security: https://nextjs.org/blog/nextjs-security-update-october-14-2026
