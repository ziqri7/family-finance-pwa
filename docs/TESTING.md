# Pengujian integrasi Neon — 14 November 2026

## Persiapan rilis Cloudflare

Salinan rilis dipasang bersih: npm ci, 15 tes unit, typecheck/build, format dan pemeriksaan publik lulus. Konfigurasi privat memakai region S3 dari CLI Neon; default region pada contoh publik dihapus agar tidak diasumsikan lintas proyek. Tidak mengubah hitungan, UI atau handler API.

Produksi Neon disiapkan dari keadaan 0 tabel public: dua migrasi, sembilan trigger dan 20 pos bawaan tanpa nominal. Tidak memindahkan November. Backup lengkap dibuat setelah provisioning. Worker native lokal memakai koneksi dan secret produksi: kedua akun berhasil login, cookie Secure/HttpOnly/SameSite/host-only, hash sesi, daftar bulan kosong, Origin asing ditolak dan logout mencabut sesi. S3 produksi menerima PNG dummy, checksum cocok, GET tanpa kredensial ditolak, lalu objek dihapus dan HEAD memastikan hilang. Tidak menyisakan bulan, sesi atau hitungan percobaan uji.

Dry-run Cloudflare dengan konfigurasi dan berkas JSON secret asli berhasil; nilainya tidak dicetak. Worker remote belum dibuat dan kode belum diunggah. CPU/memori Cloudflare serta perangkat fisik masih memerlukan uji setelah rilis disetujui. Catatan 33 tes integrasi di bawah tetap bukti tahap sebelumnya untuk handler yang sama.


**Kandidat terisolasi: 33 tes lulus, 0 gagal, 0 dilewati.** API berjalan pada Worker native Miniflare dan PostgreSQL/Object Storage Neon sungguhan di cabang dummy; bukan D1 atau storage tiruan. Produksi belum dirilis.

- Dua akun, sesi/cookie/hash/fingerprint, Origin, pembatasan login bersamaan, validasi, kepemilikan backend, CAS dua penulis, retry, hapus dan salin bulan lulus.
- JPG/PNG nyata diunggah/dibaca dari bucket privat; akses tanpa sesi ditolak. Sepuluh reservasi bersamaan diterima dan slot ke-11 ditolak. Kegagalan PUT, finalisasi dan induk terhapus diuji kembali pada backend baru.
- Replay migrasi tanpa perubahan, rollback transaksi, relasi lintas pemilik, batas 200 pos aktif di bawah dua penulis dan penyisipan tombstone pada kuota penuh lulus. Semua perubahan mengambil lock sebelum query data.
- Backup/pemulihan tujuh tabel domain dan satu PNG ke cabang lain lulus; seluruh nilai dibandingkan, termasuk angka 1 triliun dan revisi. Hash gambar cocok. Backup kurang gambar/berubah dan tujuan sudah berisi data ditolak; sesi tidak dipulihkan. GET langsung tanpa kredensial ke object storage ditolak.
- Unit hitungan, antrean simpan, PWA shell-only, metadata backup, pemeliharaan serta allowlist publik tetap lulus. Dua tes kontrak metadata/pemeliharaan memakai SQLite in-memory hanya untuk logika SQL portabel; bukan bukti integrasi PostgreSQL. Bukti PostgreSQL berasal dari tes integrasi terpisah.

Typecheck/build, format, pemeriksaan publik dan Worker dry-run lulus. Build frontend tetap 425,20 KB JS mentah/130,20 KB gzip dan 26,12 KB CSS; UI tidak diubah. Bundel Worker 1.434,81 KiB/270,53 KiB gzip. Ukuran bukan benchmark CPU atau kelancaran perangkat.

Instalasi bersih dari allowlist sumber: npm ci, 15 tes unit, build, format, pemeriksaan publik dan setup dari koneksi cabang dummy lulus. Pemeriksaan HTTP hasil instalasi memverifikasi branding, CSP, API tanpa sesi 401, dua sandi acak native Worker, pembacaan data bersama dan logout. Server sementara instalasi bersih telah dihentikan. npm melaporkan 0 kerentanan dikenal saat instalasi, dengan warning kebijakan install script esbuild/workerd; runtime/build tetap berhasil.

Pratinjau browser hasil build pada port 5191: login suami dummy, buat Januari 2004, isi pemasukan 10 juta/alokasi 7 juta, status Tersimpan, sisa 3 juta/30%, lalu reload dan nilai tetap. Desktop dan viewport mobile 390×844 diperiksa; lebar dokumen/client sama-sama 375 px sehingga tidak ada overflow halaman. Bukti layar hanya berisi data dummy. Viewport dikembalikan setelah pemeriksaan.

Uji bangun otomatis: compute production yang kosong terlihat idle dengan suspended_at, SELECT 1 biasa berhasil dalam 1.919 ms, status menjadi active tanpa perintah resume. Query juga mengonfirmasi 0 tabel public. Satu sampel ini termasuk jaringan dan query, bukan SLA atau jaminan latensi.

## Belum selesai dan batas bukti

