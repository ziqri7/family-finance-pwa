# Financée

Aplikasi keuangan keluarga berbahasa Indonesia: isi anggaran langsung, catat pengeluaran dan bukti JPG/PNG, serta lihat ringkasan suami–istri tanpa menghitung kiriman internal dua kali.

Setiap keluarga memasang salinan sendiri pada **Cloudflare Pages + Functions + Neon** miliknya. Tidak ada server akun pusat, pendaftaran publik, koneksi bank atau pelaksanaan transfer uang. Pengisian dilakukan langsung pada aplikasi; tidak ada unggah Excel. Workbook sumber hanya dipakai saat pengembangan/provisioning privat.

**Status:** rilis Cloudflare Pages + Neon telah dijalankan dan diuji online pada 15 November 2026. Pengguna open-source memasang salinan serta akun layanan sendiri. Bukti serta batas pemeriksaan di [docs/NEON_REVIEW.md](docs/NEON_REVIEW.md). Aplikasi/data lokal D1/R2 lama bukan target migrasi otomatis.

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

## Pemakaian

1. Masuk dengan akun sendiri, pilih bulan, lalu buat anggaran. Pos bawaan langsung tersedia untuk diisi.
2. Tekan Enter atau pindah kolom untuk menyimpan. **Tersimpan** muncul setelah server mengonfirmasi; isian gagal/konflik tetap terlihat.
3. Tambah, ubah atau hapus pos. Salin bulan membawa rencana sendiri, tanpa pengeluaran, kiriman nyata atau gambar.
4. Catat pengeluaran pada alokasi sendiri. Bukti JPG/PNG opsional, maksimal 10 gambar per catatan dan 5 MiB per gambar; gambar rusak atau berdimensi berlebihan ditolak.
5. Catat kiriman yang sudah dilakukan. Pasangan melihat referensi masuk otomatis. Aplikasi tidak menjalankan transfer uang.

Kedua akun membaca data keluarga; masing-masing hanya mengubah bagiannya. Backend memeriksa pembatasan ini. Sinkronisasi diperiksa setiap 10 detik saat tab terlihat dan online. Saat offline, pengisian baru ditahan; cache PWA berisi antarmuka saja. Draf tidak disimpan permanen pada perangkat.

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

## Template dan sumber publik

Aplikasi tidak meminta unggah Excel. Label workbook sumber dipetakan secara privat tanpa nominal historis. `scripts/extract-local-template.py` adalah alat pengembangan khusus sumber itu. Instalasi lain boleh menyiapkan `private/template.json` mengikuti `data/template.json` sebelum seed pertama.

`node scripts/prepare-public.mjs` menyalin allowlist sumber ke folder privat baru beserta manifest SHA-256. Tidak membawa workbook, akun, `.env*`, `.dev.vars`, backup, `.wrangler/`, dependensi atau build. Pemeriksaan publik mencakup nilai koneksi/kunci lokal yang diketahui; bukan audit seluruh riwayat Git. Tinjau paket sebelum publikasi dan hindari `git add .` pada workspace yang berisi data keluarga.

[Backup/pemulihan](docs/BACKUP.md) memakai snapshot tujuh tabel keuangan, kredensial akun dan gambar dengan checksum. Sesi tidak disalin. Pemulihan hanya ke tujuan kosong. Data D1 lama tidak dipindahkan otomatis.

Free tier memiliki kuota; aplikasi tidak menjanjikan biaya selalu nol atau uptime tanpa batas. Neon bangun otomatis setelah idle, dengan kemungkinan jeda pada permintaan pertama. Tab yang tetap terbuka melakukan polling dan dapat membuat compute tetap aktif. Periksa [harga Neon](https://neon.com/pricing) dan [Workers](https://developers.cloudflare.com/workers/platform/pricing/) saat memasang.

## Referensi dan lisensi

Kode berlisensi [MIT](LICENSE). Arah visual mengadaptasi [Caku Finance App Mobile](https://www.figma.com/community/file/1341326234352864806/caku-finance-app-mobile), Asril Mochammad / Getah Creative; halaman sumber mencantumkan CC BY 4.0. Logo, foto dan kartu bank Caku tidak disertakan. [Catatan referensi](docs/REFERENSI_CAKU.md).

Plus Jakarta Sans disimpan lokal beserta SIL Open Font License dalam `public/fonts/`; ini pilihan adaptasi, bukan identifikasi font asli Caku. Komponen memakai pola shadcn/ui dan primitive Radix. Pustaka pihak ketiga mempertahankan lisensi masing-masing.

Ganti sandi tersedia melalui tombol kunci di dekat Keluar. Masukkan sandi saat ini, sandi baru 15–128 karakter, lalu ulangi. Setelah berhasil, seluruh perangkat akun tersebut perlu masuk kembali; pasangan tetap masuk. Fitur ini sudah dirilis; lihat [catatan implementasi](docs/CHANGE_PASSWORD_PROPOSAL.md).
