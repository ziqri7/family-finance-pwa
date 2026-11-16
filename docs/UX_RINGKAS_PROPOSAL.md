# Rancangan UX ringkas dan bukti bersama

Status 16 November 2026 — preview dan rancangan penyimpanan disetujui pengguna. Implementasi telah diuji pada data contoh, menunggu persetujuan rilis. Acuan kode `718103ba876a17b580b88cd34797df9a922787f8`, skema 0001–0005, backup format 5. Preview berada di `private/ux-preview`, http://127.0.0.1:5208.

## Hasil yang dituju

Satu penyerahan uang dapat berisi uang makan, bensin istri, tunjangan istri dan tabungan. Pengirim memeriksa semua nominal dalam satu layar, menambahkan JPG/PNG opsional, lalu mengonfirmasi sekali. Satu bukti terlihat dari rincian seluruh pos terkait dan muncul sekali di galeri. Pemilik tetap bisa mencatat pembayaran sendiri seperti listrik dan pengeluaran tambahan.

Beranda membuka bagian akun aktif. Navigasi utama Beranda, Catat, Bukti. Saya/Pasangan/Keluarga mengganti konteks. Pengaturan akun, sandi, tambah/ubah/hapus pos, pemasukan kedua akun, bulan/salin bulan, rincian tanggal serta laporan tahun tetap dapat ditemukan melalui kontrol berlabel atau rincian terkait. Grafik bulanan/tahunan berada pada Keluarga. Font dan bahasa visual mengikuti Caku yang sudah dipilih.

## Dasar dari aplikasi saat ini

| Sumber | Temuan | Implikasi rancangan |
| --- | --- | --- |
| `worker/postings.ts`, `src/lib/batch-postings.ts` | Konversi lama memiliki pemeriksaan versi dan riwayat. Penandaan cepat mengirim beberapa permintaan terpisah. | Satu penyerahan bersama memerlukan operasi backend atomik yang memeriksa semua pos sebelum menyimpan. |
| `worker/db/postgres.ts` | `DB.batch` memakai transaksi Neon dan advisory lock keluarga sebelum statement data. | Gunakan adapter dan lock yang sama. Validasi yang menentukan transaksi harus berada dalam transaksi tersebut. |
| `shared/ledger.ts`, VIEW `effective_postings` | Nominal actual pada budget_items merupakan sumber catatan. Kiriman masuk diturunkan dari pengirim. | Kelompok menjadi hubungan/pengorganisasian pos, bukan sumber nominal kedua dalam ledger. |
| `worker/attachments.ts`, migrasi 0005 | Bukti actual mengacu pada satu pos, kuota dan penghapusan mengikuti induk. | Bukti bersama memerlukan induk kelompok sendiri dan guard yang sesuai. Menyalin gambar ke empat pos menambah duplikasi/risiko penghapusan. |
| `worker/finance.ts`, `use-finance.ts` | Nominal pos saat ini tersimpan lewat antrean per kolom. Salin bulan mengosongkan nominal. | Isian dalam layar penyerahan harus menjadi draf sampai satu konfirmasi. Jalur lama harus menolak edit yang melewati kelompok. |
| `worker/http.ts` | JSON umum dibatasi 16 KiB. | Payload maksimal 200 pos perlu batas khusus yang terukur, diusulkan 64 KiB khusus endpoint kelompok, dengan validasi jumlah/ukuran ketat. |
| `scripts/neon-backup.mjs`, cleanup, laporan tahun | Backup format 5 mencakup 10 tabel keuangan/kredensial dan tiga koleksi bukti. | Perlu format backup baru, restore dan cleanup untuk tabel baru. |

Riset ini membaca sumber lokal. Tidak membaca nominal keluarga dari database produksi atau memodifikasi workbook.

## Arti tabungan dan status

Hilangkan pilihan **Disisihkan** dari pengisian rutin. Pos tetap bernama **Tabungan**. Tujuan uang ditetapkan melalui kelompok, sehingga pengguna tidak memilih jenis untuk setiap pos setiap bulan.

