# Financée

Aplikasi keuangan keluarga berbahasa Indonesia: isi anggaran langsung, catat pengeluaran dan bukti JPG/PNG, serta lihat ringkasan suami–istri tanpa menghitung kiriman internal dua kali.

Setiap keluarga memasang salinan sendiri pada Cloudflare. Tidak ada server akun pusat, pendaftaran publik, koneksi bank, pelaksanaan transfer uang, impor atau ekspor Excel. Workbook sumber hanya dipakai saat pengembangan/provisioning privat.

**Status:** aplikasi lokal telah dibangun dan pengujian gangguan tahap 7 telah dijalankan. Uji penerimaan tahap 8 ditutup atas keputusan pengguna: tiga langkah diterima, dua langkah manual dilewati. Paket sumber tahap 9 sudah diuji dari salinan bersih; belum dipublikasikan atau dideploy, dan belum dinyatakan siap produksi. Hasil dan batas pengujian ada di [docs/TESTING.md](docs/TESTING.md) serta [pemeriksaan paket sumber](docs/STAGE9.md).

## Menjalankan di komputer

Prasyarat: Node.js 24 atau lebih baru dan npm. Instalasi baru memakai template umum dengan nominal kosong.

```powershell
npm ci
npm run build
npm run check:public
npm run setup:local
npm run dev
```

Buka **http://127.0.0.1:5173/**. Identitas dan sandi dua akun lokal ada di **`.initial-credentials.txt`**, bukan sandi tetap yang ditulis pada README. Buka berkas itu pada editor, pilih bagian Suami atau Istri, lalu salin Identitas dan Sandi dari bagian yang sama. Jangan unggah atau mengirim berkas tersebut ke GitHub. Akun lokal menggunakan alias `suami@example.invalid` dan `istri@example.invalid`; aplikasi tidak mengirim email.

Data D1 dan gambar R2 lokal disimpan dalam `.wrangler/`, sehingga muat ulang browser tidak menghapus perubahan yang telah dikonfirmasi server. Tutup proses dengan Ctrl+C. Jalankan ulang `npm run dev` untuk melanjutkan. `npm run setup:local` tidak mengganti kredensial atau template yang telah ada.

Untuk memeriksa build PWA lokal pada alamat yang sama, hentikan proses dev, lalu:

```powershell
npm run build
npm run preview
```

`preview` tetap memakai penyimpanan lokal. Ini tidak melakukan deployment Cloudflare.

## Pemakaian

1. Masuk dengan akun sendiri, pilih bulan, lalu buat anggaran. Pos bawaan langsung tersedia untuk diisi.
2. Tekan Enter atau pindah kolom untuk menyimpan. **Tersimpan** hanya muncul setelah server mengonfirmasi; isian gagal/konflik tetap terlihat.
3. Tambah, ubah atau hapus pos pada bulan tersebut. Salin bulan membawa rencana sendiri, tanpa pengeluaran, kiriman nyata atau gambar.
4. Catat pengeluaran pada pos alokasi sendiri. Bukti JPG/PNG opsional, maksimal 10 gambar per catatan, masing-masing 5 MiB; gambar terlalu besar/rusak ditolak.
5. Catat kiriman yang sudah dilakukan melalui bagian sendiri. Pasangan melihat referensi masuk otomatis. Aplikasi tidak menjalankan transfer uang.

Kedua akun membaca data keluarga. Setiap akun hanya mengubah bagiannya sendiri; pembatasan diperiksa backend, termasuk pada gambar. Perubahan diperiksa berkala saat tab terlihat dan online, bukan jaminan realtime seketika. Saat offline, pengisian baru ditahan. Draf tidak disimpan permanen pada perangkat.

## Pengembangan dan pengujian

```powershell
npm run check
npm test
npm run build
```

Stack: React, Vite, TypeScript, Tailwind CSS, komponen UI berpola shadcn/Radix, Hono, Cloudflare Workers, D1, Drizzle ORM, R2 privat. Migrasi SQL eksplisit berada di `migrations/`; skema dan pemetaan query Drizzle berada di `worker/db/`. Tidak memerlukan generator migrasi tambahan untuk menjalankan proyek.

