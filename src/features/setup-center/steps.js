// Setup stays in one navigation flow; detailed forms remain separate while being refactored.
export const setupSteps = [
  { id: "system", title: "Pemeriksaan sistem", description: "Periksa Node.js, dependency aplikasi, dan binary Cloudflared sebelum membuat konfigurasi.", href: null, label: null,
    guide: "Pemeriksaan ini hanya membaca kondisi komputer, tanpa memasang aplikasi atau mengubah layanan. Jika dependency belum lengkap, jalankan npm install di folder project. Jika Cloudflared tidak ditemukan, instal cloudflared dari sumber resmi dan periksa PATH. Gunakan Perbarui status setelah memperbaiki prasyarat." },
  { id: "folders", title: "Folder & permissions", description: "Pilih direktori secara eksplisit; default tetap read-only.", href: null, label: null,
    guide: "Kelola izin langsung di panel ini: isi nama dan path absolut folder nyata, tambahkan sebagai Read Only, lalu aktifkan/nonaktifkan atau cabut izin jika diperlukan. Jangan membagikan seluruh home, folder tersembunyi, atau direktori yang menyimpan kredensial. Semua perubahan memerlukan sesi owner." },
  { id: "credentials", title: "Cloudflare credential", description: "Simpan token terbatas melalui OS Keychain.", href: "/credential-vault", label: "Atur token",
    guide: "Gunakan Cloudflare User API Token dengan scope minimum sesuai operasi. Verifikasi token di browser lokal, pilih akun serta zone yang benar, dan setujui penyimpanan di OS Keychain. Token tidak boleh disalin ke source atau file konfigurasi." },
  { id: "cloudflare", title: "Access & Tunnel", description: "Proteksi hostname dengan Access sebelum memublikasikan DNS.", href: "/cloudflare-setup", label: "Atur Cloudflare",
    guide: "Masukkan domain aktif dan email yang boleh login. Jalankan preflight terlebih dahulu, lalu setujui pembuatan Access dengan Managed OAuth. Setelah verifikasi Access berhasil, barulah setujui pembuatan dedicated Tunnel serta CNAME. Jangan mengulang Publish ketika lock pemeriksaan aktif." },
  { id: "mcp", title: "MCP settings", description: "Impor hostname, team domain, dan Access audience.", href: "/cloudflare-config", label: "Impor konfigurasi",
    guide: "Periksa hostname publik, Access AUD, dan team domain dari deployment yang telah disimpan. Listener lokal hanya pada 127.0.0.1:8401; port dashboard 3100 tidak pernah dijadikan ingress Tunnel." },
  { id: "oauth", title: "OAuth callbacks", description: "Kelola ChatGPT dan Claude tanpa membuat Access baru.", href: "/oauth-settings", label: "Kelola callback",
    guide: "Muat callback terbaru dari Cloudflare sebelum mengedit. Tambahkan URL callback resmi tiap klien, pertahankan URL lama yang masih digunakan, lalu klik Simpan & Verifikasi. Satu hostname MCP bisa digunakan kedua klien." },
  { id: "services", title: "MCP & Tunnel services", description: "Jalankan kedua proses lokal sebelum mencoba koneksi.", href: "/tunnel-control", label: "Detail Tunnel",
    guide: "Start Remote MCP lebih dahulu, kemudian start Tunnel. Jika Tunnel telah dijalankan secara manual, hindari memulai salinan proses kedua. Status proses lokal belum membuktikan autentikasi AI berhasil." },
  { id: "clients", title: "ChatGPT & Claude", description: "Selesaikan OAuth dan verifikasi tools pada setiap klien.", href: null, label: null,
    guide: "Pada ChatGPT tambahkan custom MCP menggunakan URL HTTPS yang ditampilkan. Pada Claude buka Customize → Connectors → Add custom connector, gunakan Sign in now, Register automatically (DCR), dan Streamable HTTP. Login ke Cloudflare Access dan jalankan list_roots dari masing-masing klien." },
];
