# Tahap 4 — Contoh tampilan interaktif

Status: tampilan awal disetujui pengguna; revisi keluarga 1A–6B kini diperagakan dan siap diperiksa. Contoh tetap bukan aplikasi produksi.

Permintaan visual terbaru: contoh seperti GoPay atau Flip. Kedua alternatif bisa dipilih di bagian atas halaman; menunggu pilihan pengguna sebelum mengganti arah desain final. Editorial A tetap tersedia.

## Cara mencoba

Buka http://127.0.0.1:43819/ saat server lokal berjalan, atau buka prototype/index.html melalui browser. Contoh tidak memerlukan akun atau sandi. Angka awal fiktif dan tidak mengambil nominal workbook. Label pos mengikuti sumber lokal, sehingga folder prototype diabaikan Git bersama pemetaan privat.

Untuk membandingkan, gunakan tombol GoPay/Flip/Editorial A atau parameter URL ?style=gopay, ?style=flip, ?style=editorial. Ganti gaya lewat tombol tidak memuat ulang data; membuka ulang halaman mengembalikan data dummy seperti biasa. Navigasi Beranda/Suami/Istri berada di bawah pada ponsel.

- Ubah nominal lalu pindah kolom atau tekan Enter untuk menerapkan perubahan contoh dan menghitung ulang.
- Ubah nama pos langsung pada barisnya.
- Tambah pemasukan/alokasi, hapus dengan konfirmasi, dan buat bulan baru menggunakan pos bawaan kosong atau salinan bulan lain.
- Pemilih bulan mempertahankan perubahan contoh selama tab belum dimuat ulang.
- Kolom kosong berbeda dari angka nol. Pemasukan nol menampilkan persentase —. Alokasi melebihi pemasukan menghasilkan sisa negatif.
- Tombol Ulangi contoh mengembalikan data awal.

## Mencoba revisi keluarga

1. Halaman awal adalah Dashboard keluarga, dengan gabungan anggaran, realisasi dan bukti pengeluaran. Angka seluruhnya fiktif.
2. Pilih Bagian suami atau Bagian istri. Akun aktif ditunjukkan pemilih Contoh akun (simulasi) pada header. Pilih Istri lalu Bagian istri untuk mencoba pengisian istri. Pasangan hanya bisa melihat data, tidak mengedit dalam simulasi UI.
3. Pada bagian sendiri, pilih Catat pengeluaran, isi tanggal/pos/keterangan/nominal. JPG/PNG opsional; pilih beberapa sekaligus bila diperlukan. Batas contoh 10 gambar dan 5 MiB per gambar.
4. Dua gambar ilustrasi sudah tersedia pada pengeluaran Belanja sayur. Buka Lihat 2 bukti dari dashboard atau thumbnail untuk melihat gambar besar. Gambar ini bukan bukti transaksi nyata.
5. Catat kiriman pada bagian suami. Periksa pada bagian istri bahwa catatan yang sama muncul sebagai masuk. Dashboard keluarga tidak menjadikannya belanja atau pemasukan eksternal tambahan.
6. Buat/salin bulan hanya menyiapkan anggaran akun aktif. Pengeluaran, kiriman nyata dan bukti tidak disalin; pasangan menyiapkan anggarannya sendiri.

Pemilih akun adalah alat mencoba contoh tanpa login, bukan implementasi keamanan. Gambar yang dipilih dibaca sebagai object URL di memori browser; tidak ada unggahan online, penyimpanan D1/R2, atau sinkronisasi pada tahap ini. Memuat ulang halaman menghilangkan seluruh perubahan/file pilihan dan mengembalikan ilustrasi awal.

## Batas contoh

Perubahan hanya disimpan di memori tab, hilang saat dimuat ulang. Tidak ada autentikasi, penyimpanan server, sinkronisasi antarperangkat, pengujian konflik dua akun, atau instalasi PWA. Status layar menyebut perubahan contoh, bukan konfirmasi dari server. Simulasi ini hanya menguji bentuk pengisian dan alur bulan sebelum implementasi.

