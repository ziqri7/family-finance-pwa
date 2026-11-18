# Satu catatan keluarga dan bukti kolektif mandiri

Status 18 November 2026 — arah produk, preview dan rancangan penyimpanan disetujui. Implementasi/uji serta rilis produksi mendapat persetujuan terpisah; penayangan diverifikasi pada 18 November 2026. Acuan kode `6e5273ce7b1b4e72daf855cda7e6453cd4d77e50`, skema 0001–0006, backup format6. Preview data contoh di `private/family-preview`, http://127.0.0.1:5210.

## Keputusan pengguna

1. Satu buku keluarga dipakai dua akun. Masing-masing boleh menambah catatan. Ubah/hapus hanya oleh pembuat catatan.
2. Ringkasan utama menunjukkan pembagian seluruh pemasukan, termasuk tabungan. Sisa belum dibagi dapat menjadi0 sesudah seluruh uang dialokasikan.
3. Seluruh pos saat ini memakai mode biasa. Rincian pemakaian dapat diaktifkan perpos melalui pengaturan saat diperlukan, termasuk untuk pos baru.
4. Pemakaian adalah rincian dari suatu alokasi, sehingga tidak menambah total pembagian utama. Pemakaian melebihi jatah ditolak sampai alokasi ditambah.
5. Penambahan alokasi memerlukan dana tersedia. Kurangi pos lain atau tambah pemasukan dahulu ketika sisa0. Penurunan alokasi tidak boleh membuat jatah lebih kecil daripada pemakaian yang masih tercatat.
6. Bukti kolektif hanya menghubungkan satu gambar ke beberapa pos. Tidak mengubah nominal, tujuan uang, status alokasi, atau membuat pemasukan ke akun istri.
7. Navigasi rutin Beranda dan Bukti. Rincian pemakaian hanya muncul pada pos yang mengaktifkannya. Laporan keluarga tidak mensyaratkan anggaran terpisah untuk istri.

Ini perubahan keputusan produk dari alur kiriman internal dan dua anggaran pemilik sebelumnya. Semantik baru berasal dari keputusan pengguna, bukan rumus tambahan dari workbook. Keu.xlsx tidak diedit atau diimpor ulang.

## Masalah pada implementasi sekarang

