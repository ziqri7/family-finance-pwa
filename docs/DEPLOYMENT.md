# Deployment Cloudflare milik sendiri

Panduan ini menyiapkan hasil untuk ditinjau. Tahap implementasi lokal **tidak** membuat repositori publik, database/bucket jarak jauh, subscription atau rilis produksi.

## Biaya dan kepemilikan

Satu keluarga menggunakan satu Worker, satu D1, dan satu bucket R2 privat pada akun Cloudflare sendiri. Tidak ada server pusat atau kredensial bersama antar instalasi.

Workers dan D1 memiliki pilihan/free tier dengan batas pemakaian. R2 Standard juga memiliki free tier, tetapi aktivasi R2 dapat meminta checkout/subscription; penggunaan di atas kuota dapat dikenai biaya. Harga dan kuota dapat berubah. Periksa [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/) dan [R2 get started](https://developers.cloudflare.com/r2/get-started/) pada saat memasang. Aplikasi ini tidak menjanjikan biaya nol atau mengaktifkan subscription otomatis.

## Persiapan yang dapat dilakukan lokal

1. Jalankan `npm ci`, `npm run check`, `npm test`, dan `npm run build`.
2. Siapkan label umum atau template privat sendiri. Jangan memasukkan workbook, email pribadi, sandi, hash, backup, maupun ID deployment pribadi ke GitHub.
3. Salin `wrangler.jsonc` ke `wrangler.deploy.jsonc` yang diabaikan Git. Atur nama Worker, nama D1 dan nama bucket milik instalasi.
4. Siapkan dua akun produksi baru melalui perintah berikut, memakai identitas yang Anda tentukan. Skrip hanya menulis folder privat; tidak mengubah layanan Cloudflare.

```powershell
node scripts/production-credentials.mjs --suami alamat-pertama@example.com --istri alamat-kedua@example.com
```

Simpan kedua sandi acak pada pengelola sandi. Berkas hasil provisioning tidak boleh dipublikasikan. Jangan gunakan kredensial lokal untuk produksi, jangan memakai sandi bebas yang lemah, dan jangan menurunkan parameter hash jika runtime tidak lulus uji.

## Langkah pemilik pada layanan Cloudflare

Langkah berikut dijalankan setelah pemilik menyetujui akun, potensi biaya, konfigurasi dan rilis. Login/konfirmasi layanan diselesaikan sendiri oleh pemilik.

```powershell
npx wrangler login
npx wrangler d1 create NAMA_D1
npx wrangler r2 bucket create NAMA_BUCKET
```

Masukkan `database_id` hasil pembuatan pada konfigurasi privat. Jangan menggunakan ID nol dari contoh. Gunakan bucket privat; **jangan** aktifkan r2.dev, custom domain publik atau public bucket access. Akses bukti selalu melalui Worker dengan sesi.

Atur `vars.APP_ORIGIN` ke URL HTTPS aplikasi yang benar, misalnya URL workers.dev milik instalasi. Jangan menambahkan `LOCAL_DEV` pada konfigurasi atau secret produksi. Opsi lokal memang memerlukan loopback, tetapi tetap tidak dibawa ke instalasi produksi.

Pasang secret dari berkas provisioning privat, misalnya pada PowerShell:

```powershell
Get-Content -LiteralPath "private/provision-ANDA/AUTH_USERS_JSON.txt" -Raw | npx wrangler secret put AUTH_USERS_JSON --config wrangler.deploy.jsonc
Get-Content -LiteralPath "private/provision-ANDA/SESSION_SECRET.txt" -Raw | npx wrangler secret put SESSION_SECRET --config wrangler.deploy.jsonc
npx wrangler d1 migrations apply NAMA_D1 --remote --config wrangler.deploy.jsonc
```

Template bawaan harus disiapkan pada D1 produksi sebelum pengguna membuat bulan. Gunakan SQL provisioning privat yang dibuat setup dari template sendiri; tinjau nama/jenis pos tanpa nominal historis, lalu jalankan secara eksplisit dengan `wrangler d1 execute ... --remote --file ... --config wrangler.deploy.jsonc`. Migrasi skema tidak menimpa template saat pembaruan aplikasi.

Bangun dan periksa paket sebelum rilis:

```powershell
npm run build
npx wrangler deploy --dry-run --config wrangler.deploy.jsonc
```

Setelah hasilnya ditinjau dan rilis disetujui:

```powershell
npx wrangler deploy --config wrangler.deploy.jsonc
```

Jangan memakai perintah deploy dari konfigurasi contoh tanpa mengisi binding dan origin instalasi sendiri.

## Gerbang sebelum data keluarga nyata

- Uji hash/login pada Worker Cloudflare nyata, termasuk batas CPU paket yang dipilih. Keberhasilan runtime lokal tidak membuktikan batas CPU produksi.
- Uji cookie `__Host-ff_session` Secure/HttpOnly/SameSite, Origin, logout dan pencabutan sesi.
- Uji dua perangkat, konflik akun yang sama, baca pasangan dan penolakan mutasi ID pasangan melalui backend.
- Uji JPG/PNG rusak/besar, batas memori/CPU, kuota gambar, unggahan terputus, hapus induk saat unggah, dan pembersihan objek tidak selesai pada R2 nyata. Parser membatasi dimensi dan kebutuhan memori; gambar besar dapat diminta diperkecil.
- Periksa manifest, instalasi pada perangkat tujuan, pembaruan PWA, offline shell dan cache yang tidak berisi API/data/bukti.
- Buat backup gabungan D1/R2 dan lakukan restore pada sumber daya terpisah. Periksa hasil sebelum memakai restore untuk produksi.

Rotasi konfigurasi akun atau SESSION_SECRET membatalkan sesi lama melalui fingerprint HMAC. Tidak ada pendaftaran publik/reset email. Pengguna yang kehilangan akses memerlukan pemilik instalasi untuk menyiapkan ulang akun secara privat.

## Pembaruan

Backup dahulu, tinjau migrasi baru, jalankan migrasi eksplisit lalu deploy kode. Versi service worker menunggu pengguna menyelesaikan isian sebelum memperbarui tab; tidak menyimpan draf atau data keluarga di cache. Jangan hapus database/bucket saat memperbarui kode.
