# Financée

## Kandidat perbaikan HP dan penandaan sekaligus — belum dirilis

Pesan grafik kosong ditampilkan di luar kisi legenda agar tetap terbaca pada HP. Tombol Buka alokasi saya menuju bagian pemilik. Pada bulan lama, tombol **Sudah dibayar / diserahkan** membuka satu ringkasan seluruh pos yang nominalnya sudah terisi; pilih semua, periksa jenis/nominal, lalu **Tandai N pos selesai**. Pos kosong tidak ikut. Peninjauan per pos tetap tersedia untuk kasus khusus.

Alur ini memakai endpoint dan perlindungan versi yang sudah ada, tanpa migrasi atau perubahan sandi. Setiap pos dikonfirmasi terpisah di server: hasil sebagian tetap tersimpan dan ditampilkan; retry mengenali yang sudah berhasil. Perubahan pos/catatan dari perangkat lain perlu dimuat ulang dan ditinjau. Tidak menandai data keluarga secara otomatis saat rilis.


## Alokasi aktual — dirilis 16 November 2026

Alur baru yang disetujui: isi nominal sesudah pembayaran/penyerahan, catatan otomatis dari pos yang sama, bukti JPG/PNG langsung pada Alokasi, serta pembeda Pembayaran/Kiriman pasangan/Disisihkan. Data lama diberi penanda dan ditinjau pemilik sebelum konversi; histori dan buktinya tetap disimpan. Salin bulan membawa struktur dengan nominal kosong. Pengeluaran tambahan memakai menu Catat tanpa mengulang nominal Alokasi.

Versi ini memakai migrasi 0005 dan backup format 5. Untuk memperbarui instalasi sendiri, ikuti [upgrade](docs/DEPLOYMENT.md), [rancangan disetujui](docs/ALOKASI_REALISASI_PROPOSAL.md) dan [bukti uji](docs/TESTING.md). Pembaruan telah ditayangkan dan diperiksa online. Nilai lama tetap legacy sampai pemilik meninjaunya melalui aplikasi; sandi dan sesi aktif dipertahankan.


Aplikasi keuangan keluarga berbahasa Indonesia: isi anggaran langsung, catat pengeluaran dan bukti JPG/PNG, serta lihat ringkasan suami–istri tanpa menghitung kiriman internal dua kali.

Setiap keluarga memasang salinan sendiri pada **Cloudflare Pages + Functions + Neon** miliknya. Tidak ada server akun pusat, pendaftaran publik, koneksi bank atau pelaksanaan transfer uang. Pengisian dilakukan langsung pada aplikasi; tidak ada unggah Excel. Workbook sumber hanya dipakai saat pengembangan/provisioning privat.

**Status:** desain donut/batang, ringkasan tahun dan bukti pemasukan sudah dirilis serta diperiksa online pada 16 November 2026. Versi berjalan commit `bc59ec6`; catatan verifikasi terbaru ada di [docs/TESTING.md](docs/TESTING.md). Pengguna open-source memasang salinan serta akun layanan sendiri. Bukti serta batas pemeriksaan di [docs/NEON_REVIEW.md](docs/NEON_REVIEW.md). Aplikasi/data lokal D1/R2 lama bukan target migrasi otomatis.

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
3. Tambah, ubah atau hapus pos. Salin bulan membawa struktur pos sendiri; nominal, tanggal, pengeluaran, kiriman dan gambar tidak disalin.
4. Pada Alokasi baru, pilih jenis pembagian lalu isi nominal setelah dibayar/diserahkan; catatan terbentuk otomatis. Gunakan Catat hanya untuk pembayaran tambahan. Bukti JPG/PNG dapat dipasang langsung pada pos, maksimal 10 gambar dan 5 MiB per gambar; gambar rusak atau berdimensi berlebihan ditolak. Pos lama ditinjau sebelum beralih agar catatan tidak ganda.
5. Pada pos pemasukan, pilih Tambah / lihat bukti untuk lampiran JPG/PNG opsional dengan batas yang sama. Galeri Bukti menampilkan gambar pemasukan/pengeluaran bulan terpilih; pasangan dapat melihat.
6. Di Beranda, pilih Bulan untuk donut alokasi dan batang pemasukan/pengeluaran, atau Tahun untuk ringkasan 12 bulan. Penjelasan hitungan tersedia melalui tombol info.
7. Isi pos berjenis Kiriman pasangan setelah uang diserahkan. Pasangan melihat referensi masuk otomatis. Aplikasi tidak menjalankan transfer uang; pencatatan kiriman manual tetap tersedia untuk data alur lama.

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

