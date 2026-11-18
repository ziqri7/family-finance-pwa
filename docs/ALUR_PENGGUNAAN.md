# Tahap 3 — Alur penggunaan yang diusulkan

## Alur aktif kandidat buku keluarga

Beranda → isi nominal. Pemasukan → isi sumber dana. Bukti bersama → pilih pos dan JPG/PNG → Simpan bukti, tanpa mengubah uang. Pos → Pengaturan → Lacak pemakaian bila diperlukan; kedua akun mencatat dalam jatah pos. Bukti → lihat foto dan pos terkait. Grafik → Bulan/Tahun. Salin bulan → seluruh struktur kosong, hak edit mengikuti pembuat asli. Peninjauan lama sekali per ringkasan milik pembuat; tambahan manual dipetakan terlebih dahulu. Lihat README.md dan FAMILY_BOOK_PROPOSAL.md; alur lama berikut adalah riwayat.


Status: alur awal telah diperluas oleh keputusan keluarga 1A–6B. Rincian terbaru di REVISI_KELUARGA.md menggantikan asumsi dua akun dapat mengubah seluruh data dan menambahkan dashboard, realisasi, bukti serta kiriman internal. Contoh tahap 4 belum membuktikan penyimpanan, otorisasi atau sinkronisasi server.

Dasar yang sudah diputuskan: pos dari Excel tersedia sejak awal; nama dan pos bisa ditambah, diubah, atau dihapus; simpan otomatis; tidak ada impor atau ekspor Excel; dua akun menggunakan anggaran bersama.

## 1. Masuk dan membuka anggaran

1. Pengguna membuka PWA dan masuk dengan akun yang telah disiapkan pemilik instalasi.
2. Jika sudah ada anggaran, buka bulan terakhir yang tersedia. Pengguna dapat memilih bulan lain.
3. Jika belum ada anggaran, tampilkan pilihan bulan dan tahun dengan tindakan Buat anggaran. Jangan membuat bulan atau mengisi nominal keluarga tanpa tindakan pengguna.
4. Setelah bulan dibuat, langsung tampilkan seluruh nama pos bawaan dengan kolom nominal kosong yang dapat diisi.

## 2. Mengisi dan menghitung

1. Untuk bulan yang dipilih, tampilkan kolom Pos keuangan, Nominal (Rp), dan Persentase. Pisahkan kelompok pemasukan dan alokasi agar tidak perlu memilih jenis pada setiap baris bawaan.
2. Pengguna mengetuk nominal dan mengetik angka positif. Alokasi mengurangi pemasukan secara otomatis.
3. Setelah pengguna meninggalkan kolom atau menekan Enter/Selesai, validasi dan simpan otomatis. Tidak menyimpan angka setengah diketik pada setiap penekanan tombol.
4. Ringkasan dan persentase mengikuti isian valid. Saat perubahan masih menunggu penyimpanan, tandai hasil sebagai belum tersimpan.
5. Tampilkan status Menyimpan…, Tersimpan, atau Gagal tersimpan. Status Tersimpan hanya muncul setelah server mengonfirmasi.
6. Usulan validasi: rupiah bulat, nol diizinkan, kolom kosong diizinkan dan berbeda dari nol. Input yang tidak valid tetap berada di kolom dengan pesan; nilai valid terakhir di server tetap dipertahankan.
7. Sisa dan persentase dihitung otomatis dan tidak dapat diedit sebagai pos biasa. Jika pemasukan nol, persentase tampil —. Sisa negatif tetap tampil negatif.

## 3. Menambah, mengubah, dan menghapus pos

- Tambah pos: pilih Tambah pemasukan atau Tambah alokasi, isi nama, lalu pos dibuat di kelompok yang sesuai. Nominal dapat diisi setelahnya.
- Ubah nama: edit nama pada baris yang sama; selesai mengisi memicu simpan otomatis. Nama kosong ditolak.
- Hapus pos: konfirmasi nama pos dan bulan yang akan terpengaruh. Setelah server mengonfirmasi, hapus baris dan hitung ulang ringkasan.
- Usulan batas perubahan: nama, nominal, penambahan, dan penghapusan berlaku hanya pada bulan yang sedang dibuka. Bulan lain dan susunan awal bawaan tidak ikut berubah.
- Urutan awal mengikuti workbook. Tambahan pos ditempatkan di akhir kelompok yang sesuai; pengaturan ulang urutan manual tidak ditambahkan ke MVP.

