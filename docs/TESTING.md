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