- **Ke pasangan** mengklasifikasikan seluruh pos yang dikonfirmasi sebagai kiriman internal, termasuk tabungan yang ikut diserahkan. Penerima melihat satu penyerahan beserta rincian posnya.
- **Pembayaran** dipakai untuk uang yang dibayarkan, misalnya listrik, air dan Wi-Fi. Pembayaran terpisah boleh tetap satu pos/satu resi. Beberapa pos dapat memakai bukti kelompok bila memang dibayar bersama.
- **Tabungan sendiri** tetap dapat dicatat lewat pos Tabungan dengan tindakan **Sudah ditabung**. Klasifikasi teknis `reserve` tetap digunakan untuk membedakan uang tabungan dari belanja. Pengaturan sekali ini berada pada rincian tujuan pos, di luar formulir nominal rutin.

Nama pos tidak menentukan jenis secara otomatis. Pada pengaturan awal kelompok, pemilik memilih tujuan sekali. Saat label diubah, tujuan tetap. Tabungan lama berjenis reserve mempertahankan hitungannya sampai pemilik secara eksplisit mengoreksi tujuan. Tabungan yang dikirim ke pasangan menjadi internal setelah peninjauan pemilik. Tidak membuat fitur rekening tabungan, penarikan dana atau saldo bank.

Status ringkas yang ditampilkan adalah **Belum**, **Sudah diserahkan**, **Sudah dibayar**, atau **Sudah ditabung** sesuai tujuan. Penerima melihat **Dari pasangan** dengan rincian yang berasal dari pengirim. Tidak memerlukan tombol konfirmasi penerimaan kedua.

## Perhitungan dan contoh penerimaan

| Angka | Definisi |
| --- | --- |
| Dana pemilik | Pemasukan sendiri + kiriman masuk efektif |
| Sisa dibagi pemilik | Dana pemilik − pembayaran sendiri − kiriman keluar − tabungan sendiri |
| Pemasukan keluarga | Total pemasukan eksternal kedua pemilik |
| Belanja keluarga | Total pembayaran eksternal kedua pemilik, termasuk Catat tambahan yang aktif |
| Sisa keluarga | Pemasukan keluarga − belanja keluarga − tabungan sendiri kedua pemilik |

Kiriman keluar suami dan kiriman masuk istri berasal dari pos sumber yang sama. Total kelompok hanya hasil penjumlahan rincian, tidak dimasukkan kembali ke ledger. Bukti tidak memiliki dampak nominal. Laporan tahunan memakai sumber efektif yang sama dan aturan kelengkapan yang sudah berlaku. Nominal kosong tetap berbeda dari sengaja nol. Jumlah memakai safe integer dan batas nominal aplikasi yang sudah ada.

Contoh data ilustrasi dengan pemasukan suami Rp3.750.000 dan pemasukan istri Rp0 yang memang diisi nol:

| Keadaan | Sisa suami | Sisa istri | Belanja keluarga |
| --- | ---: | ---: | ---: |
| Sebelum penyerahan dan pembayaran | Rp3.750.000 | Rp0 | Rp0 |
| Empat pos Rp3.300.000 diserahkan | Rp450.000 | Rp3.300.000 | Rp0 |
| Listrik Rp450.000 dibayar suami | Rp0 | Rp3.300.000 | Rp450.000 |
| Istri belanja Rp100.000 | Rp0 | Rp3.200.000 | Rp550.000 |

Pesan **Semua uang sudah dibagi** berlaku untuk bagian pemilik yang lengkap dan sisa nol. Pada contoh itu keluarga masih mempunyai dana di bagian istri. Pos/milik pasangan yang belum diisi tidak diperlakukan sebagai nol. Draf belum dikonfirmasi belum menghasilkan kiriman/belanja.

## Model penyimpanan yang diusulkan

Migrasi additive berikutnya, calon `0006_allocation_groups`. Nama dapat disesuaikan saat implementasi tanpa mengubah aturan berikut.

| Tabel | Isi utama | Aturan |
| --- | --- | --- |
| `allocation_groups` | id, period_id, owner_id, label, posting_kind, recipient_owner_id opsional, status draft/posted/cancelled, tanggal opsional, version, position, timestamps | Satu bulan/satu pemilik. Internal wajib penerima pasangan. Tujuan ditetapkan sekali. Tidak menyimpan total finansial terpisah. |
| `allocation_group_items` | group_id, item_id, position, posted, retired_at | Pos non-income milik pemilik/bulan yang sama. Satu pos mempunyai paling banyak satu keanggotaan aktif. Pos posted memakai jenis/tanggal kelompok dan menjadi sumber nominal pada budget_items. |
| `allocation_group_operations` | operation_id, owner_id, group_id, action, payload_hash, resulting_version, receipt, created_at | Catatan idempotensi immutable untuk operasi yang sudah diterapkan. Receipt menyimpan hasil operasi untuk retry/audit, bukan sumber perhitungan saldo. |
| `group_attachments` | metadata bukti yang sudah dipakai aplikasi + group_id, confirmed_group_version | Satu objek privat per gambar. JPG/PNG, maksimal 5 MiB/gambar dan 10 gambar pending/ready per kelompok. Pemilik mengunggah/menghapus, dua akun membaca. |

