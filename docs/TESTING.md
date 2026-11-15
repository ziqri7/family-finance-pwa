# Pengujian Financée

## Kandidat gabungan — 16 November 2026

Status: implementasi visual yang disetujui, dashboard tahun dan bukti pemasukan tergabung; belum push/deploy atau migrasi produksi. Bagian kandidat terpisah di bawah adalah arsip dan digantikan status gabungan ini.

- **60 tes lulus, 0 gagal/dilewati** pada suite lengkap dengan dua cabang Neon dummy khusus. Mencakup perhitungan, kepemilikan, API, ganti sandi, persaingan simpan, bukti dua koleksi, migrasi, backup/pemulihan dan laporan tahun. Setelah perbaikan warna kartu/copy, 21 tes unit serta build/typecheck kembali lulus; angka ini tumpang tindih dengan suite lengkap.
- Browser terisolasi → bundel Pages minified → Neon dummy: dua akun login, pos langsung/pemisah ribuan, donut 40/30/20/10, rasio tahunan 58,3% pada fixture awal, unggah pemasukan PNG/JPG oleh kedua pemilik, pengeluaran JPEG, akses pasangan hanya baca, galeri tiga gambar aktual dan logout. Lebar 320/375/390/1366 tidak meluap. Nominal/grafik mengikuti catatan uji yang ditambahkan, bukan gambar statis.
- Capture akhir memastikan tiga thumbnail selesai dimuat, font lokal dan warna nominal kartu suami putih. Render bulan/tahun/pemilik/galeri serta desktop diperiksa. Penjelasan rumus ada dalam dialog info; kosong tetap — dan nol tetap 0.
- Backup/pemulihan data yang dibuat melalui layar: **sembilan tabel dan tiga objek gambar** dipulihkan dan dibandingkan pada cabang restore dummy terpisah. Bukti pribadi tidak dipakai. Tidak mengubah sandi, data November lokal atau workbook.
- Instalasi bersih dari paket sumber: npm ci, build/typecheck dan 21 tes unit lulus. Ketiga belas berkas build identik byte dengan build yang dipakai browser; seluruh migrasi SQL juga identik. Format dan pemeriksaan 114 berkas publik lulus. Nilai akun/sandi/koneksi produksi yang diketahui tidak ditemukan pada sumber atau build. Detektor desain memberi 42 saran palet, radius dan ukuran huruf; tidak ada temuan utama. Pemeriksaan pola ini bukan audit aksesibilitas atau performa menyeluruh.

Belum dibuktikan untuk kandidat ini: upgrade dan endpoint baru pada Cloudflare produksi, pemasangan Safari/iPhone fisik, dua perangkat fisik, beban gambar maksimum pada runtime Cloudflare, audit keamanan/aksesibilitas lengkap. Pengujian versi dasar online di bagian arsip tidak menggantikan verifikasi rilis baru.

## Dashboard tahun — kandidat 15 November 2026

- Worktree terpisah dari produksi8df6152; fitur bukti pemasukan yang ditahan tidak ikut. Tidak ada migrasi database atau secret baru.
- Suite lengkap50 tes lulus,0 gagal/dilewati. Setelah penanganan respons rusak dan keterangan skala diperjelas,19 tes unit/typecheck/build lulus (sebagian tumpang tindih). API Neon nyata pada cabang dummy: dua akun hasil sama, anonim401, tahun tidak valid400, tahun kosong12baris, kelengkapan kedua akun/NULL vs 0, scope tahun, transfer internal tidak menggandakan, soft-delete, serta API tidak menulis data. Perhitungan berbobot7/12 (58,3%), defisit, di atas100 dan overflow integer dibuktikan.
- Browser komponen asli+API mock: viewport320/375/390/1366, nominal/rasio, pilih tahun/bulan, kosong vs0, incomplete,200%,defisit,error/retry,respons200rusak,pergantian tahun cepat dan keyboard lulus. Render desktop/mobile diperiksa langsung. Grafik menggunakan CSS, tanpa pustaka chart baru.
- Browser dengan bundel Pages minified dan Neon dummy: dua akun login, ringkasan12juta/7juta=58,3%, lebar 375 tanpa luapan, perubahan catatan pada Januari saat bulan aktif Februari otomatis memperbarui rasio62,5%, lalu kembali58,3% setelah catatan uji dihapus. Kedua sesi verifikasi logout. Tidak membaca/menulis data produksi atau menggunakan sandi produksi.
- Belum: persetujuan rilis dashboard, push/deploy dan pemeriksaan Cloudflare remote untuk endpoint ini. iPhone fisik/autofill/instalasi fisik tidak diuji. Bukti pemasukan tetap ditahan. Screenshot privat year-preview/mobile.png,desktop.png,e2e-mobile.png; log privat year-e2e-sync.log.

