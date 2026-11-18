# Financée

PWA keuangan keluarga dengan satu buku untuk dua akun. Isi pemasukan dan alokasi langsung, lihat sisa yang belum dibagi, dan simpan bukti JPG/PNG. Tidak perlu mengunggah Excel.

**Rilis 18 November 2026:** buku keluarga, bukti kolektif mandiri dan pelacakan opsional sudah diimplementasikan; 80 tes lulus. Sudah ditayangkan dan diperiksa online di https://financees.pages.dev. Keputusan terbaru di [rancangan buku keluarga](docs/FAMILY_BOOK_PROPOSAL.md) menggantikan alur kiriman dan dua anggaran versi sebelumnya.

Setiap keluarga memasang salinan sendiri pada Cloudflare Pages + Functions dan Neon miliknya. Tidak ada server akun pusat, pendaftaran publik, koneksi bank atau pelaksanaan transfer uang. Kode berlisensi [MIT](LICENSE).

## Pemakaian

1. Masuk, pilih atau buat bulan. Beranda menampilkan satu daftar alokasi keluarga.
2. Buka **Pemasukan** untuk mengisi sumber dana. Isi nominal alokasi setelah uang dibayar atau dibagi. Angka memakai pemisah ribuan; pindah kolom atau tekan Enter untuk menyimpan.
3. **Bukti bersama** menghubungkan satu foto dengan beberapa pos. Foto tidak mengubah nominal atau membuat uang masuk ke pasangan.
4. Pos biasa selesai setelah nominal diisi. Jika perlu rincian, buka pos → **Pengaturan pos → Lacak pemakaian**. Kedua akun boleh menambahkan pemakaian, tetapi hanya pembuat catatan yang mengubah atau menghapusnya.
5. Pemakaian mengurangi jatah pos dan tidak menambah total pembagian. Pemakaian tidak boleh melebihi alokasi; penambahan alokasi harus didukung dana tersedia.
6. **Lihat grafik** menampilkan donut pembagian dan batang pemasukan/pembagian. Ringkasan tahun memakai jumlah nominal dari bulan lengkap, bukan rata-rata persentase bulanan.
7. **Bukti** menampilkan gambar bulan itu satu kali. Bukti pemasukan, alokasi dan pemakaian juga tersedia dari rinciannya. Maksimal 10 gambar per sumber, 5 MiB per gambar; gambar rusak atau berdimensi berlebihan ditolak.
8. Salin bulan membawa seluruh struktur keluarga dan pengaturan pelacakan. Pembuat/hak edit tetap; nominal, tanggal, pemakaian, kelompok bukti dan gambar kosong.

Kedua akun membaca buku yang sama. Hanya pembuat pos/catatan/bukti yang mengubahnya. Akun lain boleh mencatat pemakaian pada pos yang dilacak tanpa membuat anggaran sendiri. Tidak ada pilihan Disisihkan atau dompet masuk pasangan dalam alur rutin.

Sisa belum dibagi = seluruh pemasukan dikurangi seluruh alokasi aktual, termasuk tabungan. Ini catatan pembagian, bukan saldo rekening. Nilai kosong berbeda dari 0. Catatan lama perlu ditinjau; tidak dikonversi otomatis.

Sinkronisasi diperiksa setiap 10 detik ketika tab terlihat dan online. Saat offline, penyimpanan ditahan; cache PWA hanya berisi antarmuka. Draf berada di memori dan dapat hilang ketika aplikasi ditutup. Pesan gagal/konflik harus diselesaikan sebelum berpindah bulan atau keluar.

## Menjalankan

Prasyarat Node.js 24+, npm, akun Cloudflare dan Neon sendiri. Buat cabang development dan bucket evidence Private; ambil koneksinya menggunakan CLI Neon ke `.env.neon-dev`, lalu tambahkan `EVIDENCE_BUCKET=evidence`. [Panduan lengkap](docs/DEPLOYMENT.md).

```powershell
npm ci
npm run setup:local -- --from .env.neon-dev
npm run build
npm run dev
```

