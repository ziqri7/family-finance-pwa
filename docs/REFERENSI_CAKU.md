# Referensi dan adaptasi Caku

Pengguna memilih **Caku** sebagai arah utama dan meminta font baru serta animasi yang tetap ringan. Keputusan ini menggantikan arah visual sebelumnya; fungsi pengisian langsung serta perhitungan keluarga tetap mengikuti kebutuhan yang telah disepakati.

## Sumber yang ditinjau

- [Caku — Finance App Mobile](https://www.figma.com/community/file/1341326234352864806/caku-finance-app-mobile), halaman Community oleh Asril Mochammad; cover mencantumkan Getah Creative. Cover dan pratinjau gambar ditinjau langsung pada 12 November 2026. Seluruh frame editable dan font asli belum diinspeksi. Halaman mencantumkan CC BY 4.0.
- Adaptasi dibuat ulang dalam HTML/CSS, tanpa menyalin logo, foto, kartu bank, nomor kartu atau aset biner Caku. Kartu menyajikan rencana anggaran, bukan saldo bank.
- [Plus Jakarta Sans, Google Fonts](https://github.com/google/fonts/tree/main/ofl/plusjakartasans) dipilih untuk adaptasi tipografi. Berkas Latin variable resmi Google Fonts disimpan sebagai `prototype/fonts/plus-jakarta-sans-latin-variable.woff2` (27.348 byte). Lisensi OFL disertakan dalam folder yang sama. Ini bukan identifikasi font asli Caku.

## Bentuk adaptasi

- Kartu suami ungu dan istri hijau; keduanya berdampingan di desktop, bergeser horizontal dalam wadah pada ponsel. Bulan tanpa anggaran menampilkan Belum dibuat.
- Ringkasan keluarga menampilkan sisa, pemasukan dan alokasi eksternal. Kiriman internal tetap dikeluarkan dari konsolidasi.
- Catatan pengeluaran menjadi daftar ringkas dengan konteks pemilik, nominal, dan bukti opsional.
- Navigasi ponsel: Beranda, Suami, Catat, Istri, Bukti. Tombol tengah membuka pencatatan akun aktif; pasangan tetap hanya baca.
- Judul, nominal, nama pos, kolom pengisian, tombol dan label memakai Plus Jakarta Sans, dengan angka tabular.
- Animasi CSS saat berpindah bagian: opacity 0,92→1 dan pergeseran 6→0 px selama 160 ms. Tekanan tombol memakai skala 0,98 selama 120 ms. Tidak ada library animasi tambahan, loop dekoratif atau animasi hitung uang. Reduced motion menonaktifkan animasi/transisi dan gulir halus; pengujian dengan preferensi OS tersebut belum dilakukan.

Pratinjau: http://127.0.0.1:43819/ atau `?style=caku`. Alternatif lama tetap dapat dipilih. Data hanya dalam memori tab dan kembali ke dummy awal saat halaman dimuat ulang.