[Backup/pemulihan](docs/BACKUP.md) memakai snapshot sembilan tabel (termasuk kredensial serta bukti pemasukan) dan gambar dengan checksum. Sesi tidak disalin. Pemulihan hanya ke tujuan kosong. Data D1 lama tidak dipindahkan otomatis.

Free tier memiliki kuota; aplikasi tidak menjanjikan biaya selalu nol atau uptime tanpa batas. Neon bangun otomatis setelah idle, dengan kemungkinan jeda pada permintaan pertama. Tab yang tetap terbuka melakukan polling dan dapat membuat compute tetap aktif. Periksa [harga Neon](https://neon.com/pricing) dan [Workers](https://developers.cloudflare.com/workers/platform/pricing/) saat memasang.

## Referensi dan lisensi

Kode berlisensi [MIT](LICENSE). Arah visual mengadaptasi [Caku Finance App Mobile](https://www.figma.com/community/file/1341326234352864806/caku-finance-app-mobile), Asril Mochammad / Getah Creative; halaman sumber mencantumkan CC BY 4.0. Logo, foto dan kartu bank Caku tidak disertakan. [Catatan referensi](docs/REFERENSI_CAKU.md).

Plus Jakarta Sans disimpan lokal beserta SIL Open Font License dalam `public/fonts/`; ini pilihan adaptasi, bukan identifikasi font asli Caku. Komponen memakai pola shadcn/ui dan primitive Radix. Pustaka pihak ketiga mempertahankan lisensi masing-masing.

Ganti sandi tersedia melalui tombol kunci di dekat Keluar. Masukkan sandi saat ini, sandi baru 15–128 karakter, lalu ulangi. Setelah berhasil, seluruh perangkat akun tersebut perlu masuk kembali; pasangan tetap masuk. Fitur ini sudah dirilis; lihat [catatan implementasi](docs/CHANGE_PASSWORD_PROPOSAL.md).

## Ringkasan tahun

Dashboard menampilkan persentase bulan aktif dan ringkasan tahun dengan grafik batang 12 bulan. Hanya bulan dengan anggaran kedua akun serta nominal pemasukan/alokasi lengkap yang masuk ringkasan. Isi 0 jika pos tidak dipakai. Persentase gabungan memakai total nominal dibagi total pemasukan anggaran, bukan rata-rata persentase bulan. Sisa adalah sisa anggaran, bukan saldo rekening. Dashboard tergabung dalam rilis 16 November 2026. Upgrade instalasi lama membutuhkan migrasi 0004 untuk bukti pemasukan setelah backup format 3; lihat panduan deployment.

## Memasang pada iPhone

Buka alamat instalasi sendiri melalui Safari, pilih Bagikan → Tambahkan ke Layar Utama. Jika ada pilihan Open as Web App, aktifkan lalu tekan Tambah. Ikon, manifest standalone dan service worker sudah tersedia; pengisian/sinkronisasi tetap membutuhkan internet. Lihat [panduan Apple](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios). Pemasangan pada iPhone fisik belum dibuktikan oleh pengujian viewport.

Bukti pemasukan opsional tersedia pada masing-masing pos pemasukan melalui Tambah / lihat bukti. Hanya pemilik pos dapat mengunggah/menghapus; pasangan dapat melihat. Lampiran tidak mengubah nominal dan tidak ikut salin bulan. Fitur ini sudah dirilis pada 16 November 2026. Backup baru memakai format 4; lihat panduan backup sebelum upgrade 0004.