| Sumber                                        | Perilaku yang ditemukan                                                                             | Perubahan yang diperlukan                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/ledger.ts`                            | Internal mengurangi pengirim dan menambah penerima. Family total hanya menghitung external/reserve. | Primary ledger menjumlahkan alokasi keluarga satu kali, termasuk item lama yang berjenis internal/reserve. Akun menunjukkan pembuat, bukan dompet penerima. |
| `worker/reports.ts`                           | Kelengkapan bergantung dua baris budgets pemilik dan belanja external.                              | Kelengkapan satu buku, pemasukan/nominal/review seluruh catatan keluarga. Rasio memakai total pembagian.                                                    |
| `worker/finance.ts`, schema/composite FK      | Pemilik item harus sama dengan pemilik expense. Akun lain tidak dapat mencatat pemakaian pos itu.   | Pemakaian memiliki pembuat sendiri dan referensi ke pos keluarga, dengan izin tambah kedua akun dan izin koreksi pembuatnya.                                |
| `allocation_groups`, `apply_allocation_group` | Kelompok menyimpan transaksi, mengubah nominal/jenis/tanggal dan memicu kiriman.                    | Pisahkan hubungan bukti dari operasi keuangan. Endpoint kelompok finansial lama tidak dapat dipakai pada alur baru.                                         |
| `group_attachments`, tiga koleksi bukti lain  | Gambar sudah privat dengan validasi, checksum, kuota dan tombstone.                                 | Pertahankan objek/URL lama, gunakan pola yang sama untuk bukti pemakaian.                                                                                   |
| `DB.batch`                                    | Advisory lock keluarga dan transaksi sudah tersedia.                                                | Gunakan untuk guard dana dan kuota pemakaian, sebelum perubahan apa pun.                                                                                    |

## Perhitungan yang berlaku

Untuk bulan yang dipilih:

- Pemasukan keluarga = semua pos pemasukan aktif kedua pembuat.
- Sudah dibagi = jumlah nominal alokasi aktual aktif, masing-masing sekali. Jenis lama external/internal/reserve tidak mengubah angka ini.
- Sisa belum dibagi = pemasukan keluarga − sudah dibagi.
- Pemakaian pos = jumlah rincian pemakaian aktif yang mengacu pada pos tersebut.
- Sisa jatah pos = nominal alokasi − pemakaian pos.
- Bukti, kelompok bukti dan pemakaian tidak ditambahkan lagi ke sudah dibagi.

Catatan tambahan lama yang belum dipetakan ditampilkan sebagai sumber kompatibilitas terpisah dan tetap dihitung seperti sebelumnya sampai ditinjau. Tidak ditebak sebagai rincian atau dihapus demi membuat total terlihat cocok.

Contoh ilustrasi pemasukan Rp8juta dan seluruh alokasi Rp8juta. Menempelkan satu gambar pada4pos tetap menghasilkan Rp8juta sudah dibagi dan sisa0. Mengaktifkan rincian Makan Rp2juta kemudian mencatat pemakaian Rp100ribu menghasilkan sisa jatah Rp1,9juta. Total pembagian tetap Rp8juta. Menaikkan alokasi makan Rp100ribu ditolak saat dana tersedia0. Menambah pemasukan Rp100ribu atau mengurangi pos lain dahulu memungkinkan koreksi itu.

Nol tetap nominal yang sengaja diisi. NULL tetap belum diisi. Semua jumlah berupa rupiah bulat, memakai batas nilai dan safeSum yang ada. Tidak mengklaim saldo rekening atau melakukan transfer uang.

## Skema yang diusulkan

Migrasi additive calon0007, dengan dua tabel baru dan perubahan metadata terarah. Migrasi0001–0006 tidak diubah.

| Area                          | Usulan                                                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budget_items`                | Tambah `tracking_enabled` defaultfalse (input API boolean; snapshot dan penyimpanan0/1 mengikuti pola posted) dan versi konfigurasi bila row_version tidak cukup. owner_id tetap sebagai pembuat immutable dari catatan. API/UI menyebutnya pembuat. Nominal tetap sumber tunggal. |
| `usage_entries` baru          | id, period_id, item_id, owner_id sebagai pembuat, tanggal, keterangan, amount, version, created_at/updated_at/deleted_at. FK ke item keluarga/bulan yang sama, tanpa mewajibkan pembuat sama dengan item.                                                                          |
| `usage_attachments` baru      | Pola metadata gambar yang sudah ada, dengan usage_entry_id dan owner_id sebagai pembuat. Koleksi kelima, kuota/validasi/cleanup/otorisasi sama.                                                                                                                                    |
| `allocation_groups`           | Tambah purpose untuk membedakan metadata lama dan bundle bukti baru. Kolom jenis/recipient keuangan menjadi nullable pada purpose evidence; constraint baru mempertahankan bentuk baris lama. UI hanya menyebut Bukti bersama.                                                     |
| `allocation_group_items`      | Hubungan bukti. Satu pos boleh terkait lebih dari satu bundle, sehingga indeks unique active_group_item diganti indeks lookup. Simpan versi/nominal/label saat pengaitan untuk konteks gambar sebelum koreksi, tanpa menjadi sumber saldo.                                         |
| `group_attachments`           | Tetap mengacu ID bundle yang sama. Objek dan URL gambar lama dipertahankan. Gambar diunggah setelah metadata tautan tersimpan; retry hanya mengulang unggahan.                                                                                                                     |
| `allocation_group_operations` | Receipt keuangan lama tetap immutable sebagai histori. Tidak dipakai untuk menghitung saldo baru. ID bundle/unggahan tetap idempotent.                                                                                                                                             |
| `budgets`, `periods`          | Tetap menjadi struktur relasi kompatibilitas. Satu periods adalah satu buku bulanan. Slot budgets untuk creator dapat dibuat backend saat akun menambah pos, tanpa layar Buat anggaran istri. Laporan tidak menghitung banyaknya slot akun.                                        |

