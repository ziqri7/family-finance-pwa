# Revisi kebutuhan — anggaran suami/istri, realisasi, dan bukti

Status: jawaban pengguna 1A, 2B, 3A, 4A, 5A, 6B telah dikonfirmasi. Rincian desain berikut diperagakan pada revisi contoh tahap 4–5 untuk diperiksa sebelum implementasi. Dokumen ini mengubah lingkup MVP awal yang hanya berisi anggaran.

## Keputusan pengguna

1. Suami dan istri memiliki tabel pemasukan dan alokasi masing-masing.
2. Bukti melekat pada pengeluaran nyata, bukan pada satu pos anggaran bulanan secara umum.
3. Dashboard awal menampilkan gabungan keluarga dan akses rincian masing-masing.
4. Kedua akun bisa melihat seluruh data keluarga. Masing-masing hanya mengubah data miliknya sendiri.
5. Pemberian uang antar pasangan adalah transfer internal; terlihat pada kedua bagian tanpa dihitung dua kali pada gabungan.
6. Satu pengeluaran boleh tanpa bukti atau memiliki beberapa bukti JPG/PNG.

## Bentuk penggunaan

- Sesudah login buka Dashboard keluarga untuk bulan terpilih. Navigasi: Dashboard keluarga, Bagian suami, Bagian istri.
- Bagian milik akun aktif bisa diisi; bagian pasangan hanya baca, termasuk nominal, pengeluaran dan bukti. Pembatasan pada produksi wajib di backend, bukan hanya tombol disabled.
- Pos bawaan suami mengikuti sumber yang telah diperiksa. Tidak ada workbook anggaran istri; label istri pada contoh adalah usulan generik/fiktif yang bisa diubah, bukan data yang diklaim berasal dari Excel.
- Setiap orang membuat dan menyalin anggarannya sendiri. Bila pasangan belum membuat anggaran pada suatu bulan, tampilkan keadaan belum tersedia; jangan membuat tabel pasangan melalui akun lain.
- Salin bulan hanya menyalin pos dan nominal rencana pemilik akun. Pengeluaran, kiriman nyata dan bukti tidak ikut disalin.

## Anggaran dan transfer yang direncanakan

- Jenis pos: income (pemasukan eksternal), allocation (alokasi keluar keluarga), transfer_out (rencana kiriman ke pasangan). Jenis dipilih melalui kelompok tempat menambah pos; nama tidak menentukan jenis secara otomatis.
- Pemetaan awal pos sumber Tunjangan Istri menjadi rencana kiriman ditentukan oleh keputusan pengguna tentang uang internal, bukan formula baru dari Excel. Rincian pemetaan ini berada dalam konfigurasi privat.
- Rencana kiriman masuk pada pasangan merupakan tampilan turunan dari rencana pengirim. Hanya pengirim yang mengubah nilainya. Tidak membuat pos pemasukan bebas kedua yang bisa menyebabkan nilai kedua sisi berbeda.
- Untuk pemilik p: dana anggaran Dp = pemasukan eksternal Ip + rencana kiriman masuk Tp_in. Total alokasi pribadi = alokasi eksternal Ap + rencana kiriman keluar Tp_out. Sisa anggaran pribadi Rp = Dp − Ap − Tp_out.
- Persentase pos pribadi memakai Dp sebagai penyebut. Persentase sisa memakai ABS(Rp)/Dp. Dp nol → —. Rumus anggaran sumber tetap cocok ketika tidak ada kiriman masuk.
- Dashboard keluarga: I = Isuami + Iistri, A = Asuami + Aistri, R = I − A. Seluruh transfer internal dikeluarkan dari I dan A. Jumlah sisa pribadi sama dengan R karena rencana kiriman masuk/keluar saling meniadakan.

## Pengeluaran nyata

- Catatan wajib: tanggal yang berada pada bulan aktif, pos alokasi milik sendiri, keterangan 1–150 karakter, nominal rupiah bulat positif. Batas nominal per catatan 1.000.000.000.000.
- Satu pos bisa memiliki beberapa pengeluaran. Melebihi anggaran diperbolehkan dengan informasi selisih, tidak diam-diam mengubah anggaran.
- Pos yang telah dipakai oleh pengeluaran atau kiriman tidak boleh dihapus sampai referensi aktifnya diselesaikan. Mengubah nama pos tidak menghilangkan catatan.
- Pemilik bisa menambah, mengubah, menghapus catatan dan bukti miliknya. Perubahan catatan lengkap memakai form dan tindakan Simpan pengeluaran; pengisian nominal anggaran tetap otomatis per kolom.
- Satu pembelian dicatat sekali oleh pihak yang membayar. Dua catatan oleh kedua pihak adalah dua catatan berbeda, tidak dideduplikasi berdasarkan nama atau gambar secara spekulatif.
- Hapus pengeluaran memerlukan konfirmasi, langsung mengeluarkannya dari ringkasan, dan menghapus akses bukti terkait. Penghapusan objek fisik diselesaikan dengan proses yang bisa diulang.

