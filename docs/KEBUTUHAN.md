# Kebutuhan family-finance-pwa — Tahap 1

Pembaruan arsitektur yang disetujui: hosting/API tetap Cloudflare, database dan gambar privat memakai Neon milik keluarga yang sama. Instalasi kini memerlukan dua akun layanan. Fungsi dan hitungan MVP tetap; rincian di ARCHITECTURE.md.

Status: kebutuhan awal dikonfirmasi dan diperluas melalui jawaban 1A, 2B, 3A, 4A, 5A, 6B. Tambahan yang berlaku: masing-masing punya anggaran, hanya pemilik dapat mengubah, dashboard gabungan, pengeluaran nyata dengan beberapa bukti JPG/PNG opsional, dan kiriman internal tanpa hitung ganda. Rincian di REVISI_KELUARGA.md dan PRD.md.

## Tujuan

PWA keuangan keluarga sederhana untuk suami dan istri, berdasarkan struktur dan rumus Keu.xlsx. Setiap keluarga melakukan self-host di Cloudflare dan Neon sendiri tanpa server pusat.

## Keputusan pengguna

- Nama pos dari Excel tersedia sejak awal. Pengguna dapat menambah, mengubah, atau menghapus pos.
- Pemasukan dan alokasi diisi langsung melalui kolom di PWA.
- Perubahan tersimpan otomatis setelah kolom selesai diisi. Tidak memerlukan tombol Simpan untuk penggunaan normal.
- Tidak ada impor atau unggah Excel dan tidak ada ekspor atau unduh Excel. Keu.xlsx menjadi acuan pengembangan, bukan berkas yang perlu diunggah pengguna saat menggunakan aplikasi.

## Lingkup MVP

1. Ringkasan pemasukan, total alokasi, dan sisa.
2. Tabel anggaran dengan nominal dan persentase berdasarkan rumus workbook yang sudah diverifikasi.
3. Periode bulanan dan penyalinan anggaran bulan sebelumnya.
4. Dua akun dapat melihat data keluarga, tetapi hanya mengubah anggaran, pengeluaran dan bukti milik sendiri.
5. Penyimpanan dan sinkronisasi online antarperangkat.
6. Tampilan yang mengutamakan ponsel dan PWA yang dapat dipasang.
7. Pengeluaran nyata per pos dan bulan, beberapa bukti JPG/PNG opsional yang bisa dilihat, dashboard gabungan serta pencatatan kiriman antar pasangan sebagai transfer internal.

## Keamanan dan open-source

- Autentikasi serta otorisasi di backend; tidak ada pendaftaran publik bebas.
- Validasi input, backup, dan migrasi database.
- Data pribadi dan secret tidak masuk repositori publik. Identitas akun disimpan melalui konfigurasi privat.
- Lisensi MIT, README, konfigurasi contoh, migrasi D1, data dummy, dan panduan deployment Cloudflare gratis sesuai batas layanan yang berlaku.

## Stack yang diminta

React, Vite, TypeScript, Tailwind CSS, shadcn/ui, Cloudflare Workers, Hono, Cloudflare D1, dan Drizzle ORM.

## Batas kerja dan tahap berikutnya

- Tidak menambahkan fitur di luar MVP.
- Tidak mengarang rumus atau menganggap hasil proyek lama sebagai rancangan yang disetujui.
- Tahap 2 hanya memeriksa workbook dan memetakan nama pos, urutan, kolom input, serta perhitungan otomatis. Nama pos dan rumus final mengikuti bukti pemeriksaan itu.
- Rincian alur penyimpanan otomatis, penanganan kegagalan jaringan, dan perubahan bersamaan dibahas pada tahap alur penggunaan; belum diputuskan dalam tahap 1.
- Melanjutkan tahap berikutnya setelah pengguna menyatakan hasil tahap saat ini benar dan meminta lanjut.