Struktur utama:

- `src/`: antarmuka Caku, draf, antrean simpan, polling dan dialog bukti.
- `shared/`: tipe, validasi serta hitungan yang digunakan UI/API.
- `worker/`: autentikasi, otorisasi, D1, versi perubahan dan bukti privat.
- `public/`: ikon, manifest, font lokal dan lisensi font. Service worker dibentuk saat build dan hanya menyimpan aset antarmuka.
- `data/template.json`: template umum/fiktif; tidak berisi data keluarga dari workbook.
- `scripts/`: penyiapan lokal, kredensial privat, backup dan pemeriksaan pemulihan.
- `docs/`: kebutuhan, arsitektur, pengujian dan panduan pemasangan.

## Template dari workbook privat

Bagian aplikasi tidak meminta pengguna mengunggah Excel. Untuk instalasi keluarga yang menjadi sumber proyek, label telah dipetakan secara privat dari workbook yang diperiksa, tanpa nominal historis. Skrip `scripts/extract-local-template.py` hanya alat pengembangan untuk sumber tersebut; bukan fitur impor aplikasi dan bukan skrip umum untuk sembarang workbook.

Instalasi lain dapat menyiapkan `private/template.json` dengan struktur yang sama seperti `data/template.json` sebelum setup pertama. Folder `private/`, workbook, prototipe privat, secret, kredensial, backup dan `.wrangler/` dikecualikan dari Git. Gunakan data umum saat berkontribusi.

## Menyiapkan salinan kode publik

```powershell
node scripts/prepare-public.mjs
```

Perintah ini memeriksa dan menyalin daftar sumber yang ditetapkan di `scripts/public-files.mjs` ke folder baru `private/release-.../family-finance-pwa`, disertai manifest SHA-256 di folder induknya. Termasuk kode, tes, template dummy, migrasi, dokumentasi, MIT, dan contoh konfigurasi. Tidak membawa workbook, akun, `.wrangler/`, backup, prototipe, catatan kerja internal, dependensi terpasang, atau hasil build. Pemeriksaan publik juga memeriksa hasil build bila ada, tetapi build tidak disalin ke paket sumber.

Daftar ini membatasi cakupan salinan; bukan pengganti tinjauan isi atau audit seluruh riwayat Git. Jangan memakai `git add .` pada workspace yang memuat data keluarga. Tinjau paket, uji pemasangan dari salinan bersih, lalu publikasikan hanya sumber yang telah disetujui. Perintah persiapan tidak membuat repositori, mengunggah berkas, atau melakukan deployment.

## Backup dan pemasangan

- [Backup dan pemulihan](docs/BACKUP.md)
- [Deployment Cloudflare milik sendiri](docs/DEPLOYMENT.md)
- [Hasil dan keterbatasan pengujian](docs/TESTING.md)

Cloudflare memiliki free tier, tetapi **bukan jaminan biaya selalu nol**. R2 dapat memerlukan aktivasi subscription/checkout dan biaya setelah kuota terlampaui. Periksa panduan deployment serta harga resmi sebelum mengaktifkan layanan. Tidak ada layanan jarak jauh yang otomatis dibuat oleh `setup:local`.

## Referensi dan lisensi

Kode aplikasi berlisensi [MIT](LICENSE). Arah visual mengadaptasi [Caku Finance App Mobile](https://www.figma.com/community/file/1341326234352864806/caku-finance-app-mobile), Asril Mochammad / Getah Creative; halaman sumber mencantumkan CC BY 4.0. Logo, foto dan aset kartu bank Caku tidak disertakan. [Catatan referensi](docs/REFERENSI_CAKU.md).

Font Plus Jakarta Sans disimpan lokal bersama lisensi SIL Open Font License pada `public/fonts/`. Font dipilih untuk adaptasi, bukan klaim identifikasi font asli Caku. Komponen UI memakai pola shadcn/ui dan primitive Radix; pustaka pihak ketiga mempertahankan lisensinya masing-masing.