Kelompok mengikuti struktur bulanan. Salin bulan menggandakan susunan kelompok dan memetakan ke ID pos baru, dengan status draft, posted=false, seluruh nominal/tanggal/bukti kosong. Tidak perlu tabel layanan/template global baru. Batas pos tetap 200 per pemilik/bulan. Jumlah kelompok dibatasi oleh pos aktifnya agar struktur kosong tak terbatas tidak dapat dibuat.

Kelompok hanya memiliki pos dari satu tujuan. Untuk penyerahan contoh, empat pos menjadi internal secara eksplisit setelah konfirmasi. Tujuan campuran dipisahkan pada pengaturan awal, sehingga layar nominal rutin tidak menampilkan pilihan jenis tiap baris.

Pemilik boleh mencentang sebagian pos. Anggota yang belum pernah dikonfirmasi tetap kosong dan tidak dihitung. Kartu menampilkan jumlah pos yang selesai dan yang belum. Melengkapi kelompok memperbarui penyerahan yang sama, dengan ringkasan total terbaru. Satu kelompok bulanan mewakili satu penyerahan/pembayaran yang dapat dikoreksi. Pengiriman tambahan yang berbeda tetap dapat memakai Catat/rincian yang sudah tersedia dan dihitung terpisah, tanpa otomatis digabung dari label yang mirip.

## Penyimpanan atomik, retry dan perangkat lain

Endpoint yang diusulkan:

| Operasi | Perilaku |
| --- | --- |
| `POST /api/periods/:id/allocation-groups` | Membuat susunan kelompok milik sesi, memvalidasi seluruh anggota dan tujuan. |
| `GET /api/allocation-groups/:id` | Membaca rincian bersama. Pemilik memperoleh review yang dapat diedit, pasangan mendapat data baca. Tidak membocorkan object_key. |
| `PATCH /api/allocation-groups/:id` | Mengoreksi label/urutan/keanggotaan dengan versi. Melepas anggota posted memerlukan alur koreksi finansial, bukan edit susunan biasa. |
| `POST /api/allocation-groups/:id/commit` | Menyimpan seluruh rincian terpilih secara atomik dengan operation_id, expected group version, revision periode dan versi pos yang ditinjau. |
| `POST /api/allocation-groups/:id/cancel` | Membatalkan nominal yang berasal dari penyerahan ini dengan versi/operation_id dan konfirmasi dampak. Riwayat/bukti lama tidak hidup kembali. |
| `/api/allocation-groups/:id/attachments`, `/api/group-attachments/:id[/content]` | Reservasi, unggah, baca dan hapus melalui pola attachment yang sudah ada. |

Pemilik selalu dari sesi backend. ID penerima, bulan dan tujuan divalidasi ulang di database. Pasangan tidak dapat membuat, mengoreksi, membatalkan atau mengunggah atas kelompok pengirim. Kedua akun membaca kelompok dan buktinya melalui otorisasi keluarga yang sudah ada.

1. Antrean isian lama diselesaikan sebelum membuka review. Draf nominal kelompok tidak dikirim ke endpoint autosave per pos. Berpindah bulan/keluar dengan draf meminta pilih lanjutkan atau buang. Draf tidak dinyatakan tersimpan sebelum server mengonfirmasi.
2. Backend menjalankan fungsi transaksi khusus melalui adapter Neon yang sama. Ambil lock keluarga, periksa operation_id/payload, pemilik, status, seluruh versi dan relasi lebih dahulu. Salah satu prasyarat gagal menyebabkan seluruh operasi gagal sebelum nominal berubah.
3. Untuk pos legacy, validasi ringkasan anak dan bukti, lalu lakukan cutover yang sama seperti aturan 0005 dalam transaksi kelompok. Riwayat yang ditinjau ditandai superseded secara eksplisit. Untuk actual, ubah sumber yang sama. Tambahan manual sesudah konversi tetap dihitung.
4. Simpan keanggotaan, seluruh nominal/jenis/tanggal/versi, status kelompok dan receipt operasi dalam transaksi yang sama. Pemeriksaan revision dilakukan sebelum perubahan yang menaikkan revision, sehingga pos pertama tidak membuat pos kedua gagal terhadap revisi sendiri.
5. Jawaban hilang setelah commit diatasi dengan operation_id yang sama dan payload hash yang sama. Balas receipt asli serta keadaan terkini tanpa menulis ulang. Operation_id sama dengan payload berbeda ditolak. Retry lama sesudah koreksi lain tidak boleh menimpa koreksi itu.
6. Salah satu pos berubah dari perangkat lain menghasilkan konflik untuk seluruh kelompok. Tampilkan satu pesan **Data berubah, periksa nominal terbaru**, muat ulang review tanpa menimpa draf pengguna diam-diam. Sesi habis atau offline menghentikan penulisan dan mempertahankan draf selama tab tersedia.

