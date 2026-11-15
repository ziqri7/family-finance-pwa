# PRD — family-finance-pwa

Status terkini: paket gabungan 16 November 2026 sudah diimplementasikan, diuji, disetujui dan ditayangkan. Catatan tahap awal di bawah adalah arsip. Beranda memakai donut pembagian alokasi dan batang pemasukan/pengeluaran; tab Tahun berisi rasio berbobot dan batang 12 bulan. Kedua bagian pemilik tetap menyediakan kolom langsung. Galeri Bukti menyatukan lampiran siap dengan filter Semua/Pengeluaran/Pemasukan. Penjelasan panjang dipindahkan ke tombol info tanpa menghilangkan status simpan, kesalahan, atau konfirmasi.

Pembaruan arsitektur yang disetujui: hosting/API tetap Cloudflare, database dan gambar privat memakai Neon milik keluarga yang sama. Instalasi kini memerlukan dua akun layanan. Fungsi dan hitungan MVP tetap; rincian di ARCHITECTURE.md.

Acuan tahap 5, revisi keluarga. Perluasan kebutuhan telah dikonfirmasi dan implementasi lokal tahap 6 tersedia. Hasil serta bagian yang belum diverifikasi ada di [TESTING.md](TESTING.md); dokumen kebutuhan tidak berarti seluruh gerbang produksi lulus. Rincian formula gabungan, transfer dan bukti berada di [REVISI_KELUARGA.md](REVISI_KELUARGA.md) dan menjadi bagian PRD ini.

## Dasar keputusan

- Tahap 1: pos bawaan dari Excel bisa ditambah, diubah, dan dihapus; simpan otomatis; tidak ada impor atau ekspor Excel.
- Tahap 2: struktur dan rumus diperiksa pada sumber lokal. Pemetaan yang memuat nama keluarga disimpan privat dan tidak dipublikasikan.
- Tahap 3: alur satu bulan, pengisian langsung, data dua akun bersama, serta penyelesaian perubahan bersamaan.
- Tahap 4: pengguna menyatakan menyukai contoh interaktif dan meminta lanjut. Bentuk pengisian langsung tetap menjadi acuan fungsi. Status pada contoh masih simulasi, bukan bukti penyimpanan server.
- Keputusan visual terbaru: pengguna memilih adaptasi Caku dengan font baru dan animasi ringan. Arah ini menggantikan Editorial A serta alternatif GoPay/Flip sebagai acuan utama; rincian pada DESIGN.md dan REFERENSI_CAKU.md. Keputusan arsitektur dan lingkup fungsi tidak berubah.

## Tujuan dan pengguna

Suami dan istri memiliki anggaran serta pengeluaran masing-masing. Keduanya melihat seluruh data keluarga, tetapi hanya mengubah bagian miliknya. Dashboard awal menggabungkan kedua bagian tanpa menghitung transfer internal dua kali. Setiap keluarga memasang salinan sendiri di Cloudflare dan Neon. Tidak ada layanan akun pusat.

## Lingkup MVP

| Bagian | Perilaku yang harus tersedia |
| --- | --- |
| Masuk | Dua akun disiapkan pemilik; tanpa pendaftaran publik atau pengiriman email |
| Bulan | Pilih tahun dan bulan, buat bulan baru, buka bulan yang telah ada |
| Pos bawaan | Nama dan urutan mengikuti template privat hasil pemetaan; nominal bulan baru kosong |
| Pengisian | Edit nominal dan nama langsung pada baris; selesai mengisi memicu simpan otomatis |
| Pos tambahan | Tambah pemasukan/alokasi; jenis dipilih melalui kelompok tempat menambah pos |
| Hapus | Konfirmasi nama pos dan bulan; penghapusan hanya memengaruhi bulan aktif |
| Hitungan | Total pemasukan, total alokasi, sisa, dan persentase otomatis |
| Dashboard awal | Ringkasan gabungan, rincian suami/istri, pengeluaran nyata dan bukti yang bisa dilihat |
| Pengeluaran nyata | Tanggal, pos alokasi sendiri, keterangan, nominal; tambah/ubah/hapus oleh pemilik |
| Bukti | Opsional, beberapa JPG/PNG per pengeluaran; dapat dilihat kedua akun |
| Kiriman pasangan | Rencana kiriman keluar/masuk serta catatan kiriman nyata; tidak menggandakan total keluarga |
| Salin bulan | Salin nama, jenis, urutan dan nominal tersimpan; hasil berdiri sendiri |
| Dua perangkat | Data bersama, pembaruan berkala saat online, konflik tidak ditimpa diam-diam |
| PWA | Dapat dipasang pada browser yang mendukung; antarmuka mengutamakan ponsel |
| Pemeliharaan | Migrasi, backup privat dan panduan pemulihan untuk pemilik instalasi |