## Kiriman nyata antar pasangan

- Catatan kiriman berisi pengirim dari akun aktif, penerima pasangan, pos rencana transfer_out, tanggal bulan aktif dan nominal positif. Beberapa pengiriman dapat mengacu pada satu rencana.
- Pengirim membuat/menghapus catatan. Untuk memperbaiki catatan MVP, hapus yang salah dengan konfirmasi lalu catat pengganti. Penerima melihat referensi otomatis yang hanya dapat dibaca.
- Satu catatan menghasilkan pandangan keluar/masuk, bukan dua transaksi independen. Pengirim tidak menulis baris anggaran yang dimiliki pasangan.
- Kiriman nyata tidak otomatis mengubah nominal rencana. Nilai yang direncanakan dan yang sudah dikirim dapat berbeda dan ditampilkan dengan label masing-masing.
- Kiriman bukan pengeluaran nyata keluarga dan bukan pemasukan eksternal keluarga. Angka belanja serta sisa terhadap pengeluaran tidak berubah karena kiriman.
- Fitur ini hanya mencatat pengiriman yang telah dilakukan; aplikasi tidak menjalankan transfer uang, menghubungkan bank, atau memindahkan dana.

## Dashboard awal

- Utama: sisa anggaran keluarga, pemasukan eksternal keluarga, dan total alokasi eksternal.
- Realisasi: jumlah pengeluaran nyata tercatat E, sisa terhadap pengeluaran I − E, serta jumlah gambar bukti siap dilihat. I adalah pemasukan yang dimasukkan pada tabel anggaran; I − E bukan saldo rekening atau bukti pemasukan bank telah diterima.
- Rincian suami/istri: pemasukan sendiri, rencana kiriman masuk/keluar, alokasi sendiri, sisa anggaran dan pengeluaran nyata.
- Daftar pengeluaran gabungan berdasarkan tanggal, pemilik, keterangan, nominal, pos dan tombol lihat bukti. Tanpa bukti tetap merupakan catatan yang sah, tidak dianggap belum lengkap.
- Klik bukti membuka gambar besar dengan konteks pengeluaran; beberapa gambar bisa dilihat dalam satu tampilan. Tidak mengambil bukti melalui URL publik.
- Perubahan draf pada kolom anggaran diberi status; dashboard yang dibuka setelahnya menunggu penyimpanan selesai, sehingga ringkasan tidak mengaku memakai data tersimpan saat masih gagal.

## Gambar dan penyimpanan

