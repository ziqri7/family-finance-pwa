# Backup dan pemulihan Neon

Backup berisi data pribadi. Simpan di tempat privat; folder `backups/` dikecualikan dari Git. Secret akun dan koneksi disimpan terpisah pada pengelola sandi.

```powershell
$env:FINANCEE_ENV='.env.neon-production'
npm run backup
```

Hasil: `backups/<waktu>-<acak>/database.json`, `objects/`, dan `manifest.json` versi 4. Tujuh tabel keuangan awal, account_credentials dan income_attachments dibaca dalam transaksi yang mengunci penulis keluarga. Sesi dan percobaan login tidak diekspor. Setiap gambar siap pada pengeluaran atau pos pemasukan aktif diunduh dan diperiksa ukuran/SHA-256. `complete:true` baru ditulis setelah semuanya cocok. Jika penghapusan gambar bersamaan membuat unduhan gagal, backup belum lengkap dan harus diulang. Backup D1 lama dengan `database.sql` adalah format berbeda, jangan dimasukkan ke pemulihan Neon.

Untuk latihan pemulihan, buat cabang kosong dari cabang produksi yang masih kosong atau proyek Neon baru. **Jangan membuat cabang dari database yang sudah berisi data**, karena cabang tersebut menyalin data sumber. Bucket `evidence` harus Private. Ambil koneksi dan kredensial storage untuk cabang tujuan ke berkas privat baru.

```powershell
$env:FINANCEE_ENV='.env.neon-restore'
npm run restore:check -- 'backups/FOLDER_BACKUP'
```

Skrip memvalidasi hash database, cakupan gambar, path, checksum dan versi migrasi. Migrasi diterapkan ke tujuan, lalu tujuan harus kosong termasuk tabel sesi. Gambar diunggah dan dibaca kembali sebelum transaksi pemulihan database. Seluruh nilai tabel pulihan dibandingkan dengan snapshot; revisi bulan dipertahankan. Hash serta versi kredensial ikut dipulihkan, sesi tidak disalin. Identitas tetap konfigurasi privat tujuan, dan PASSWORD_PEPPER harus sama dengan sumber sebelum pemulihan hash bcrypt. Bukti yang belum siap atau induknya dihapus menjadi `deleting`, agar reservasi lama tidak hidup kembali. Restore menolak tujuan berisi data; tidak memiliki mode timpa.

Jika proses terputus sebelum database commit, gambar yang sudah diunggah dapat tersisa pada bucket tujuan. Jangan memakai cabang latihan itu untuk produksi sebelum diperiksa; ulangi dengan tujuan kosong. Database dan object storage tidak memiliki satu transaksi bersama. Snapshot keluarga lokal lama tidak otomatis dipindahkan ke Neon.

Pembersihan bukti tertunda lebih dari 24 jam:

```powershell
node scripts/cleanup.mjs
node scripts/cleanup.mjs --apply
```

Perintah pertama hanya menghitung. `--apply` menandai reservasi kedaluwarsa sebagai deleting, menghapus objek, dan mempertahankan metadata tombstone. Bukti ready serta reservasi baru dipertahankan. Pilih konfigurasi tujuan dengan `FINANCEE_ENV`; periksa berkas tujuan sebelum pemeliharaan.

## Kunci sandi dan backup sebelum pembaruan

Simpan PASSWORD_PEPPER terpisah di pengelola rahasia pemilik; nilainya tidak dimasukkan ke ZIP backup database. Skrip menolak pepper kosong/berbeda sebelum menulis tujuan bila snapshot memuat hash bcrypt. Dua baris kredensial wajib ada; pemulihan tidak boleh diam-diam kembali ke sandi bootstrap.

Backup Neon versi 2 tidak memuat kredensial aktif. Skrip versi 3 menolaknya. Untuk data lama, gunakan commit aplikasi yang cocok dengan backup pada tujuan terisolasi, pulihkan versi 2 dahulu, lalu ikuti upgrade 0003 dan accounts:init menggunakan konfigurasi awal yang cocok. Jangan menimpa produksi atau hash aktif memakai backup lama. Setelah sandi mulai diganti, gunakan backup yang memuat kredensial aktif (format 3 sebelum migrasi 0004; format 4 sesudahnya) dan kode yang cocok; rollback ke kode login bootstrap lama akan menerima kembali sandi lama dan dilarang.

## Backup dengan bukti pemasukan

Format4 memuat sembilan tabel beserta bukti pemasukan dan pengeluaran yang siap. Gambar di bawah pos yang dihapus tidak dipulihkan menjadi ready. Jalankan cleanup untuk membersihkan objek deleting kedua koleksi. Backup format2/3 ditolak skrip format4; pulihkan memakai versi kode/migrasi yang sesuai pada tujuan kosong terisolasi dahulu, lalu upgrade. Jangan menimpa kredensial aktif atau kehilangan PASSWORD_PEPPER. Sebelum upgrade0004, gunakan kode format3 untuk backup; simpan hasil privat sebelum menerapkan migrasi.