- Belum push kandidat Neon ke GitHub atau deployment Cloudflare produksi. Paket publik sebelumnya tetap versi D1/R2.
- Akun dan skema produksi kini disiapkan seperti bagian persiapan rilis di atas; nominal November belum disalin. Data lokal lama dan workbook dipertahankan.
- Batas CPU/memori Cloudflare nyata, pemasangan PWA pada perangkat fisik dan jaringan dua perangkat sungguhan belum diuji pada integrasi ini. HTTP/dua sesi native Worker lokal tidak membuktikan kondisi tersebut.
- Penyimpanan database/gambar bukan satu transaksi. Backup gagal bila gambar tidak bisa diambil; restore terputus dapat meninggalkan objek pada tujuan. Bukan backup terjadwal. Lihat BACKUP.md.
- Free tier memiliki kuota. Tab terlihat yang melakukan polling bisa mempertahankan compute aktif.

## Arsip pemeriksaan sebelum perpindahan Neon

Catatan di bawah menggambarkan versi D1/R2 sebelumnya dan keputusan pengguna pada tahap 7–9, bukan hasil terbaru kandidat Neon.

# Hasil pemeriksaan lokal — 13 November 2026

Status ini membedakan kode yang sudah dijalankan dari hal yang masih memerlukan layanan/perangkat nyata. Tahap 6 menghasilkan aplikasi lokal; belum ada rilis produksi atau repositori baru.

## Pemeriksaan otomatis

`npm test` terakhir menjalankan **31 pengujian: 31 lulus, 0 gagal** dari salinan bersih pada tahap 9. Jumlah ini mencakup tambahan tahap 7 (satu tes induk dan tiga subtes gangguan upload) serta satu pemeriksaan daftar paket pada tahap 9. Pengujian API memakai Worker native melalui Miniflare dan database/bucket terisolasi, bukan database yang diisi pengguna. Bukti layar koneksi/sesi/upload/PWA dan batasnya ada di [STAGE7.md](STAGE7.md); bukti instalasi bersih ada di [STAGE9.md](STAGE9.md).

| Bagian | Bukti yang dijalankan |
| --- | --- |
| Autentikasi | API tanpa sesi ditolak; PBKDF2 native berhasil; cookie HTTPS simulasi memakai prefix __Host-, Secure, HttpOnly, SameSite=Strict, Path=/ tanpa Domain; DB menyimpan hash token; fingerprint berbeda mencabut sesi |
| Batas backend | Origin asing, properti tambahan, tanggal tidak valid dan body melebihi batas ditolak; login bersamaan tetap dibatasi |
| Kepemilikan | Akun pasangan bisa membaca, tetapi tidak dapat mengubah/hapus pos, expense, transfer atau gambar pihak lain; referensi pos pasangan ditolak |
| Anggaran | Pos awal null; null dan nol berbeda; pembuatan/salin bulan tidak menimpa bulan yang ada; sumber tidak tersedia tidak membuat periode kosong |
| Versi dan pengulangan | Nama/nominal memakai versi terpisah; dua penulis nominal menghasilkan sukses/409; pengulangan setelah jawaban hilang tidak menggandakan perubahan atau pos; ID yang dihapus tidak dihidupkan kembali |
| Antrean klien | Jawaban terlambat tidak menandai isian baru tersimpan; perubahan berikutnya memakai versi yang dikonfirmasi; kegagalan jaringan menjaga draf; konflik menunggu pilihan; pos terhapus tidak dibuat ulang diam-diam; nominal invalid/offline tidak dikirim |
| Hapus sesudah edit | Versi untuk konfirmasi/hapus diambil setelah simpan sendiri dikonfirmasi; versi yang lebih baru tidak diturunkan |
| Hitungan | Contoh 10 juta/7 juta, defisit 12 juta/10 juta, penyebut nol dan konsolidasi transfer internal diperiksa |
| JPG/PNG | Dua format benar-benar didekode, checksum diperiksa, akses gambar memerlukan sesi, format palsu/polyglot ditolak, slot ke-11 bersamaan ditolak, hapus induk mencabut akses |
| Backup | Manifest yang menghilangkan gambar siap dari SQL, metadata berubah, path tidak aman atau daftar tidak lengkap ditolak |
| Pemeliharaan | Gambar ready dan pending baru tidak dipilih; pending kedaluwarsa/deleting dipilih; metadata tombstone dipertahankan |
| PWA | Manifest/ikon raster benar; service worker tidak menangkap API, bukti, request tulis atau origin lain; fallback offline hanya shell; pembaruan tidak otomatis skip-waiting saat instalasi |

`npm run check`, `npm run build`, dan pemeriksaan format juga telah dijalankan dengan hasil lulus. Build klien sekitar 425 KB JavaScript mentah/130 KB gzip, 26 KB CSS mentah/6,6 KB gzip; font lokal sekitar 27 KB. Ini ukuran paket, bukan benchmark kelancaran pada ponsel fisik.

Pemeriksaan instalasi paket terakhir melaporkan **0 kerentanan yang dikenal**. Alat generator tambahan yang tidak dipakai dan menyebabkan empat peringatan dihapus; Drizzle ORM tetap digunakan. Hasil audit dependensi tidak sama dengan audit keamanan aplikasi menyeluruh.