- Format JPG/JPEG atau PNG saja; maksimal 10 gambar per pengeluaran, masing-masing 5 MiB. Ini batas rancangan untuk keamanan dan ukuran data, bukan batas jumlah yang disebut pengguna.
- Pengeluaran dapat disimpan tanpa gambar. Bila sebagian unggahan gagal, pengeluaran tetap sah dan UI membedakan gambar berhasil, tertunda, dan gagal; retry tidak membuat pengeluaran kedua.
- Pemeriksaan klien: jenis MIME, signature byte, ukuran, kemampuan gambar didekode, dimensi ≤10.000 per sisi dan total ≤16 megapiksel. Server mengulangi pemeriksaan format/ukuran/struktur dan tidak mempercayai nama ekstensi atau validasi browser.
- File yang tidak sesuai ditolak dengan pesan. Batas ukuran dibaca pada byte aktual; tidak hanya Content-Length. Tidak menerima SVG, HTML, PDF, GIF atau berkas animasi.
- Metadata pengeluaran dan gambar berada di D1; berkas biner direncanakan di bucket R2 privat milik keluarga. Tidak mengaktifkan r2.dev/public bucket atau berbagi URL objek mentah.
- GET gambar selalu melewati sesi dan otorisasi baca Worker, Content-Type yang diverifikasi, nosniff, Content-Disposition inline dengan nama aman, dan Cache-Control private, no-store. Service worker tidak menyimpan gambar.
- D1 dan R2 tidak memiliki satu transaksi bersama. Gunakan status pending/ready/deleting, ID tetap dan retry idempotent; dashboard menghitung dan membuka hanya gambar ready yang induknya masih aktif.
- Backup lengkap mencakup ekspor D1 dan salinan objek R2 beserta manifest key/checksum. Restore hanya D1 tidak memulihkan bukti gambar.
- R2 memerlukan subscription dan memiliki penggunaan gratis terbatas serta biaya ketika terlampaui. Periksa kondisi akun dan minta keputusan pemilik sebelum aktivasi/checkout pada tahap deployment; tahap ini tidak membuat bucket, subscription atau tagihan. Rujukan resmi: [R2 Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), [R2 get started](https://developers.cloudflare.com/r2/get-started/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Contoh hitung fiktif untuk uji

Suami memiliki pemasukan eksternal 10.000.000, alokasi eksternal 6.500.000, dan rencana kiriman 1.000.000. Istri memiliki pemasukan eksternal 2.000.000 dan alokasi eksternal 1.300.000.

- Sisa suami = 10.000.000 − 6.500.000 − 1.000.000 = 2.500.000.
- Dana anggaran istri = 2.000.000 + 1.000.000 = 3.000.000. Sisa istri = 1.700.000.
- Gabungan: pemasukan 12.000.000, alokasi 7.800.000, sisa 4.200.000. Tidak memakai pemasukan 13.000.000 atau menghitung kiriman sebagai belanja.
- Catatan pengeluaran suami 175.000 dan istri 120.000 → E = 295.000; I − E = 11.705.000, tanpa klaim saldo bank.
- Kiriman nyata 900.000 terlihat keluar dan masuk pada kedua bagian. E tetap 295.000. Rencana 1.000.000 tetap berbeda dari realisasi 900.000.

## Kriteria penerimaan tambahan

| ID | Bukti yang harus diuji pada aplikasi nyata |
| --- | --- |
| B1 | Akun istri dapat membuat/mengubah anggaran dan pengeluaran sendiri; suami dapat melihat tetapi mutasinya ditolak backend |
| B2 | Aturan kebalikan berlaku pada akun suami, termasuk penggantian ID pada URL/body |
| B3 | Contoh angka gabungan di atas cocok; rencana dan kiriman nyata tidak menggandakan total |
| B4 | Pengeluaran tanpa gambar tersimpan dan ikut realisasi; tidak wajib melampirkan bukti |
| B5 | Beberapa JPG/PNG valid bisa diunggah dan dibuka oleh kedua sesi; file ilegal, oversize, gambar rusak dan kelebihan jumlah ditolak server |
| B6 | Pengguna anonim tidak bisa membuka gambar meski mengetahui ID; pasangan tidak dapat mengubah bukti pihak lain |
| B7 | Retry unggah/submit tidak menggandakan catatan; kegagalan R2/D1 tidak menghasilkan gambar ready palsu atau akses bukti yang sudah dihapus |
| B8 | Salin bulan hanya membawa rencana milik akun aktif, bukan realisasi, kiriman nyata, bukti atau anggaran pasangan |
| B9 | Backup/restore memulihkan metadata dan gambar yang sama; pemeriksaan objek hilang dan checksum gagal dilaporkan |
| B10 | Dashboard dan kedua bagian lulus pemeriksaan desktop/ponsel, status unggah jelas dan bukti dapat ditutup memakai keyboard |

Catatan tahap prototipe di atas bersifat arsip. Versi dasar kini memakai backend Pages/Neon dengan otorisasi, sinkronisasi dan backup yang sudah diuji. Kandidat 16 November 2026 menggabungkan visual donut/batang, dashboard tahun serta bukti pemasukan di bawah; status dan batas pemeriksaan terkini ada di TESTING.md.

## Tambahan disetujui: bukti pos pemasukan bulanan

Pengguna menyetujui JPG/PNG opsional langsung pada pos pemasukan. Kedua akun dapat melihat, hanya pemilik pos yang mengunggah/menghapus. Maksimal10gambar/pos,5MB/gambar, batas dimensi dan decode sama dengan bukti pengeluaran. Lampiran tidak membuat realisasi/pemasukan kedua, tidak mengubah nominal dan tidak ikut salin bulan. Pos dihapus: bukti dinonaktifkan dan objek privat menunggu pembersihan. Data baru memakai Neon yang sama dan bucket privat evidence yang sudah ada; tidak menambah layanan atau akun.
