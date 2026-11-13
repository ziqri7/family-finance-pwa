# Tahap 7 — pengujian gangguan lokal

Pengujian ini melengkapi tahap 6. Worker, D1 dan R2 sementara dijalankan terpisah pada port 5187 dengan template generik dan akun dummy. Tidak memuat `.dev.vars`, workbook, atau database aplikasi pada port 5173. Anggaran November pengguna tidak diubah. Lingkungan sementara dan tiga tab uji sudah ditutup setelah pemeriksaan.

## Bukti melalui layar aplikasi

| Skenario | Tindakan dan hasil yang diamati |
| --- | --- |
| Permintaan simpan gagal sebelum diterima Worker | Koneksi PATCH diputus dari server uji. Nominal 10.000.000 tetap di kolom, status Ada isian belum tersimpan, pesan koneksi dan Coba lagi tampil. Setelah sambungan dipulihkan dan Coba lagi ditekan, status Tersimpan dan ringkasan 10.000.000. |
| Jawaban hilang setelah database menyimpan | Worker menyimpan 11.000.000, lalu koneksi jawaban diputus. Ulang simpan memakai versi yang sama diterima; layar kembali Tersimpan dengan 11.000.000, tanpa konflik palsu. Idempotensi versi juga diperiksa tes API. |
| Perubahan bersamaan | Saat draf 12.000.000 belum dikirim, nilai database diperbarui menjadi 13.000.000 beserta versinya untuk mensimulasikan penulis lain. Layar menunjukkan nilai terbaru dan pilihan penyelesaian. Simpan isian saya menyimpan 12.000.000 setelah keputusan eksplisit. Ini simulasi penulis bersamaan, bukan dua perangkat fisik. |
| Sesi habis saat nominal belum tersimpan | Sesi di database uji dicabut ketika draf 14.000.000 ada. Masuk kembali tampil. Upaya masuk sebagai istri ditolak untuk menjaga draf suami. Masuk lagi sebagai suami memulihkan nominal 14.000.000; Coba lagi menyimpannya. |
| Upload terputus | Pengeluaran 25.000 disimpan, reservasi gambar berhasil, tetapi PUT diputus sebelum Worker. Layar menyatakan pengeluaran sudah tersimpan dan gambar belum terunggah; Ulangi unggahan tersedia. |
| Sesi habis ketika gambar menunggu | Sesi dicabut sebelum mengulangi upload. Setelah masuk kembali sebagai suami, form, nominal dan File PNG masih ada. Ulangi unggahan berhasil: hanya satu pengeluaran 25.000 dan satu bukti terlihat. Tidak memilih ulang file. |
| Versi PWA baru ketika ada draf | Versi service worker diganti melalui server uji, lalu tab kedua dibuka untuk memicu pemeriksaan versi. Tab pertama menampilkan pemberitahuan versi baru sambil mempertahankan draf 15.000.000. Dengan nominal abc, tombol pembaruan tidak memuat ulang dan menampilkan validasi. Setelah nominal valid disimpan, pembaruan berhasil dan dashboard tetap menunjukkan 15.000.000 serta satu pengeluaran 25.000. |
| Server tidak tersedia | Server uji dimatikan. Tab baru masih membuka shell dari service worker; permintaan sesi gagal, layar masuk dengan pesan koneksi tampil. Data anggaran/bukti keluarga tidak ditampilkan dari cache. Ini bukan pengujian perubahan navigator.onLine melalui pengaturan OS. |

## Simulasi kegagalan penyimpanan

`tests/upload-faults.test.mjs` membungkus Worker hanya dalam runtime pengujian. Header injeksi tidak dikenali oleh kode produksi. Database/bucket sementara dibuang saat runtime ditutup.

- R2.put gagal: respons 500, metadata tetap pending, objek belum ada dan unduh 404. Ulangi reservasi/unggah dengan ID sama berhasil; hanya satu metadata dan satu objek.
- Finalisasi D1 gagal setelah R2.put: respons 500, objek sudah ada tetapi metadata pending, sehingga unduh tetap 404. Ulangi memakai ID/key sama berhasil tanpa menggandakan objek. Bila pengguna tidak mengulang, objek pending bergantung pada pemeliharaan kedaluwarsa; bukan dihapus langsung pada kegagalan finalisasi.
- Induk dihapus setelah put sebelum finalisasi: respons 409, objek dibersihkan, unduh 404, unggah ulang ditolak. Simulasi memperbarui tombstone induk tepat di sela operasi.

`npm test`: **30 tes lulus, 0 gagal** (26 sebelumnya + satu tes induk dengan tiga subtes gangguan). Tidak ditemukan kegagalan pada skenario yang dijalankan; kode produksi tidak diubah untuk membuat tes lulus.

## Cara mengulang dan batas

Jalankan `node --test tests/upload-faults.test.mjs` untuk uji gangguan gambar, atau `npm test` untuk seluruh pemeriksaan otomatis. Untuk pemeriksaan layar, gunakan instalasi sementara dengan data dummy; jangan memutus koneksi atau mencabut sesi pada instalasi yang sedang dipakai keluarga. Urutan tindakan dan nominal ada pada tabel di atas. Harness pengendali lokal berada di `private/`, diabaikan dari publikasi dan tidak masuk paket aplikasi.

Belum dibuktikan: seluruh kombinasi balapan/jawaban hilang, perpindahan offline lewat OS/perangkat fisik, pemulihan draf setelah tab ditutup/reload (draf hanya di memori tab), instalasi di ponsel, perilaku pembaruan pada semua browser, serta batas CPU/memori, kuota dan kegagalan layanan Cloudflare remote. Pemeriksaan lokal ini tidak menggantikan tes produksi setelah deployment. Tahap 8 adalah uji penerimaan bersama pengguna; tidak ada fitur atau rilis baru pada tahap 7.
