# Tahap 9 — paket sumber untuk tinjauan

Status: persiapan tahap 9 dilanjutkan atas instruksi pengguna pada 14 November 2026. Paket Financée terbaru telah dipasang dari salinan bersih; build, 31 tes dan setup lokal lulus. Judul HTML/manifest, dua akun baru, database awal kosong, template null, simpan/baca nominal dan logout diperiksa melalui HTTP pada port uji terpisah. Paket awal sebelum revisi nama tidak lagi menjadi kandidat publik. Belum membuat repositori GitHub atau melakukan deployment. Tidak memakai data keluarga untuk pengujian pemasangan.

## Berkas yang disiapkan

Kode React/Worker/shared, pengujian, migrasi SQL, template generik, aset/icon/font dan lisensinya, skrip operasional, dokumentasi, README, MIT, lockfile, konfigurasi contoh dan `.gitignore`.

`scripts/public-files.mjs` menetapkan satu daftar sumber yang dipakai bersama oleh pemeriksaan dan `scripts/prepare-public.mjs`. Folder tes kini turut diperiksa. Paket tidak membawa `WORKLOG.md`, workbook, pemetaan `.private.*`, `.dev.vars`, kredensial lokal, `private/`, `.wrangler/`, backup, prototipe, hasil build maupun `node_modules`. Symlink di dalam pohon sumber ditolak. Contoh konfigurasi memakai identitas/binding pengganti dan template umum tanpa nominal historis.

Skrip persiapan menulis folder baru di `private/release-.../family-finance-pwa` serta manifest SHA-256 setiap berkas di folder induk. Hasil build diperiksa bila ada, tetapi bukan bagian paket sumber. Paket untuk tinjauan berupa ZIP sumber dan manifest terpisah; jangan mengemas ulang salinan yang sudah dipakai menjalankan setup karena di dalamnya telah terbentuk akun/database lokal baru.

## Bukti dari salinan bersih

- `npm ci --no-audit --no-fund`: berhasil memasang 108 paket berdasarkan lockfile. Npm memberi peringatan kebijakan install-script esbuild/workerd; build dan runtime native berikutnya tetap berhasil pada mesin uji. Tidak mengklaim audit dependensi baru dari perintah ini.
- `npm run build`: TypeScript dan Vite lulus; service worker terbentuk. Klien sekitar 425 KB JS mentah/130 KB gzip.
- `npm run format:check`: lulus.
- `npm test`: 31 lulus, 0 gagal. Satu tes baru memastikan paket memasukkan tes/contoh konfigurasi dan mengecualikan data lokal serta aset hasil build.
- `npm run setup:local`: migrasi dan template generik berhasil, membuat dua akun acak baru tanpa mencetak sandi. Tidak menggunakan private/template.json atau kredensial workspace asal.
- Pemeriksaan API build pada port lokal terpisah: halaman HTTP berhasil, tanpa sesi 401, awalnya tidak ada periode, masing-masing akun membuat anggaran sendiri, 16/4 pos generik bernominal null, nominal tersimpan dan terbaca kembali, logout mencabut sesi, berkas privat tidak tersaji sebagai aset.
- `npm run check:public`: lulus di salinan bersih setelah setup, termasuk terhadap kredensial baru yang baru dibentuk. Tidak mendeteksi nilai akun/secret/workbook dalam sumber maupun aset build.

Perubahan setelah pemeriksaan salinan bersih hanya perapian dokumentasi. Berkas program/tes/lockfile pada paket akhir dicocokkan SHA-256 dengan salinan yang diuji. ZIP akhir diperiksa terhadap manifest sumber; tidak membawa berkas hasil setup/pemasangan.

## Batas dan keputusan berikutnya

Pemeriksaan ini membuktikan pemasangan lokal pada Windows/Node 24 di mesin uji, bukan seluruh OS atau ketersediaan paket selamanya. Audit kandidat publik tidak sama dengan audit riwayat Git, pemeriksaan keamanan menyeluruh, atau sertifikasi produksi.

Tidak membuat GitHub/repo, mengunggah paket, mengaktifkan Cloudflare remote, atau mengubah database keluarga. Sebelum publikasi, pemilik meninjau paket sumber dan menyetujui tujuan/nama serta visibilitas repositori. Setelah itu tahap 10 menyiapkan deployment dengan keputusan akun, kuota/biaya, origin dan rilis yang konkret. Gerbang Cloudflare nyata/perangkat fisik tetap tercantum di DEPLOYMENT.md dan TESTING.md.