## Pengujian melalui antarmuka aktual

Pengguna masuk sendiri dengan akun lokal. Pengujian memakai Januari/Februari 2000 dan pos berlabel UJI, terpisah dari anggaran November yang dibuat pengguna.

Setelah mendapat persetujuan eksplisit pengguna, dua bulan uji dan dua gambar ilustrasi tersebut telah dibersihkan. Backup lengkap dibuat lebih dahulu; pemeriksaan terpisah memastikan semua catatan dua bulan uji sudah kosong dan data anggaran di luar keduanya identik sebelum/sesudah pembersihan. November 2026 tetap dipertahankan.

- Tambah pos pemasukan dan alokasi, isi 10.000.000/7.000.000, lihat sisa 3.000.000/30%; setelah reload lalu membuka bulan yang sama, nominal tetap ada dan status Tersimpan.
- Catat pengeluaran 25.000 dengan dua gambar JPG/PNG ilustrasi. Keduanya tersimpan di R2 lokal dan dapat dibaca kembali dari viewer; naturalWidth/naturalHeight 540×640 pada kedua gambar.
- Akun suami membaca bagian istri: semua empat kolom nominal disabled; kiriman 900.000 tampil sebagai masuk otomatis tanpa tombol hapus dari bagian penerima.
- Dua sesi HTTP independen mengisi bulan uji sesuai pemilik. Perubahan penghasilan istri 2.100.000→2.200.000 memperbarui sisa dashboard suami 3.800.000→3.900.000 melalui polling tanpa reload. Kiriman internal tetap tidak menambah pengeluaran 25.000.
- Salin Januari ke Februari membawa rencana/nominal sendiri, tanpa pengeluaran, kiriman nyata atau gambar. Pos uji yang baru diketik dapat dikonfirmasi dan dihapus setelah autosave tanpa konflik versi palsu.
- Render aplikasi React/build lokal diperiksa desktop 1280×900 serta ponsel 390×844. Pada 320 px, nominal maksimum 1.000.000.000.000 tetap di dalam lebar halaman: scrollWidth=clientWidth=305. Nilai dikembalikan sesudah uji.
- Browser mengonfirmasi font Plus Jakarta Sans dimuat dan dipakai pada kolom nominal; animasi bagian bernama view-enter, durasi 0,16 s.
- Mode pengembangan sempat mengalami gangguan hot reload ketika seluruh berkas dirapikan. Reload memulihkan data, lalu pemeriksaan akhir beralih ke build lokal yang tidak memakai HMR. Ini tidak dianggap bukti hilangnya data tersimpan.

## Backup dan batas berkas publik

SQL serta dua gambar ilustrasi berhasil dibackup, dipulihkan ke D1/R2 lokal terpisah, lalu jumlah catatan/trigger dan checksum gambar dicocokkan. Sesi pulihan dicabut. Pemeriksaan diulang setelah memperketat kecocokan manifest terhadap seluruh gambar siap dalam SQL, dan lulus. Database aplikasi tidak ditimpa oleh restore check.

`node scripts/check-local-build.mjs` lulus pada build yang disajikan: manifest, service worker, CSP/nosniff/no-store, API tanpa sesi dan pemisahan workbook/secret/berkas akun dari aset web. `npm run check:public` memeriksa kandidat kode/aset/dokumen dan tidak menemukan nilai secret/kredensial lokal atau workbook. Ini bukan audit riwayat Git atau bukti publikasi GitHub.

Review source independen menutup dua temuan tentang versi hapus setelah autosave dan cakupan gambar saat restore. Review tersebut tidak memakai browser atau mengklaim audit visual/produksi independen.

## Belum dinyatakan lulus

- Batas CPU/memori dan hash pada Worker Cloudflare nyata, R2 remote, subscription/kuota dan pemulihan layanan jarak jauh.
- Sinkronisasi suami–istri pada dua perangkat fisik di jaringan internet, instalasi PWA pada perangkat tujuan, dan perilaku pembaruan/kurangi animasi dengan pengaturan OS nyata.
- Seluruh kombinasi operasi antarperangkat dan bentuk jawaban hilang, perubahan status offline melalui OS, serta pemulihan draf setelah tab ditutup. Skenario terarah koneksi putus, jawaban hilang, sesi habis dengan nominal/gambar dan pembaruan sudah diuji melalui layar pada tahap 7.
- Pembersihan objek pada R2 remote dan gambar besar pada batas CPU paket Cloudflare. Fault injection R2.put/finalisasi D1 dan hapus induk di sela upload sudah lulus pada runtime lokal terisolasi, bukan remote.
- Audit keamanan aplikasi menyeluruh atau pentest, audit aksesibilitas lengkap dan pengukuran performa ponsel fisik.
- Deployment dan publikasi repositori baru. Ini masih memerlukan tahap dan persetujuan pemilik sesuai alur kerja.

Perintah untuk pengulangan terarah ada di README dan BACKUP.md. Jangan mengulangi pemeriksaan yang lulus tanpa perubahan atau risiko baru; lengkapi celah bukti pada tahap pengujian berikutnya.