## Bukti pemasukan — kandidat 15 November 2026

Pengguna menyetujui bukti JPG/PNG opsional langsung pada pos pemasukan. Implementasi memakai income_attachments pada Neon dan bucket privat yang sudah ada; backend gambar digunakan bersama dengan pengeluaran. Tidak mengubah hitungan atau menambah pemasukan/realisasi kedua. Calon migrasi0004 belum diterapkan ke produksi; sumber belum dipush/deploy.

Suite lengkap52tes lulus, nol gagal/dilewati. Pemeriksaan khusus terakhir8tes lulus setelah fixture backup ditambah satu gambar pengeluaran (sebagian mengulang suite, bukan60tes unik). Bukti khusus: kedua pemilik dapat unggah PNG/JPG dan melihat bukti pasangan; mutasi pihak lain ditolak; induk wajib income aktif; retry idempotent; revisi bulan naik; gambar rusak/checksum/oversize ditolak; reservasi serentak maksimal10; ID tidak bentrok lintas koleksi; salin bulan tidak membawa gambar; backup format4 memulihkan sembilan tabel dan tiga gambar (dua pemasukan, satu pengeluaran); hapus pos menonaktifkan bukti dan mencabut akses baca.

Browser terpisah memakai komponen asli dan API mock: viewport320/375/1366 tanpa luapan, pilihPNG, respons unggah sengaja diputus lalu retry memakai ID yang sama, preview gambar, pasangan hanya baca, pemilik menghapus, serta tombol pada Budget membuka dialog bukti. Render desktop/mobile diperiksa. Ini bukan pengujian end-to-end UI ke Neon atau ponsel fisik; API ke Neon diuji terpisah dengan data dummy. Build/typecheck/format/check-public lulus. Detektor TSX hanya regex, bukan audit aksesibilitas penuh. Backup lama format3 harus dibuat dengan kode lama sebelum migrasi; sandi dan data produksi belum diubah.

## Perbaikan bulan dan nominal pada HP — dirilis 15 November 2026

Kontrol bulan/tanggal dibatasi dengan box sizing, min/max width dan aturan kontrol WebKit agar mengikuti lebar formulir. MoneyInput dipakai bersama untuk anggaran, pengeluaran dan kiriman: pemisah titik muncul saat mengetik, state tetap digit mentah, dan angka tidak dibulatkan melalui formatter. Penempatan kursor mengikuti jumlah digit; Backspace/Delete di dekat pemisah tetap menghapus digit. Tempelan desimal ambigu ditolak, bukan diubah menjadi nominal lain. Kosong tetap berbeda dari nol.

Build/typecheck, 16 tes unit, format dan check-public lulus. Browser terpisah memakai komponen MonthForm/Budget/MoneyInput asli dengan store contoh tanpa backend: batas kontrol bulan pada 320/375/390/1366, pemilihan bulan, pengetikan satu/sepuluh juta, fokus, hapus pada pemisah, simpan digit mentah, nol/kosong, batas positif/maksimal serta penolakan tempelan desimal lulus. Screenshot ponsel diperiksa langsung. Ini simulasi viewport Chromium, bukan bukti pada Safari/ponsel fisik pengguna. Dirilis setelah persetujuan pemilik, runtime cfbf9f6. Pemeriksaan situs utama berhasil: HTML memuat aset baru, JS/CSS/service worker byte-identik dengan build yang diuji, deployment Pages success, API tanpa sesi tetap401 dan kode backend tidak dilayani sebagai aset. Tidak ada penulisan database atau sandi pada rilis ini. Pengguna perlu memperbarui PWA untuk memuat antarmuka baru.