Tidak termasuk: koneksi rekening bank, pelaksanaan transfer uang, laporan tambahan, notifikasi, pendaftaran publik, pengeditan offline, impor/ekspor Excel, serta pengaturan template bawaan melalui UI. Pengeluaran nyata dan pencatatan kiriman kini termasuk MVP atas keputusan pengguna. Backup adalah tindakan pemeliharaan pemilik, bukan fitur ekspor Excel pengguna.

## Periode dan perubahan pos

- ID bulan YYYY-MM, tahun 2000–2100. Tahun workbook tidak ditebak; data historis tidak dimasukkan otomatis.
- Instalasi baru tidak memiliki anggaran. Pengguna memilih bulan dan menekan Buat anggaran.
- Bila anggaran sudah ada, bulan terakhir secara kronologis dibuka; pemilih bulan tersedia.
- Nama, nominal, penambahan dan penghapusan pos hanya berlaku pada bulan aktif. Template bawaan dan bulan lain tetap berdiri sendiri.
- Jenis pos income, allocation, atau transfer_out ditentukan saat dibuat. Nama tidak mengubah jenis. Pos yang sudah dipakai pengeluaran/kiriman tidak boleh dihapus sampai referensi aktif diselesaikan.
- Nama 1–100 karakter setelah spasi tepi dipangkas. Nama sama diperbolehkan karena identitas pos memakai ID tetap.
- Maksimal 200 pos aktif per pemilik per bulan. Nama/nominal pos milik pasangan hanya baca. Tambahan pos berada di akhir kelompok; urutan bawaan mengikuti sumber. Tidak ada fitur geser urutan pada MVP.
- Bulan yang telah ada tidak dapat ditimpa. Tidak ada penghapusan satu bulan pada MVP.

## Aturan nominal dan hitungan

- Input memakai rupiah bulat, 0–1.000.000.000.000 per pos. Pengguna mengetik angka positif; jenis alokasi membuat nominal mengurangi pemasukan.
- Kosong disimpan sebagai null dan tetap ditampilkan kosong. Angka 0 yang sengaja diisi tetap tampil 0. Keduanya berkontribusi nol terhadap total.
- Pada bagian pribadi, dana anggaran adalah pemasukan eksternal ditambah rencana kiriman masuk. Alokasi pribadi mencakup alokasi eksternal dan rencana kiriman keluar. Sisa pribadi adalah selisih keduanya.
- Pada dashboard gabungan, I = jumlah pemasukan eksternal kedua pihak dan A = jumlah alokasi eksternal kedua pihak. Seluruh transfer internal dikecualikan. Sisa anggaran R = I − A.
- Sisa negatif tetap ditampilkan negatif. Realisasi pengeluaran dan sisa terhadap pengeluaran ditampilkan terpisah; bukan saldo rekening.
- Persentase pribadi memakai dana anggaran pribadi sebagai penyebut; persentase sisa memakai absolut sisa. Penyebut nol → —. Rincian serta contoh konsolidasi ada di REVISI_KELUARGA.md.
- Persentase ditampilkan maksimal satu desimal dengan format Indonesia. Perhitungan memakai rasio penuh, bukan angka tampilan yang telah dibulatkan.
- Penambahan pemasukan memperluas penyebut dari dua pemasukan sumber menjadi seluruh pos pemasukan. Ini penyesuaian untuk fitur tambah pos, bukan klaim rumus literal Excel.
- Total alokasi adalah ringkasan tambahan untuk dashboard. Baris jumlah persentase tanpa label pada sumber tidak dijadikan total alokasi karena rumusnya ikut menjumlahkan persentase sisa absolut.
- Nilai yang tidak valid tidak disimpan; kolom mempertahankan isian untuk diperbaiki dan menampilkan pesan. Ringkasan menggunakan nilai valid terakhir untuk kolom itu.

## Simpan otomatis

