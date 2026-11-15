Status terbaru 15 November 2026: Cloudflare Pages + Neon sudah dirilis dan alur HTTP/API produksi telah lulus; hasil rinci pada TESTING.md. Catatan belum-deploy di bawah merupakan arsip persiapan.

# Integrasi Neon yang disetujui

Pengguna menyetujui penggantian D1/R2 dengan Neon PostgreSQL dan Object Storage privat. Cloudflare tetap hosting/frontend/API. Setiap keluarga memerlukan dua akun layanan sendiri; tidak ada server pusat. Tampilan Caku, font, hitungan dan alur MVP dipertahankan. Neon Auth/Functions/Realtime/AI Gateway tidak digunakan.

Proyek Free dan bucket evidence Private telah dibuat. Implementasi/pengujian memakai cabang dummy terpisah; cabang production kini mempunyai skema dan 20 pos bawaan tanpa nominal; bulan, anggaran, pengeluaran dan bukti masih kosong. Tidak menyalin data November atau secret lama otomatis. Kredensial CLI memakai OS keyring; koneksi/kunci cabang berada pada berkas privat yang dikecualikan dari paket publik.

Kandidat memuat skema Drizzle PostgreSQL, migrasi bernomor/hash, transaksi atomik/lock keluarga, CAS, rate limit, proxy S3 terautentikasi, penyiapan lokal, backup/pemulihan dan panduan self-host dua penyedia. Detail di ARCHITECTURE.md, DEPLOYMENT.md dan BACKUP.md. Bukti akhir dicatat pada TESTING.md, bukan memakai tes D1 lama sebagai bukti PostgreSQL.

Uji idle: API Neon menunjukkan compute production idle dan suspended_at terisi. Satu query baca-saja SELECT 1 berhasil dalam 1.919 ms (jaringan + bangun + query, satu sampel); API sesudahnya menunjukkan active. Tidak memakai perintah resume. Query juga mengonfirmasi 0 tabel public. Ini bukti bangun otomatis pada percobaan ini, bukan jaminan latensi/uptime.

Free yang ditinjau: 1 GB PostgreSQL, 100 CU-jam/proyek/bulan, object storage 5 GB pada halaman harga. Kuota dan paket bisa berubah. Tab yang terbuka melakukan polling dan dapat menjaga compute tetap aktif. Tidak mengaktifkan paket berbayar atau menambahkan kartu.

Dua akun produksi, konfigurasi HTTPS/cookie, koneksi PostgreSQL produksi dan S3 privat telah diuji melalui Worker native lokal; sesi serta satu gambar probe dibersihkan. Ini persiapan rilis, bukan bukti runtime Cloudflare remote atau perangkat fisik. Tidak mengunggah kandidat Neon atau melakukan deployment sebelum tinjauan rilis konkret.

Rujukan: [driver/transaksi resmi](https://neon.com/docs/serverless/serverless-driver), [autentikasi storage](https://neon.com/docs/storage/authentication), [scale to zero](https://neon.com/docs/introduction/scale-to-zero), [harga](https://neon.com/pricing).
