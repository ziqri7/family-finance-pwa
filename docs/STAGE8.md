# Tahap 8 — rancangan uji penerimaan pengguna

Status: ditutup berdasarkan keputusan pengguna pada 14 November 2026. Langkah 1–3 diterima melalui percobaan pengguna. Pengguna mempercayai sampel dan memilih melanjutkan tanpa mencoba langkah 4–5 secara manual; keduanya bukan hasil uji pengguna yang lulus. Bukti pengujian agen tetap terpisah di STAGE7.md dan TESTING.md.

Tujuan: pengguna menilai apakah aplikasi yang sudah dibangun sesuai kebutuhannya dan nyaman dipakai. Tidak menetapkan desain, fitur, atau arsitektur baru. Perbaikan rutin hanya berdasarkan masalah yang ditemukan; perubahan kebutuhan material dibahas lebih dahulu.

## Usulan pelaksanaan

Gunakan lingkungan sementara dengan data dummy, terpisah dari anggaran November. Pengguna mencoba sendiri, agen membantu menyiapkan dan mencatat hasil. Uji lokal ini tidak membuktikan penggunaan melalui internet atau pemasangan di ponsel fisik.

| Langkah | Percobaan | Penerimaan pengguna |
| --- | --- | --- |
| 1 | Buka bagian suami, isi pemasukan 10.000.000 dan total alokasi 7.000.000, tinggalkan kolom hingga Tersimpan. Periksa sisa 3.000.000 dan persentase. | Diterima pengguna: “ya cocok sudah”, 14 November 2026. Berdasarkan laporan pengguna, bukan pemeriksaan layar ulang agen. |
| 2 | Tambah satu pos dummy, ubah nama/nominalnya, lalu periksa apakah tindakan dan statusnya mudah dipahami. | Diterima pengguna: “sip udah”, 14 November 2026, setelah instruksi tambah Latihan 100.000 lalu ubah menjadi Latihan tambahan 200.000. Berdasarkan laporan pengguna. |
| 3 | Catat pengeluaran dummy 25.000, pilih JPG/PNG ilustrasi opsional, lalu buka buktinya dari catatan. | Diterima pengguna: “sip berhasil”, 14 November 2026, setelah instruksi menyimpan Belanja latihan 25.000 dan membuka PNG ilustrasi. Berdasarkan laporan pengguna. |
| 4 | Masuk dengan akun istri dummy, isi bagiannya dan lihat ringkasan gabungan. Periksa bagian pasangan hanya baca serta arti kiriman internal. | Dilewati atas keputusan pengguna, 14 November 2026; tidak dinyatakan lulus manual. |
| 5 | Salin rencana ke bulan dummy berikutnya. Periksa nilai rencana terbawa sementara pengeluaran/bukti tidak ikut. | Dilewati atas keputusan pengguna, 14 November 2026; tidak dinyatakan lulus manual. |

Setelah setiap langkah, catat: berhasil/tidak, bagian yang membingungkan, dan perbaikan yang diperlukan. Jangan menandai lulus hanya berdasarkan tes otomatis atau tindakan agen. Tidak perlu memasukkan nominal atau gambar pribadi untuk penilaian ini.

## Usulan model dan cara pemeriksaan

- Model: tetap GPT-6.1 Sol jika tersedia, reasoning Medium untuk pendampingan uji rutin. High digunakan bila ditemukan bug yang membutuhkan analisis lebih sulit. Ketersediaan menu/model aktif belum diverifikasi; tidak mengklaim pergantian sudah dilakukan.
- Utama: verification-before-completion, mencatat bukti dan keputusan penerimaan per langkah.
- Pendamping: computer-use untuk membuka lingkungan dan memeriksa layar; systematic-debugging hanya bila ada kegagalan. Tidak mengulang seluruh pengujian tahap 7 tanpa perubahan yang relevan.
- Tanpa subagen baru. Keputusan kenyamanan/penerimaan berasal dari pengguna.

Lingkungan latihan sementara tersedia di http://127.0.0.1:5187/ dengan akun suami dummy sudah masuk dan kolom Januari 2001 masih kosong. Data hanya untuk latihan dan terpisah dari November pengguna. Jangan menutup proses lingkungan ini sebelum pengguna selesai; data sementara hilang saat proses dihentikan. Publikasi dan deployment tetap pada tahap 9–10 dengan persetujuan terkait.