1. Saat mengetik, kolom menjadi draf. Ringkasan boleh memperlihatkan hasil isian valid dengan penanda belum tersimpan.
2. Ketika kolom ditinggalkan atau Enter/Selesai ditekan, validasi lalu kirim hanya kolom yang berubah.
3. Status: Belum tersimpan → Menyimpan… → Tersimpan, atau Gagal tersimpan. Tersimpan hanya setelah jawaban sukses dari server.
4. Tiap kolom memiliki antrean penyimpanan sendiri. Jika diedit lagi saat permintaan berjalan, jawaban lama tidak mengganti draf baru; nilai terbaru dikirim setelah permintaan sebelumnya selesai.
5. Status keseluruhan tidak boleh Tersimpan selama masih ada kolom gagal, konflik, atau belum disimpan.
6. Sebelum pindah bulan/bagian, membuka dashboard, salin bulan, keluar atau memperbarui PWA, tunggu penyimpanan/unggah selesai. Bila gagal, pengguna dapat mencoba lagi atau membatalkan perpindahan. Form pengeluaran/kiriman disimpan sebagai satu catatan lengkap; autosave per kolom tetap berlaku pada tabel anggaran.
7. Saat offline, hentikan isian baru. Isian yang sudah menunggu simpan tetap ada dalam memori tab, ditandai belum tersimpan. Coba kembali setelah online dengan pemeriksaan versi.
8. Draf tidak disimpan permanen di perangkat. Menutup paksa tab dapat menghilangkan draf; peringatan penutupan ditampilkan sejauh didukung browser.
9. Jika sesi habis, pengguna masuk ulang dalam tampilan yang menjaga draf di memori; periksa versi terbaru sebelum mengulangi simpan.

## Sinkronisasi dan konflik

- Saat tab terlihat dan sesi aktif, periksa perubahan setiap 10 detik serta ketika aplikasi kembali aktif atau online. Waktu tampil dipengaruhi koneksi; bukan jaminan realtime seketika.
- Data server boleh memperbarui kolom yang tidak sedang diedit. Draf dan kolom yang memiliki simpan tertunda tidak diganti diam-diam.
- Nama dan nominal memiliki versi terpisah; pengeluaran dan kiriman memakai versi seluruh catatan. Konflik tetap relevan ketika pemilik membuka dua perangkat. Pasangan hanya membaca dan tidak diberi jalur paksa ubah.
- Versi lama pada kolom yang sama menghasilkan konflik. Tampilkan nilai terbaru dan isian pengguna, dengan pilihan Gunakan nilai terbaru atau Simpan isian saya. Pilihan kedua tetap memeriksa versi terbaru; bila ada perubahan lagi, konflik ditampilkan kembali.
- Jika pos telah dihapus perangkat lain, simpan ke pos itu ditolak. Draf masih dapat dibaca agar pengguna dapat membuat pos baru secara eksplisit.
- Penghapusan memakai versi seluruh baris agar tidak menghapus pos yang baru diubah pasangan tanpa ditinjau ulang.

## Tampilan dan data pribadi

Implementasi mengikuti DESIGN.md dan contoh tahap 4: periode, ringkasan sisa, total pendukung, lalu kolom pemasukan/alokasi. Fokus keyboard terlihat; input berlabel; status dan kesalahan dapat dibaca pembaca layar. Tampilan 390 px tidak meluber horizontal dan diuji juga pada lebar 320 px. Nominal panjang tidak menutupi persentase atau tindakan.

Nama pos keluarga disiapkan sekali melalui konfigurasi privat pemilik. Kode publik hanya memiliki template dan angka dummy. Email, sandi, hash akun, workbook, data keluarga, backup, dan ID konfigurasi deployment pribadi tidak masuk GitHub.

## Kriteria penerimaan

| ID | Bukti yang diperlukan |
| --- | --- |
| A1 | Bulan baru menampilkan 16 pos template dengan nominal null; tidak mengisi nominal historis |
| A2 | Edit nama/nominal langsung tersimpan tanpa tombol Simpan; muat ulang setelah sukses mempertahankan nilai |
| A3 | 10.000.000 pemasukan dan 7.000.000 alokasi menghasilkan sisa 3.000.000 serta 70%/30% |
| A4 | Alokasi 12.000.000 pada pemasukan 10.000.000 menghasilkan sisa -2.000.000, 120% alokasi, 20% sisa absolut |
| A5 | Pemasukan nol menghasilkan persentase —; kosong dan 0 tetap berbeda setelah simpan/muat ulang |
| A6 | Tambah/ubah/hapus berlaku hanya bulan aktif; salinan membawa nilai tersimpan tanpa bergantung pada sumber |
| A7 | Dua sesi independen dapat membaca perubahan bersama; konflik kolom sama menghasilkan 409 dan pilihan penyelesaian |
| A8 | Gangguan jaringan, jawaban hilang, jawaban terlambat dan sesi habis tidak menghasilkan status sukses palsu atau duplikasi pos |
| A9 | API tanpa sesi ditolak; origin asing, input tidak valid, dan percobaan login berlebih ditolak di backend |
| A10 | Visual desktop dan ponsel mengikuti contoh yang disetujui; operasi dapat dilakukan memakai keyboard |
| A11 | Manifest, ikon, dan service worker valid; API dan data keluarga tidak tersimpan di cache offline |
| A12 | Migrasi lokal, uji backup dan pemulihan pada database terpisah berhasil; pemeriksaan berkas publik tidak menemukan data privat |