Pemakaian memakai tabel baru agar catatan manual lama tidak diam-diam berubah arti. Catatan lama serta bukti expense/income/allocation/group tetap tersedia untuk peninjauan dan histori.

## Hak akun dan struktur bulan

- Kedua akun membaca satu daftar keluarga yang sama, pemasukan dan alokasinya. Tampilan Saya/Pasangan sebagai dompet keuangan dihapus dari alur rutin. Nama pembuat terlihat pada rincian yang membutuhkan izin.
- Akun B boleh menambahkan usage_entry pada pos buatan A jika pelacakan aktif. B menjadi pembuat usage_entry. Hanya B yang mengubah/menghapus rincian tersebut. Hanya A yang mengubah nominal/nama/pelacakan pos asal.
- Bukti bersama mempunyai pembuat sendiri. Kedua akun boleh menempelkan bukti pada pos keluarga, termasuk pos buatan pasangan. Hanya pembuat bukti yang mengubah/menghapus bundle atau gambar miliknya.
- Perubahan hubungan bukti tidak memberi izin mengubah pos sumber. Owner/pembuat berasal dari sesi, tidak dipercaya dari payload.
- Salin bulan membawa seluruh struktur buku, label, mode pelacakan dan urutan. Nominal, tanggal, pemakaian dan gambar kosong. Hak edit pos tetap mengikuti pembuat pos sumber agar menyalin buku tidak memindahkan seluruh hak pasangan kepada penyalin. Simpan asal pos serta copied_by untuk membedakan pembuat isi pos dari akun yang menyalin struktur bulannya. Konfirmasi salin menyebut bahwa hak edit tetap mengikuti pembuat pos. Akun lain dapat menambah pos miliknya sendiri pada buku hasil salin.
- Menambah pos baru oleh istri tidak memerlukan pembuatan anggaran istri terpisah. Data masuk ke periode keluarga yang sama.

## Simpan, batas dana dan konflik

Operasi keuangan baru dijalankan melalui fungsi transaksi dengan lock keluarga yang sudah ada. Validasi kepemilikan, expectedVersion, saldo prospektif dan jumlah pemakaian harus dilakukan di transaksi sebelum UPDATE/INSERT.

1. Mengubah alokasi menghitung total seluruh buku sesudah perubahan. Nilai hanya diterapkan bila tidak melebihi pemasukan dan tidak lebih kecil dari pemakaian pos. Tidak melakukan penurunan sumber dana lain secara otomatis.
2. Mengurangi pemasukan juga memeriksa kecukupan terhadap seluruh alokasi. Dua perangkat yang menambah alokasi memakai dana sisa yang sama hanya dapat menyimpan jumlah yang masih tersedia.
3. Menambah/mengoreksi usage_entry memeriksa pelacakan aktif, item/bulan, pembuat yang berhak serta total seluruh pemakaian pos. Dua akun tidak dapat masing-masing menghabiskan sisa jatah yang sama.
4. Retry create memakai ID stabil dan payload yang sama. Retry edit membaca versi terkini atau hasil yang identik, tanpa membuat catatan kedua. Konflik mengembalikan data terbaru untuk ditinjau, bukan menimpa draf diam-diam.
5. Draf tersimpan di memori seperti sekarang. Login ulang akun yang sama melanjutkan draf; pergantian akun tidak boleh memindahkan hak draf ke akun lain. UI tidak boleh menyatakan tersimpan sebelum jawaban server.
6. Protokol klien dinaikkan untuk penulisan baru. Klien lama ditolak dengan UPDATE_REQUIRED. Rute commit/cancel keuangan kelompok lama tidak dijadikan jalan alternatif yang dapat melewati pemeriksaan dana baru.

