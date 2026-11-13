# Backup privat dan pemulihan

Backup adalah tindakan pemeliharaan pemilik instalasi. Ini bukan ekspor Excel dan tidak tersedia sebagai URL publik.

## Backup lokal

Hentikan sementara pengeditan/unggahan pada kedua akun agar hasil backup mudah ditinjau, lalu:

```powershell
npm run backup:local
```

Skrip mengekspor snapshot D1, membaca metadata gambar siap dari snapshot SQL tersebut, mengambil objek R2, lalu mencocokkan ukuran dan SHA-256 setiap gambar. Manifest `complete:true` baru dibuat setelah semua langkah berhasil. Jika gambar sudah dihapus saat proses berlangsung atau checksum berbeda, proses gagal dan folder itu tidak dianggap backup lengkap.

Hasilnya berada dalam `backups/<waktu>-<acak>/`: `database.sql`, `manifest.json`, dan `objects/`. SQL memuat data keluarga dan hash sesi. Semua isi backup privat dan dikecualikan dari Git; salin hanya ke tempat penyimpanan privat milik Anda. Secret dua akun dan SESSION_SECRET tidak ada dalam D1; simpan terpisah pada pengelola sandi.

## Pemeriksaan pemulihan tanpa menimpa aplikasi

```powershell
node scripts/check-restore.mjs "backups/<folder-backup>"
```

Perintah ini selalu membuat direktori persistensi lokal baru. SQL dipulihkan ke D1 terpisah, gambar dimasukkan ke R2 terpisah dan dibaca kembali, jumlah catatan/trigger dicocokkan, dan semua sesi serta hitungan percobaan login hasil pemulihan dihapus. Aplikasi asal tetap memakai database sebelumnya.

Backup uji lokal berisi SQL dan dua gambar ilustrasi telah berhasil diperiksa dengan alur ini. Pemulihan layanan Cloudflare jarak jauh belum dijalankan.

## Backup produksi

Sesudah pemilik mengonfigurasi dan mengotorisasi Cloudflare sendiri, skrip mendukung pilihan eksplisit:

```powershell
node scripts/backup.mjs --remote --config wrangler.deploy.jsonc --database NAMA_D1 --bucket NAMA_BUCKET
```

Nama D1/bucket harus sesuai instalasi sendiri. Perintah memakai akun Wrangler milik pemilik dan tidak menyimpan token ke kode publik. Mode remote tidak dijalankan dalam tahap implementasi lokal ini.

Pemulihan produksi dilakukan ke sumber daya baru terlebih dahulu: impor SQL, unggah objek dengan key yang sama dari manifest, cabut `sessions` serta `login_attempts`, siapkan kembali secret, lalu periksa login, nilai anggaran dan gambar sebelum mengganti binding Worker. Jangan menimpa database aktif untuk sekadar mencoba restore. Binding baru dan rilis produksi memerlukan keputusan pemilik pada tahap deployment.

## Bukti tertunda dan pembersihan

Hanya objek siap yang masih terkait pengeluaran aktif yang menjadi bagian wajib backup. Metadata `pending`, `failed` atau `deleting` dapat tetap berada pada SQL dan tidak diberi label gambar berhasil. Setelah restore, gambar tidak siap tetap tidak bisa dibaca. Pemilik dapat menghapus slot tidak selesai melalui form pengeluaran sendiri dan memilih ulang berkas.

Pemeliharaan memiliki mode periksa tanpa mutasi:

```powershell
node scripts/cleanup.mjs --local
```

Tambahkan `--apply` hanya setelah jumlah kandidat ditinjau. Skrip mencabut slot pending/failed yang tidak diperbarui lebih dari 24 jam, lalu menghapus objeknya serta mencoba ulang objek berstatus deleting. Bukti ready tidak dipilih. Metadata deleting dipertahankan untuk mencegah ID lama muncul kembali. Mode remote memerlukan pilihan `--remote`, konfigurasi, nama database/bucket milik pemilik, dan otorisasi layanan; belum dijalankan di produksi. Backup yang hanya berisi SQL tidak dianggap memulihkan gambar.