## Ganti sandi — rilis produksi 15 November 2026

Fitur dirilis ke [Financée](https://financees.pages.dev) setelah persetujuan eksplisit pemilik. Commit runtime b5ba0e6; deployment Pages success. Backup versi 2 dibuat dan diperiksa sebelum migrasi 0003, kemudian dua hash akun awal diinisialisasi tanpa mengganti sandi. Snapshot tujuh tabel keuangan cocok sebelum/sesudah migrasi. PASSWORD_PEPPER terpisah dipasang sebagai secret produksi; preview tetap tanpa secret produksi.

Pemeriksaan HTTP/API pada Cloudflare nyata lulus: frontend dan service worker cocok byte dengan bundel yang diuji; HTTPS/header keamanan/manifest valid; backend tidak dapat diunduh sebagai aset; API dan endpoint ganti sandi tanpa sesi ditolak. Dua akun lama berhasil masuk, membaca data keluarga dan mendapat cookie Secure/HttpOnly/SameSite=Strict host-only. Endpoint ganti sandi menolak input pendek dan Origin asing tanpa menulis hash. Kedua hash/versi akun tetap identik setelah pemeriksaan. Hanya sesi yang dibuat untuk verifikasi yang dikeluarkan.

Backup format 3 sesudah migrasi memuat dua kredensial serta gambar yang diverifikasi dengan checksum. Tiga migrasi tercatat. Data keluarga, sandi, koneksi, kunci dan backup tetap privat. Pergantian sandi sukses/konkurensi/pemulihan tetap dibuktikan memakai akun dummy; sandi produksi tidak diganti untuk tes. Ponsel fisik dan autofill pengelola sandi nyata belum diuji. Catatan kandidat di bawah bersifat arsip dan tidak menggambarkan status rilis terkini.

# Rilis Pages online — 15 November 2026

Rilis berhasil pada Cloudflare Pages production. Pemeriksaan baru: 16 tes unit, typecheck/build, format, dan pemindaian 93 berkas sumber/aset terhadap kredensial produksi lulus. Seluruh blob publik GitHub dibandingkan dengan sumber yang disetujui.

Pengujian pada layanan Cloudflare nyata lulus untuk delapan kelompok alur: HTTPS/header keamanan/manifest/SW/API privat; dua login dan cookie Secure host-only; baca/simpan dua pemilik, penolakan perubahan pasangan serta dua penulis CAS; decode PNG/JPG, checksum, baca pasangan dan penolakan tanpa sesi; kiriman internal; salin rencana bulan sendiri tanpa realisasi/bukti; backup gabungan PostgreSQL dan dua gambar; serta logout yang mencabut kedua sesi. Ini pengujian HTTP/API pada runtime produksi, bukan pengujian interaksi layar dengan ponsel fisik. Keberhasilan login/decode pada sampel tersebut tidak menjadi benchmark seluruh ukuran gambar atau beban layanan.

Backup lengkap disimpan privat, kemudian hanya bulan dummy Maret/April 2000 dan dua gambar uji dihapus. Hash data di luar dua bulan cocok sebelum/sesudah pembersihan. Pemeriksaan akhir: HTTP utama 200, API tanpa sesi 401, deployment success, 20 pos bawaan dan nol bulan/anggaran/pengeluaran/lampiran/sesi uji. Preview tidak memiliki secret produksi. Data November lokal tidak dipindahkan atau diubah.

Pemasangan PWA pada ponsel fisik dan perpindahan data keluarga lokal masih belum dilakukan. Data akun, koneksi, label privat workbook dan backup tidak masuk kode publik. Catatan persiapan di bawah adalah arsip sebelum rilis; pernyataan belum-deploy di bagian arsip digantikan hasil ini.

## Arsip persiapan

# Pengujian integrasi Neon — 14 November 2026

## Penyesuaian Cloudflare Pages

Build advanced mode, 16 tes unit, format dan pemeriksaan publik lulus. Bundel dist/_worker.js diuji pada Worker native dengan koneksi produksi: kedua login/cookie HTTPS, Origin, logout dan S3 privat lulus. Server Pages lokal port 5193 melayani shell/manifest/SW, menolak berkas _worker.js/_routes.json/.vite sebagai aset publik, memerlukan sesi API dan berhasil dua login/baca daftar bulan kosong/logout. Service worker tidak mencache kode backend. API/rumus/UI tetap. Akses remote Pages menunggu otorisasi pages:write; financee.pages.dev belum terbukti tersedia dan belum ada deployment Pages.

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

## Arsip kandidat ganti sandi — sebelum persetujuan rilis 15 November 2026

- Implementasi berada pada branch feature/change-password, belum dipublikasikan atau diterapkan ke produksi. Rancangan disetujui pengguna. Produksi diperiksa baca-saja: masih dua migrasi, belum ada account_credentials/PASSWORD_PEPPER, deployment lama tetap aktif.
- Seluruh suite sebelum dua pemeriksaan tambahan: 43 lulus, nol gagal/dilewati. Pemeriksaan terarah setelah perubahan terakhir backend/backup: 11 lulus, nol gagal/dilewati, termasuk sesi lima kolom yang sudah ada dan penolakan format backup lama. Ini mencakup sebagian tes yang sama, bukan 54 tes unik.
- Native Worker + Neon dummy: sandi lama salah, konfirmasi/ukuran/sandi umum, Origin asing, ID pasangan pada body, transaksi rollback, pencabutan dua sesi sendiri dengan sesi pasangan tetap aktif, login lama ditolak/login baru berhasil, initializer tidak menimpa hash aktif, dua perubahan serentak satu pemenang, login lama tertahan sebelum penyimpanan sesi, batas lima percobaan per akun, backup/pemulihan hash dan penolakan pepper kosong/berbeda.
- Browser terpisah dengan akun dummy: lebar 320/375/1366 tanpa luapan horizontal, font Plus Jakarta Sans, tampil/sembunyikan sandi, konfirmasi, sandi lama salah, respons 200 rusak ditolak sebagai sukses, tombol terkunci saat menyimpan, respons sengaja hilang sesudah commit, login memakai sandi baru, spasi/Unicode tetap utuh, pesan sukses dan keluar, formulir istri, urutan Tab dan Escape. Screenshot privat password-mobile-final.png/password-desktop-final.png diperiksa langsung. Ponsel fisik/autofill pengelola sandi belum diuji.
- Instalasi npm ci dari allowlist bersih dan build lulus. Setup baru dua akun, pergantian sandi melalui bundel Pages minified dan accounts:init CLI lulus; perintah init tidak mengembalikan sandi awal. Pemeriksaan publik dan format lulus. Detektor TSX tidak menemukan pola, tetapi hanya regex; bukan audit aksesibilitas menyeluruh.
- Perbedaan keluaran CSS antara checkout dan instalasi bersih ditemukan saat verifikasi. Pemindaian Tailwind dibatasi ke TS/TSX antarmuka dan index.html dengan source(none), mengikuti dokumentasi resmi. Kedua build kini memiliki aset byte-identik (CSS 25.86 kB, JS 428.67 kB); render akhir diperiksa ulang. Tidak mengubah arah desain.
- Backup baru format 3 menyertakan dua kredensial dan tetap mengecualikan sesi. Pepper disimpan terpisah dari data dan SESSION_SECRET. Backup format 2 hanya dipulihkan dengan prosedur versi lama pada tujuan terisolasi; tidak dipakai untuk menimpa hash aktif. Rollback ke kode login bootstrap dilarang setelah pengguna mulai mengganti sandi.
- Belum: persetujuan rilis fitur baru, backup produksi sesaat sebelum migrasi, migrasi/inisialisasi produksi, pemasangan secret baru, push GitHub dan deployment. Sandi produksi tidak diganti untuk tes. Tidak memindahkan November atau mengubah Keu.xlsx.