Fungsi transaksi harus melempar kegagalan di database. Memeriksa hasil statement di JavaScript sesudah DB.batch selesai tidak cukup untuk membatalkan statement yang sudah terlanjur commit. Semua nilai masuk melalui validasi dan parameter SQL, bukan nama tabel/kolom dari klien.

Jalur edit nominal, metadata, hapus pos dan posting lama harus menolak perubahan langsung untuk anggota posted. Klien diarahkan ke koreksi kelompok. Label/urutan yang tidak memengaruhi uang tetap dapat diedit melalui jalur yang dijaga. Guard database mempertahankan kesesuaian kelompok dan pos. Klien PWA lama memperoleh UPDATE_REQUIRED pada penulisan yang tidak kompatibel.

Guard catatan tambahan juga perlu disesuaikan secara terarah. Saat ini expenses memerlukan kind allocation dan transfers memerlukan kind transfer_out. Pada pos actual yang tujuannya berubah lewat kelompok, validasi memakai posting_kind efektif dan kepemilikan/bulan, sedangkan pos legacy mempertahankan aturan kind lamanya. Dengan begitu kiriman tambahan tetap sah pada anggota internal yang dahulu berjenis allocation, dan pembayaran tambahan tidak salah masuk sebagai kiriman. Tambahan manual dibuat melalui rincian kelompok yang sesuai, mempunyai identitas sendiri dan tidak memperbarui total penyerahan sumber. Perubahan guard ini memerlukan uji regresi tersendiri.

## Bukti bersama dan koreksi

Saat pemilik memilih foto sebelum Serahkan, foto tetap draf lokal. Sesudah transaksi finansial berhasil, aplikasi mereservasi dan mengunggahnya satu kali ke kelompok. Penyimpanan objek dan transaksi SQL memiliki tahapan berbeda. Jika gambar gagal terkirim, penyerahan tetap tercatat dan layar menampilkan **Bukti belum terkirim · Coba lagi**. Retry foto tidak mengirim penyerahan baru. Jika tab ditutup sebelum unggah selesai dan file lokal hilang, pemilik memilih foto kembali pada kelompok yang sudah tercatat.

Status pending/ready/failed/deleting, pengecekan checksum/decode/dimensi, kuota, privasi URL dan cleanup memakai pola existing. Guard unggah memeriksa kelompok masih posted dan versi bukti masih sesuai, termasuk ketika dibatalkan atau dikoreksi saat upload berlangsung. Galeri menggabungkan koleksi bukti dengan ID sumber yang tegas dan menampilkan group_attachments sekali. Rincian tiap anggota menampilkan tautan ke gambar yang sama.

- Koreksi label mempertahankan gambar dan hubungan.
- Koreksi nominal/keanggotaan/tanggal mempertahankan identitas kelompok. Tampilkan total lama→baru serta satu pilihan apakah bukti lama masih sesuai. Bukti yang dikonfirmasi kembali mencatat versi kelompok terbaru. Bukti yang belum dikonfirmasi diberi status **Bukti sebelum koreksi** dan tidak ditampilkan sebagai bukti jumlah terbaru.
- Melepas pos yang sudah posted harus secara eksplisit mengosongkan nominal sumber pos yang dilepas dalam transaksi yang sama. Catatan manual tambahan pada pos tetap ada dan dampaknya terlihat pada ringkasan.
- Membatalkan seluruh penyerahan mengosongkan nominal anggota yang berasal dari kelompok dan menonaktifkan akses bukti kelompok melalui deleting, atomik di database. Cleanup objek dapat diulang. Histori superseded tetap histori.
- Bukti lama yang melekat per pos/expense/income tetap dapat dibaca. Tidak dipindah, diduplikasi, atau dihapus hanya karena pos masuk kelompok. Rincian menampilkan jumlah bukti historis bila ada.