Buka http://127.0.0.1:5173/. Identitas dan sandi dua akun lokal ada di `.initial-credentials.txt`; simpan pada pengelola sandi dan jangan unggah ke GitHub. Akun lokal memakai alias suami@example.invalid dan istri@example.invalid. Aplikasi tidak mengirim email.

Backend berjalan lokal, tetapi data/gambar memakai cabang Neon online sehingga memerlukan internet. `setup:local` menolak production dan tidak menimpa `.dev.vars` yang ada. Untuk memeriksa build PWA, hentikan dev lalu jalankan `npm run build` dan `npm run preview`. Perintah ini tidak merilis ke Cloudflare.

## Pengembangan dan pengujian

```powershell
npm run test:unit
npm run check
npm run build
npm run format:check
npm run check:public
```

Tes integrasi `npm test` memerlukan dua cabang dummy khusus dan `FINANCEE_TEST=1`; tes mengosongkan cabang tersebut. Ikuti [panduan deployment](docs/DEPLOYMENT.md) dan [hasil pengujian](docs/TESTING.md). Jangan menjalankannya pada database keluarga.

Stack: React, Vite, TypeScript, Tailwind CSS, komponen berpola shadcn/Radix, Hono, Cloudflare Pages Functions, Neon PostgreSQL, Drizzle ORM dan Neon Object Storage privat. Migrasi SQL bernomor dan SHA-256 dijalankan eksplisit; tidak membutuhkan generator tambahan. Tidak memakai Neon Auth/Functions/Realtime.

- `src/`: antarmuka Caku, draf, antrean simpan dan dialog bukti.
- `shared/`: tipe, validasi dan hitungan bersama UI/API.
- `worker/`: autentikasi, kepemilikan, PostgreSQL dan proxy gambar privat.
- `public/`: ikon, manifest, font lokal dan lisensinya; service worker dibentuk saat build.
- `data/template.json`: template umum/fiktif tanpa nominal historis.
- `scripts/`: provisioning, migrasi, backup dan pemulihan.
- `docs/`: kebutuhan, arsitektur, pengujian dan pemasangan.

## Data dan pemulihan

Migrasi 0007 bersifat additive. Migrasi 0001–0006 tetap utuh. Nominal, pembuat, histori dan kunci gambar lama dipertahankan; transfer lama tidak dibuat menjadi pemasukan baru. Catatan tambahan lama dipetakan secara eksplisit menjadi alokasi tersendiri atau rincian pemakaian.

[Backup format 7](docs/BACKUP.md) mencakup 16 tabel dan lima koleksi gambar, dengan checksum. Sesi tidak dipulihkan. Format 5/6 didukung melalui peningkatan kompatibel ke tujuan kosong. Simpan PASSWORD_PEPPER secara terpisah. Ikuti [panduan upgrade](docs/DEPLOYMENT.md); jangan menjalankan seed atau inisialisasi akun ulang pada instalasi lama.

Template publik berisi label umum tanpa data keluarga. Workbook, akun, koneksi, backup dan gambar tidak masuk Git. `node scripts/prepare-public.mjs` menyiapkan salinan sumber yang diizinkan beserta manifest SHA-256 untuk ditinjau sebelum publikasi.

## PWA dan iPhone

Buka instalasi melalui Safari → Bagikan → Tambahkan ke Layar Utama. Ikon, manifest standalone dan service worker tersedia. Pengisian/sinkronisasi memerlukan internet. Pengujian viewport bukan bukti pengujian iPhone fisik.

Ganti sandi melalui tombol kunci di area akun. Sandi lama diperlukan; sandi baru 15–128 karakter. Setelah berhasil, sesi akun sendiri dicabut dan pasangan tetap masuk.

Arah visual mengadaptasi [Caku Finance App Mobile](https://www.figma.com/community/file/1341326234352864806/caku-finance-app-mobile). Plus Jakarta Sans disimpan lokal beserta lisensinya. Pemasangan layanan dan batas paket mengikuti [panduan deployment](docs/DEPLOYMENT.md).