## Arah tampilan yang diperagakan

Satu bulan per layar; bahasa visual editorial A mengikuti DESIGN.md. Latar hangat, teks hijau gelap, serif pada judul/nominal utama, garis pemisah, serta kolom nominal berbingkai. Menggunakan fallback lokal Georgia/Segoe UI; tidak mengunduh font. Nama pos bisa diedit, persentase baca saja. Ringkasan sisa mendahului total pemasukan dan alokasi. Ponsel menata setiap baris menjadi nama di atas, nominal dan persentase di bawahnya.

## Pemeriksaan pengguna

Apakah kolom pengisian sudah langsung terlihat dan nyaman? Apakah ringkasan membantu tanpa mengganggu pengisian? Apakah alur menambah pos dan membuat bulan sesuai kebutuhan? Koreksi tahap ini dilakukan sebelum spesifikasi final dan backend.

## Hasil pemeriksaan browser awal

- Gaji dummy 8.000.000 menghasilkan total pemasukan 10.500.000 dan sisa 3.000.000, sesuai alokasi dummy 7.500.000.
- Bulan baru menghasilkan 16 pos dengan nominal kosong dan persentase —.
- Tambah/hapus pos uji berjalan, termasuk konfirmasi nama pos serta bulan.
- Salin bulan membawa 16 pos dan nominal bulan sumber.
- Kedua pemasukan nol menghasilkan sisa -7.500.000 dan seluruh persentase —.
- Visual desktop dan ponsel 390×844 diperiksa; lebar konten sama dengan area tampilan, tidak meluber horizontal.
- Contoh dikembalikan ke data awal setelah uji. Pengujian autentikasi, sinkronisasi, dan PWA belum dilakukan karena bukan bagian prototipe.

## Hasil pemeriksaan revisi keluarga

- Konsolidasi awal: pemasukan eksternal 12.000.000, alokasi eksternal 7.800.000, sisa anggaran 4.200.000. Rencana kiriman 1.000.000 tidak dihitung dua kali.
- Pemilih akun istri membuat kolom istri dapat diisi, sedangkan dari akun suami kolom istri disabled dan tombol catat/hapus tidak tersedia.
- File chooser menerima dua fixture valid JPG/PNG sekaligus. Menyimpan pengeluaran fiktif 50.000 menaikkan realisasi 295.000 menjadi 345.000; viewer dashboard membuka kedua gambar.
- Menambah kiriman nyata 50.000 tidak mengubah realisasi keluarga 345.000; catatan yang sama muncul sebagai kiriman masuk pada istri.
- Teks biasa yang diberi ekstensi .jpg ditolak dengan pesan format tidak sesuai. Batas ukuran/jumlah di kode belum sama dengan pengujian backend produksi.
- Viewer pada mobile menampilkan kedua gambar terdekode dan muat dalam lebar dialog. Desktop serta 390×844 diperiksa secara visual; lebar 320 px diperiksa dan overflow ringkasan diperbaiki.
- Contoh akhir kembali ke data fiktif awal dengan dua gambar ilustrasi. Otorisasi backend dan penyimpanan objek privat belum diuji atau dibangun.

## Pemeriksaan alternatif visual

- GoPay-inspired dan Flip-inspired diperiksa pada mobile 390×844 serta desktop 1280×900. Keduanya tidak meluber pada pemeriksaan lebar 320 px.
- Tombol Pengeluaran pada akses cepat membuka form milik akun aktif. Lihat bukti mengarahkan ke daftar yang benar; viewer tetap menampilkan dua gambar yang dapat didekode.
- Mengubah Gaji dummy menjadi 8.000.000 kemudian mengganti gaya mempertahankan pemasukan keluarga 12.500.000 dan sisa 4.700.000. Data dikembalikan ke nilai awal setelah uji.
- Navigasi ponsel ke bagian lain mengembalikan posisi ke awal layar. Kolom istri tetap dapat diisi hanya dalam simulasi akun istri.
- Pemeriksaan sintaks JS lulus dan detektor mekanis pada fintech.css/app.js tidak melaporkan temuan. Ini tidak menggantikan penilaian visual pengguna atau uji backend.