## Peralihan data lama

Migrasi menambah tabel/guard dan memperbarui kontrak aplikasi. Tidak mengelompokkan pos keluarga berdasarkan nama atau mengubah jenis/nominal lama saat deployment. Pos tanpa kelompok tetap dapat dibaca dan diubah lewat alur yang sesuai.

Pemilik memilih **Atur kelompok** sekali, memilih pos dan tujuan, lalu melihat review nominal, catatan lama dan bukti terkait dalam satu layar. Total catatan lama menjadi acuan konversi seperti alur sekarang. Anggota actual mempertahankan jumlah kecuali koreksi eksplisit. Seluruh perubahan jenis/nominal saat konfirmasi dilakukan atomik dan menunjukkan dampak sisa pengirim/penerima. Bukti per pos tetap historis; gambar baru dapat ditambahkan sebagai bukti bersama.

Kelompok bulan berikutnya berasal dari salin struktur yang sudah ada. Pengguna baru memperoleh struktur template yang valid, sedangkan pengelompokan empat pos contoh dipilih pada pengaturan awal. Tidak menaruh label atau nominal pribadi dalam template publik.

## Backup, pengujian dan urutan implementasi

Usulan backup format 6 mencakup empat tabel baru, seluruh objek group_attachments yang wajib disimpan, serta ketiga koleksi lama. Restore memvalidasi semua hubungan dan checksum pada cabang kosong yang berbeda dari produksi. Format 5 tetap dikenali untuk pemulihan versi lamanya atau jalur upgrade yang diuji. Migrasi 0001–0005 dipertahankan byte-identik.

| Urutan | Pekerjaan | Bukti selesai |
| --- | --- | --- |
| 1 | Skema/guard/fungsi atomik dan idempotensi | Uji dummy satu anggota gagal→nol perubahan, balasan hilang→satu operasi, retry lama→koreksi baru utuh, dua akun bersamaan. |
| 2 | API/ledger/salin bulan dan peralihan legacy | Total pribadi/keluarga dan laporan tahun cocok, pos tambahan tidak tersupersede, kelompok tujuan tidak campur, copy nominal/tanggal/bukti kosong. |
| 3 | Bukti kelompok/galeri/cleanup/backup | Satu objek dibaca dari empat pos, galeri sekali, owner/anonim ditolak sesuai izin, cancel/koreksi saat upload aman, restore seluruh gambar termasuk histori. |
| 4 | UI sesuai preview | Mobile dan desktop, tiga menu, dua akun, seluruh fitur lama dapat ditemukan, draf/conflict/offline, nol vs kosong, angka panjang, bukti gagal coba ulang. |
| 5 | Persiapan rilis | Instalasi bersih, build, suite relevan, scan kode publik, paket review. Persetujuan penayangan tersendiri setelah bukti tersedia. |

Sebelum produksi, backup format 5 dengan kode kompatibel skema lama, terapkan migrasi saja, bandingkan nilai lama/kredensial/sesi, deploy paket yang diuji, lalu backup format 6 dan verifikasi. Tanpa seed/init akun atau perubahan sandi. Pengujian tulis memakai cabang dummy; pemilik mengelompokkan data keluarga sendiri setelah rilis.

## Keputusan untuk persetujuan implementasi

Setujui satu penyerahan atomik dengan nominal tetap bersumber pada pos, bukti privat melekat pada kelompok, koreksi berbasis versi dan idempotensi, serta pengaturan tujuan sekali. Hilangkan Disisihkan dari formulir rutin dan pertahankan arti tabungan lama di penyimpanan. Data lama dikelompokkan melalui review pemilik, salin bulan membawa struktur kosong. Implementasi/pengujian dilakukan pada data contoh sebelum meminta persetujuan rilis.

Untuk tahap implementasi ini, rekomendasi model GPT-6.1 Sol dengan penalaran High untuk transaksi, konkurensi, bukti dan migrasi. Pemilihan level dilakukan pengguna pada aplikasi. Rancangan ini tidak mengklaim pergantian model/level telah terjadi.