## 4. Membuat dan menyalin bulan

1. Pengguna memilih bulan dan tahun yang belum ada.
2. Pilih Mulai dari pos bawaan atau Salin anggaran bulan lain.
3. Mulai dari pos bawaan membuat nama pos dengan nominal kosong.
4. Salin bulan membuat salinan nama, jenis, urutan, dan nominal tersimpan dari bulan sumber. Bulan baru langsung menghitung sisa dan persentase.
5. Salinan berdiri sendiri. Mengubah salah satu bulan tidak mengubah bulan sumber atau bulan lainnya.
6. Bulan yang sudah ada dibuka, tidak ditimpa atau dibuat ulang.
7. Selesaikan penyimpanan yang masih berjalan sebelum berpindah bulan. Jika gagal, beri pilihan coba lagi atau batalkan perpindahan; jangan diam-diam membuang isian.

## 5. Penggunaan dua akun dan sinkronisasi

- Kedua akun membaca seluruh data keluarga. Masing-masing hanya mengubah bagiannya sendiri; konflik tetap ditangani untuk beberapa perangkat milik pemilik yang sama.
- Simpan ke penyimpanan bersama. Perangkat lain memeriksa perubahan saat aplikasi kembali aktif dan berkala saat terbuka; usulan interval maksimal 10 detik ketika koneksi normal, tanpa klaim realtime seketika.
- Pembaruan dari server boleh memperbarui baris yang sedang tidak diedit. Jangan mengganti isi kolom yang sedang diketik atau memiliki perubahan belum tersimpan.
- Jika kedua akun mengubah kolom yang sama dari versi lama, perubahan kedua tidak boleh diam-diam menimpa perubahan pertama. Tampilkan nilai terbaru dan isian pengguna, lalu minta memilih nilai terbaru atau menyimpan ulang isian pengguna.
- Perubahan pada kolom berbeda dapat disimpan tanpa menimpa seluruh tabel. Rincian teknis pengendalian versi ditentukan pada tahap arsitektur.

## 6. Koneksi gagal atau sesi habis

- Pengisian memerlukan koneksi online. Saat offline, tampilkan status koneksi dan hentikan isian baru.
- Jika jaringan putus saat menyimpan, pertahankan isian di layar sesi yang sedang terbuka dan tandai Belum tersimpan. Jangan mengaku perubahan sudah tersedia pada akun pasangan.
- Setelah tersambung, coba simpan kembali dengan pemeriksaan versi yang sama. Jika ada perubahan lain, jalankan alur konflik di atas.
- Jika pengguna mencoba keluar atau menutup halaman dengan perubahan belum tersimpan, tampilkan peringatan yang didukung browser. Isian sementara dapat hilang bila aplikasi dipaksa tutup; penyimpanan draf offline permanen tidak termasuk MVP.
- Jika sesi habis, tampilkan kebutuhan masuk ulang; jangan membuang atau mengirim isian memakai sesi tidak sah. Setelah masuk ulang, periksa data terbaru sebelum mengulangi penyimpanan.

## 7. Penggunaan di ponsel

- Satu bulan ditampilkan pada satu waktu; nama pos, nominal, dan persentase tetap mudah dibaca tanpa mengharuskan tampilan empat bulan sekaligus.
- Keyboard angka untuk nominal. Target sentuh dan kolom tidak saling bertumpuk.
- Pengguna dapat memasang PWA dari browser yang mendukung. Status online dan penyimpanan tetap terlihat saat aplikasi terpasang.
- Contoh tampilan interaktif dibuat pada tahap 4 setelah alur ini diperiksa.

## Yang perlu diperiksa pengguna

1. Bentuk satu bulan dengan semua pos siap diisi, dikelompokkan menjadi pemasukan dan alokasi.
2. Edit pos hanya memengaruhi bulan aktif; bulan baru dapat memakai pos bawaan atau menyalin bulan lain.
3. Simpan otomatis setelah selesai mengisi kolom, pembaruan perangkat lain maksimal sekitar 10 detik saat online normal, serta pilihan saat kolom yang sama berubah bersamaan.

Belum ada kode aplikasi, skema database, akun, repositori, atau deployment yang dibuat dalam tahap 2–3.