Snapshot dan laporan yang berubah makna juga memerlukan kontrak klien baru agar aplikasi lama tidak menampilkan kiriman ke istri atau label belanja dengan definisi baru. Endpoint login/me/aset dan gambar privat tetap dapat diakses sesuai izin untuk memungkinkan pembaruan aplikasi. Gambar melalui tag img tidak diwajibkan mengirim header versi API.

Mode biasa cukup nominal/status selesai dan bukti. Tidak ada formulir pemakaian kedua. Pada mode tracked, rincian dibuka dari pos itu. Menonaktifkan pelacakan menghentikan rincian baru, tetapi catatan pemakaian yang pernah dibuat tetap dapat dibaca sebagai riwayat dan tetap diperhitungkan ketika menurunkan nominal. Tidak menghapus catatan buatan pasangan sebagai efek toggle.

Penghapusan memakai tombstone dan konfirmasi dampak. Penghapusan pos tidak memindahkan kepemilikan atau menghapus rincian/gambar milik pembuat lain. Relasi historis dipertahankan dan diberi konteks pos dihapus. Aturan FK/guard lama perlu disesuaikan terarah untuk kasus baru ini, dengan pengujian izin lintas pembuat.

## Bukti kolektif tanpa perubahan uang

Alur rutin Bukti → Tambah bukti bersama → pilih pos → pilih foto → Simpan bukti. Tidak ada pemilihan Ke istri/Pembayaran/Tabungan dan tidak ada konfirmasi nominal pada layar ini.

- API bundle hanya menerima label opsional, ID pos yang ditautkan, versi yang ditinjau dan metadata gambar. Payload nominal, jenis uang, penerima atau status pembayaran ditolak.
- Seluruh pos harus berasal dari buku bulan yang sama. Pos boleh mempunyai pembuat berbeda. Gambar terlihat satu kali di galeri dan bisa dibuka dari setiap pos terkait.
- Satu foto tidak dikloning ke setiap pos. ID/objek serta validasi JPG/PNG, checksum dan kuota tetap melalui mekanisme privat yang sudah ada.
- Bila nominal pos berubah, bukti tetap tersedia dengan konteks versi saat ditautkan. Jangan menyatakan foto sudah membuktikan nominal terbaru secara otomatis.
- Unggah gagal tidak mengubah uang. Reservasi pending dapat dicoba ulang/dihapus. Hapus bundle menghapus akses gambarnya tanpa membatalkan alokasi. Hapus alokasi tidak menghapus bundle milik pembuat lain; galeri menampilkan konteks historis dari snapshot tautan.
- Bukti bersama yang sudah ada dipertahankan pada ID dan object_key yang sama. Nama seperti Budgeting Istri menjadi label koleksi bukti, bukan rekening penerima.

## Peralihan data lama

DDL mempertahankan nilai nominal, label, creator, versi, status, histori, ID dan objek yang sudah ada. Tidak membuat pemasukan sintetis untuk mengganti transfer. Lakukan perbandingan sebelum/sesudah pada seluruh kolom lama dan objek gambar.

Pada tampilan baru, nominal actual lama berjenis internal/reserve dihitung sekali sebagai pembagian keluarga, tanpa kiriman masuk turunan. Ini perubahan definisi ringkasan yang disetujui, bukan transaksi uang baru. Empat pos dalam satu bukti tidak dihitung lagi melalui total header kelompok.

Semua pos mulai tracking_enabled=false. Tidak memindahkan expenses/transfers lama menjadi usage_entries otomatis. Item legacy berisi nominal tetap ditandai perlu review sebelum dinyatakan sudah dibagi. Peninjauan dapat dilakukan sekaligus untuk satu bulan dengan ringkasan nominal dan gambar.

