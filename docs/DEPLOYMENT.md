# Deployment Cloudflare dan Neon milik sendiri

Satu keluarga menggunakan akun Cloudflare sendiri untuk frontend/API dan akun Neon sendiri untuk PostgreSQL serta gambar privat. Tidak ada server akun pusat. Pilih paket Free; jangan mengaktifkan paket berbayar atau fitur tambahan untuk mengikuti panduan ini. R2/D1 tidak diperlukan.

## 1. Siapkan Neon

Buat proyek Free, pilih region terdekat dan bucket `evidence` dengan akses **Private**. Jangan mengaktifkan Auth, Functions, Realtime atau AI Gateway; aplikasi memakai autentikasi backend sendiri. Pertahankan cabang production kosong sampai pengujian selesai. Buat cabang development terpisah dari cabang yang masih kosong.

Node.js 24+ diperlukan. CLI resmi Neon bisa dipakai melalui `npx`, tanpa instalasi global:

```powershell
npm ci
npx neon login --keyring
npx neon env pull --project-id ID_PROYEK --branch development --service postgres --service object-storage --file .env.neon-dev
```

Periksa bahwa kredensial berasal dari cabang yang benar. Tambahkan `EVIDENCE_BUCKET=evidence` pada berkas privat. Endpoint dan region signing harus mengikuti hasil CLI untuk cabang yang dipilih. Pada proyek Singapura yang diuji, CLI memberi `ap-southeast-1`; jangan menyalin region contoh dari proyek lain. CLI menyimpan koneksi/kunci pada berkas, jangan menyalinnya ke chat atau GitHub.

```powershell
npm run setup:local -- --from .env.neon-dev
npm run build
npm run dev
```

Aplikasi lokal di http://127.0.0.1:5173 tetap membutuhkan internet untuk Neon. Dua sandi acak lokal ada di `.initial-credentials.txt`. `setup:local` menolak cabang production dan tidak menimpa `.dev.vars` yang sudah ada. Pembaruan berikutnya memakai `db:migrate`/`db:seed`, bukan membuat ulang akun.

## 2. Uji sebelum rilis

Jalankan `npm run test:unit`, build dan pemeriksaan publik. Pengujian integrasi memerlukan dua cabang kosong khusus `financee-test` dan `financee-restore-test`, konfigurasi privat `.env.neon-test`/`.env.neon-restore`, serta `FINANCEE_TEST=1`. Tes mengosongkan data pada kedua cabang tersebut; jangan gunakan cabang keluarga atau production.

```powershell
$env:FINANCEE_TEST='1'
npm test
npm run build
npm run format:check
npm run check:public
```

Uji perangkat, hak akses, konflik simpan, JPG/PNG, backup/pemulihan, dan bangun setelah idle. Lihat TESTING.md untuk bukti serta batas yang masih ada.

## 3. Siapkan produksi secara privat

Ambil konfigurasi cabang production ke `.env.neon-production` dengan layanan postgres/object-storage saja; tambahkan nama bucket. Gunakan kredensial storage khusus cabang production. Jangan memakai koneksi/cookie/sandi dummy. Jalankan migrasi dan seed template tanpa nominal:

```powershell
$env:FINANCEE_ENV='.env.neon-production'
npm run db:migrate
npm run db:seed
node scripts/production-credentials.mjs --suami alamat-pertama@example.com --istri alamat-kedua@example.com
```

Sandi acak hanya disimpan pada folder provisioning privat. Simpan pada pengelola sandi. Tidak ada registrasi bebas atau reset melalui email.

Salin `wrangler.jsonc` ke `wrangler.deploy.jsonc` yang diabaikan Git. Atur nama Worker/account sendiri dan `vars.APP_ORIGIN` ke URL HTTPS workers.dev yang benar. `EVIDENCE_BUCKET`/`AWS_REGION` boleh berupa vars. Atur `AWS_REGION` pada konfigurasi privat sesuai CLI. Siapkan `DATABASE_URL`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AUTH_USERS_JSON`, dan `SESSION_SECRET` dalam `private/production.secrets.json`. Wrangler dapat memasang JSON secret bersama versi aplikasi melalui `--secrets-file`, sehingga tidak perlu membuat Worker sementara tanpa konfigurasi lengkap. Jangan menambahkan `LOCAL_DEV` ke produksi. Jangan memasukkan URL database atau secret ke `VITE_*`.

## 4. Tinjau lalu rilis

```powershell
npm run build
npx wrangler deploy --dry-run --config wrangler.deploy.jsonc --secrets-file private/production.secrets.json
```

Setelah pemilik menyetujui konfigurasi dan rilis konkret:

```powershell
npx wrangler deploy --config wrangler.deploy.jsonc --secrets-file private/production.secrets.json
```

Uji login/hash dan decode gambar pada Worker nyata sebelum data keluarga digunakan. Runtime lokal tidak membuktikan batas CPU/memori Workers Free. Periksa cookie Secure/HttpOnly/SameSite, logout, dua perangkat, bukti yang memerlukan sesi dan cache PWA tanpa data keluarga. Jika pengujian runtime gagal, jangan menurunkan kekuatan sandi.

## Paket gratis dan pembaruan

Neon membangunkan database otomatis saat query setelah idle; pembukaan pertama dapat lebih lambat. Browser yang dibiarkan terbuka melakukan polling sehingga database mungkin tetap aktif. Free memiliki kuota dan bukan jaminan uptime atau pemakaian tanpa batas. Saat ditinjau, Neon mencantumkan database 1 GB, 100 CU-jam per proyek/bulan dan object storage 5 GB; periksa [harga Neon](https://neon.com/pricing) dan [harga Workers](https://developers.cloudflare.com/workers/platform/pricing/) saat memasang. Jangan mengaktifkan subscription berbayar otomatis.

Sebelum memperbarui: buat backup lengkap, tinjau migrasi, terapkan migrasi eksplisit lalu rilis kode. Migrasi bernomor dicatat dengan SHA-256 dan menolak perubahan file yang sudah diterapkan. Jangan menghapus database/bucket atau menyalin otomatis data lokal lama. Pengguna open-source menyiapkan kedua akun layanan miliknya sendiri.