Kriteria A1/A6 berlaku per pemilik dan tidak menyalin pengeluaran, kiriman nyata atau bukti. A7 menguji konflik dua sesi milik akun yang sama; akses pasangan diuji dengan B1/B2. Kriteria B1–B10 dalam REVISI_KELUARGA.md wajib ditambahkan pada penerimaan. Bukti JPG/PNG memerlukan penyimpanan objek privat; aktivasi layanan dan potensi biaya harus diperiksa sebelum deployment.

## Arsip tahapan awal

Versi lokal tahap 6 sudah dibangun dan diperiksa dengan pengujian terarah. Tahap 7 melengkapi gerbang pengujian teknis, tahap 8 uji bersama pengguna, tahap 9 menyiapkan publikasi, tahap 10 deployment setelah persetujuan, tahap 11 menguji produksi dan serah terima. Akun serta database saat ini hanya lokal; repositori dan deployment baru belum dibuat.

## Tambahan disetujui: ganti sandi sendiri

Dua akun dapat mengganti sandi masing-masing dari aplikasi: sandi saat ini, sandi baru minimal 15 dan maksimal 128 karakter, konfirmasi. Backend memverifikasi dan membatasi percobaan. Sukses mengakhiri semua sesi akun tersebut, pasangan tetap masuk. Tidak ada registrasi atau reset email. Detail, migrasi dan uji penerimaan: CHANGE_PASSWORD_PROPOSAL.md.

## Ringkasan tahunan dan tren — disetujui pengguna

Dashboard mempertahankan anggaran/perhitungan bulanan. Tambahan: persentase alokasi, sisa anggaran dan pengeluaran tercatat pada bulan aktif; ringkasan satu tahun kalender; grafik pengeluaran dibanding pemasukan anggaran untuk12 bulan dengan rincian saat bulan dipilih. Tahun yang memiliki anggaran dapat dipilih. Persentase gabungan dihitung dari jumlah nominal dibagi jumlah pemasukan anggaran, bukan mean persentase bulanan.

Satu bulan masuk ringkasan jika anggaran kedua akun sudah dibuat dan seluruh pos aktif income/allocation memiliki nominal non-NULL. Nol berarti sengaja diisi 0; NULL belum diisi. Nilai transfer_out tidak menentukan kelengkapan karena kiriman internal tidak masuk total keluarga. Kelengkapan ini bukan status bulan sudah selesai. Bulan masa depan yang rencananya sudah lengkap tetap disertakan; belanja yang belum dicatat tidak terwakili. Tidak menambahkan penanda finalisasi bulan.

Tampilkan jumlah bulan disertakan dan bulan ada tetapi belum lengkap. Bulan belum dibuat dan belum lengkap ditampilkan sebagai — pada grafik. Bulan lengkap dengan pemasukan0 ikut jumlah bulan terisi, tetapi rasio bulan itu —; nominal tercatat tetap ikut total tahun. Denominator tahunan0 menghasilkan —. Persentase boleh melebihi100 dan sisa boleh negatif. Kiriman internal dan catatan dihapus tidak ikut hitungan. Tidak menambahkan klaim tabungan/saldo atau transaksi pemasukan baru.

Keputusan 16 November 2026 menggabungkan dashboard tahunan, desain visual yang disetujui dan bukti pemasukan sebagai satu kandidat. Migrasi 0004 hanya menambah metadata bukti pemasukan; rumus dan akun tetap.

## Bukti pemasukan

Pada bagian Suami/Istri, pos jenis income memiliki tombol Tambah / lihat bukti dengan jumlah gambar siap. Pasangan mendapat Lihat bukti tanpa kontrol mutasi. Dialog JPG/PNG opsional mengikuti pola pengeluaran. Unggahan gagal dapat diulang dengan ID tetap; yang berhasil tetap tersimpan. Keluar/sesi habis menutup akses dialog. Penyalinan anggaran tidak membawa bukti.