Catatan tambahan manual yang aktif, bila ada, tetap muncul dan dihitung sebagai tambahan kompatibilitas sampai pengguna memilih alokasi tersendiri atau rincian pemakaian. Mengubahnya menjadi rincian memerlukan tinjauan pembuat, tujuan tracked yang sah dan pemeriksaan jatah. Histori superseded tidak hidup kembali. Hindari deduplikasi berdasarkan nama, nominal atau gambar yang mirip.

Siapkan laporan dampak privat dari snapshot produksi sebelum rilis. Tunjukkan perbedaan definisi total dan daftar catatan yang perlu tinjauan. Foto, nominal keluarga, nama pribadi dan akun tidak dimasukkan dalam dokumen publik atau data dummy. Pengujian konversi pada salinan dummy, bukan data keluarga langsung.

## Laporan bulan dan tahun

Ringkasan memakai satu periode keluarga. Bulan lengkap bila buku tersedia, mempunyai pemasukan, nominal pos aktif terisi dan tidak ada tinjauan peralihan yang belum selesai. Tidak menunggu dua akun membuat anggaran.

Diagram pembagian mencakup seluruh alokasi, termasuk tabungan. Grafik batang membandingkan pemasukan dengan sudah dibagi. Rasio tahun tetap total pembagian dibagi total pemasukan bulan lengkap yang disertakan, bukan rata-rata persentase bulan. Pemakaian tracked hanya rincian pos dan tidak masuk lagi ke grafik pembagian. Bulan belum lengkap tetap ditandai; kosong berbeda dari0.

## Backup dan pelaksanaan

Format backup calon7 mencakup16tabel, metadata tautan bukti baru dan koleksi gambar kelima. Restore memvalidasi creator/pemilik, tautan historis, seluruh checksum dan histori pemakaian. Format6 dipulihkan ke tujuan kosong yang cocok lalu diupgrade melalui jalur yang diuji. Pepper dan kredensial dipertahankan. Backup sebelum0007 memakai kode immutable format6, bukan snapshot yang sudah memerlukan tabel usage.

Urutan kerja setelah persetujuan:

1. Tambah migrasi/guard, ledger bersama dan fungsi keuangan atomik. Uji saldo sisa0, dua penulis, hak pembuat serta rollback.
2. Tambah bundle bukti mandiri dan penggunaan lintas pembuat. Uji bahwa tambah/hapus/ubah bukti sama sekali tidak mengubah nominal atau status pos.
3. Tambah tracking opsional, bukti pemakaian, aturan jatah dan histori. Uji pencegahan hitungan ganda dan pemakaian melebihi batas.
4. Hubungkan UI sesuai preview, salin satu buku, laporan bulan/tahun dan data lama. Pertahankan login/sandi/PWA serta cara pemulihan konflik.
5. Uji lengkap pada dummy, instalasi bersih, restore, render HP/desktop dan pemeriksaan sumber publik. Siapkan paket rilis untuk persetujuan penayangan.

Untuk tahap implementasi ini, model saat ini GPT-6.1 Sol dengan penalaran High sesuai untuk transaksi/migrasi dan pengujian konkurensi. Level penalaran dipilih pengguna di aplikasi; dokumen tidak mengklaim pergantian model atau level sudah terjadi.

## Cakupan tinjauan

Keputusan produk sudah disetujui. Tinjauan arsitektur mencakup penggunaan owner_id sebagai creator, dua tabel usage baru, penggunaan ulang penyimpanan bukti kelompok tanpa operasi uang, pemeriksaan dana/jatah atomik, serta peralihan data lama yang mempertahankan sumber dan gambar. Implementasi dan pengujian memakai dummy. Rilis serta migrasi produksi dimintakan setelah hasilnya tersedia.