## Revisi komposisi GoPay / Flip

Perbandingan pertama terlalu dominan pada warna. Revisi ini membedakan susunan dan awal pencatatan:

- `?style=gopay`: ringkasan dan akses cepat di atas, aktivitas/bukti langsung setelahnya, rincian pasangan di samping pada desktop.
- `?style=flip`: isi Nominal pengeluaran di beranda → Lanjutkan ke rincian → lengkapi pos, tanggal, keterangan dan bukti opsional → Simpan pengeluaran. Rencana keluarga menjadi bagian pendamping.
- Uji alur Flip: nol ditolak; nominal 35.000 terbawa ke form dan berhasil dicatat, sehingga realisasi contoh naik dari 295.000 ke 330.000. Nominal awal kosong kembali setelah simpan. Catatan tetap ada saat beralih ke GoPay. Data akhir dipulihkan dengan muat ulang.
- Viewer dua bukti tetap terbuka. Akses cepat GoPay membuka pencatatan milik istri ketika akun simulasi istri dipilih. Kolom istri dapat diisi; kolom suami disabled pada akun istri.
- Kedua komposisi dirender pada desktop 1280×900 dan mobile 390×844; pemeriksaan 320 px menunjukkan scrollWidth sama dengan clientWidth. Sintaks JS dan detektor gaya lulus.
- Ini prototipe lokal dalam memori, bukan bukti autentikasi, penyimpanan online, atau sinkronisasi.

## Caku — arah yang dipilih

Pengguna menyetujui Caku dengan permintaan font baru dan animasi ringan. Buka http://127.0.0.1:43819/; Caku menjadi default. Rujukan, atribusi dan batas inspeksi ada di REFERENSI_CAKU.md.

- Font Plus Jakarta Sans berhasil dimuat dari berkas lokal; computed font pada body dan kolom nominal sesuai. Animasi computed pada dashboard dan anggaran adalah caku-enter, 0,16 s. Reduced motion tersedia pada CSS, belum diuji dengan perubahan pengaturan OS.
- Menambah pengeluaran dummy 25.000 melalui tombol Catat menaikkan realisasi 295.000→320.000. Viewer tetap menampilkan dua bukti ilustrasi.
- Akun istri: penghasilan diubah 2.000.000→2.200.000, sisa istri menjadi 1.900.000 dan sisa keluarga 4.400.000; kolom suami disabled. Bulan baru milik istri menampilkan kartu suami Belum dibuat.
- Saat nominal salah abc, tombol Catat dan Bukti tetap menahan pengguna pada pengisian dan mempertahankan teks tersebut. Setelah diperbaiki, Catat membuka form kembali. Temuan ini diperbaiki serta diperiksa ulang dalam audit source terpisah.
- Font baru diperiksa pada desktop 1280×900, ponsel 390×844 dan lebar 320 px. Ringkasan rupiah pada ponsel ditata ulang agar tidak pecah pada nominal normal. Nominal maksimum 1.000.000.000.000 dan sisa negatif diperiksa pada 320 px: lebar konten sama dengan clientWidth; sisa negatif tetap merah.
- GoPay, Flip dan Editorial masih dapat dipilih; tombol tambahan Caku tersembunyi pada gaya lain. Data akhir kembali ke dummy awal.
- Sintaks JS lulus. Detektor gaya memberi catatan preferensi font umum dan kesesuaian dokumentasi token yang sedang diperbarui, serta catatan CSS inline lama; hasil detektor tidak dinyatakan bersih. Audit terpisah hanya source dan penutupan satu temuan navigasi, bukan audit visual independen.
- Login, penyimpanan online, sinkronisasi dan pengukuran performa pada ponsel fisik belum dilakukan.
