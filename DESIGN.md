---
name: Financée — Caku
description: Anggaran keluarga dengan kartu pemilik dan catatan ringkas
colors:
  primary: "#7042b3"
  primary-deep: "#59318f"
  primary-tint: "#eee7f7"
  husband-start: "#6339a6"
  husband-end: "#8054b8"
  wife-start: "#d7eebd"
  wife-end: "#a6cc82"
  wife-ink: "#243b19"
  card-footer: "#262330"
  wife-footer: "#293928"
  canvas: "#f3f4f6"
  surface: "#ffffff"
  ink: "#22242a"
  muted: "#61636e"
  line: "#dfe0e6"
  expense: "#a6332e"
  focus: "#7042b3"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.7px"
  headline:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.8px"
  title:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    letterSpacing: "-0.35px"
  label:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "12px"
rounded:
  field: "8px"
  button: "10px"
  action: "12px"
  surface: "16px"
spacing:
  compact: "8px"
  control: "12px"
  section: "20px"
  surface: "24px"
  columns: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  action:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "10px 23px"
  input:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.field}"
  records:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "23px"
---

# Design System: Financée — Caku

## Overview

**Creative North Star: "Anggaran berdua, terbaca sekali lihat"**

Arah aktif adalah adaptasi Caku yang dipilih pengguna melalui “caku tapi fontnya juga diupdate, sudah berapa design contoh fontnya masih sama, dan juga animasinya tapi tetap ringan”. Karakternya berupa kartu anggaran berwarna, ruang abu terang, catatan putih yang padat, dan navigasi yang mudah dikenali di ponsel. Caku beserta font dan gerak ringan telah diterima melalui permintaan lanjut ke tahap 6. Versi dasar dan pembaruan visual sudah dirilis; pembaruan terakhir 16 November 2026.

Referensi tepat: [Caku Finance App Mobile](https://www.figma.com/community/file/1341326234352864806/caku-finance-app-mobile), Asril Mochammad / Getah Creative. Peninjauan mencakup cover dan preview, bukan seluruh frame. Font asli referensi belum diidentifikasi. Kartu pada adaptasi menunjukkan anggaran pemilik; semua ringkasan memakai hitungan aplikasi yang sama dan transfer internal dikeluarkan dari total eksternal keluarga. Keputusan produk tetap mengikuti PRODUCT.md dan docs/REVISI_KELUARGA.md.

**Key Characteristics:**

Implementasi aktif tahap 6 berada pada `src/styles.css` dan komponen React di `src/`; rujukan `prototype/` di dokumen ini adalah arsip arah visual. Aplikasi aktual memakai animasi `view-enter` 160 ms serta API bersesi dan penyimpanan Neon privat. Bukti render dan batas verifikasi terbaru dicatat pada `docs/TESTING.md`.

- Kartu suami ungu dan istri hijau dengan bagian bawah gelap.
- Catatan pengeluaran ringkas, bukti terlihat, nominal mudah dipindai.
- Plus Jakarta Sans lokal dan gerak singkat yang menghormati preferensi pengguna.

Riwayat: Editorial A pernah disetujui sebagai bahasa visual dan contoh pengisian tahap 4. GoPay dan Flip kemudian dibuat sebagai alternatif dengan komposisi berbeda; pilihan terbaru menjadikan Caku arah aktif. Editorial A (`?style=editorial`), GoPay (`?style=gopay`), dan Flip (`?style=flip`) tetap dapat dibuka untuk pembanding historis. Default prototipe kini Caku (`?style=caku`); riwayat ini tidak membatalkan keputusan produk.

## Colors

Ungu menjadi aksen tindakan dan identitas kartu suami; hijau muda membedakan kartu istri. Token frontmatter diambil dari prototype/caku.css, dengan warna fokus aktif mengikuti aksen Caku melalui override di prototype/fintech.css.

### Primary

**Ungu aktif**, **ungu dalam**, dan **ungu lembut** membedakan tindakan utama, teks tindakan, dan latar terpilih. Kartu suami menggunakan gradasi dua token husband; warna akhir membantu bidang kartu tetap jelas tanpa tekstur dekoratif.

### Secondary

**Hijau ringan** pada dua token wife dipadukan dengan **tinta hijau** untuk kartu istri. Bagian bawah kartu memakai warna gelap masing-masing pemilik.

### Neutral

**Abu kanvas**, **putih permukaan**, **tinta utama**, **abu keterangan**, serta **garis tipis** membentuk daftar dan area input. **Merah pengeluaran** memberi penekanan nominal pada catatan. **Ungu fokus** menandai navigasi keyboard dengan warna aksen aktif.

**The Makna Angka Rule.** Label dan konteks menjelaskan anggaran serta pengeluaran; warna tidak boleh membuat sisa anggaran terbaca sebagai saldo rekening.

## Typography

**Display Font:** Plus Jakarta Sans, fallback Segoe UI dan sans-serif.
**Body Font:** Plus Jakarta Sans dengan fallback yang sama; label, input, tombol dan navigasi mewarisi keluarga ini.

Font variable lokal berada di `prototype/fonts/plus-jakarta-sans-latin-variable.woff2` (27.348 byte), bobot tersedia 200–800, dengan `font-display: swap` dan lisensi OFL di folder yang sama. Ini pilihan adaptasi baru, bukan klaim font asli Caku. Pemeriksaan runtime menunjukkan fontLoaded true serta Plus Jakarta Sans pada body dan input. Pengguna telah menerima arah ini melalui permintaan lanjut. Render implementasi React lokal juga diperiksa; bukti dan batas pengujian ada di docs/TESTING.md.

### Hierarchy

- **Display:** nominal kartu mengikuti token display; mengecil menjadi 30 px di mobile dan 28 px pada lebar paling sempit. Digit memakai tabular-nums.
- **Headline:** judul halaman mengikuti token headline; menjadi 24 px pada ponsel.
- **Title:** judul bagian mengikuti token title; menjadi 18 px pada ponsel.
- **Body / Label:** rincian dan tombol umumnya 12–14 px, nama catatan 13 px; label navigasi ponsel 11 px. Pertahankan keterangan singkat dan pemisahan nominal yang jelas.

## Layout

Wadah utama maksimal 1080 px. Desktop memakai dua kartu berdampingan dengan jarak 20 px; area catatan dan rincian di bawahnya memiliki perbandingan kolom 1,55:1 dan jarak 32 px. Di bawah 760 px kartu menjadi deck horizontal dengan scroll-snap: setiap kartu selebar 86% area deck, naik menjadi 94% pada lebar maksimal 360 px. Scroll horizontal hanya untuk deck, bukan seluruh halaman.

Di bawah 640 px margin konten 18 px dan ruang bawah 115 px menjaga konten terbaca di atas navigasi tetap. Ringkasan keluarga disusun ulang agar nominal utama mudah dipindai. Area anggaran tetap menyediakan input nominal langsung, persentase, sisa, serta tambah/ubah/hapus pos. Informasi pasangan memakai status hanya baca.

Pemeriksaan akhir setelah font/gerak baru mencakup render desktop 1280 px dan mobile 390/320 px tanpa overflow halaman. Pada 320 px, nominal Rp1 triliun serta sisa negatif Rp7,5 juta tetap berada dalam area selebar 305 px; sisa negatif ditandai merah. Runtime memakai Plus Jakarta Sans pada body/input dan animasi caku-enter berdurasi 0,16 detik. Uji fungsi sebelumnya mencakup pengisian dan hitungan, dua bukti dalam viewer, batas akun simulasi, bulan “Belum dibuat”, serta penolakan nominal tidak sah. Preferensi reduced motion pada OS dan performa ponsel fisik belum diuji. Penutupan temuan P2 mengenai cakupan sumber tidak setara audit visual menyeluruh.

## Elevation & Depth

Permukaan utama mengandalkan warna bidang, radius dan garis; kartu tidak memakai bayangan berat. Kedalaman kartu datang dari gradasi halus dan bagian bawah gelap. Dialog memakai backdrop gelap transparan, sedangkan toast mewarisi bayangan kecil dari prototipe dasar.

Gerak masuk halaman hanya 160 ms, `cubic-bezier(.22,1,.36,1)`, opacity 0,92 menuju 1 dan posisi vertikal 6 px menuju 0. Tekanan tombol memakai skala 0,98 dengan transisi 120 ms ease-out. Gerak tersedia saat `prefers-reduced-motion: no-preference`; mode reduce mematikan animasi/transisi dan memakai scroll otomatis. Tidak menambah pustaka animasi JavaScript.

## Shapes

Kartu, wadah catatan dan dialog memakai sudut membulat besar. Tombol utama lebih rapat; akses cepat sedikit lebih bulat. Input memiliki batas jelas dan garis fokus, sedangkan ikon catatan serta tombol Catat tengah memakai bentuk lingkaran. Ukuran radius kanonis ada di frontmatter.

## Components

### Buttons

Tombol utama memakai ungu dan teks putih, menjadi ungu dalam saat hover. Akses cepat berupa bidang putih bergaris, menjadi ungu lembut saat hover. Fokus keyboard berupa outline ungu 3 px dengan offset 3 px; tombol dinonaktifkan tetap memiliki keadaan jelas. Tekanan ringan mengikuti aturan gerak di atas.

### Cards / Containers

Dua kartu anggaran menampilkan pemilik, nominal, rincian dan akses membuka bagian masing-masing. Bagian bawah gelap menjaga label dan tindakan terlihat. Padding kartu desktop 23 px 25 px 20 px; mobile 21 px 22 px 18 px. Wadah catatan putih memakai padding 23 px, menjadi 18 px pada mobile.

### Inputs / Fields

Nominal terisi langsung dalam bidang putih; fokus mengubah batas menjadi ungu dengan outline 1 px tanpa glow. Nilai tidak sah memakai penanda error dan pesan. Kolom memakai antrean simpan backend dengan status tersimpan/gagal/konflik; draf dipertahankan dalam sesi tab. Status hanya baca mengikuti pemilik dan diperiksa kembali di backend.

### Navigation

Desktop memakai navigasi atas. Ponsel memiliki lima item: Dashboard keluarga, Bagian suami, Catat, Bagian istri, dan Bukti; Catat menjadi lingkaran ungu yang terangkat di tengah. Label dan ikon aktif memakai ungu dalam. Navigasi bawah menghormati safe-area-inset-bottom.

### Catatan dan bukti

Daftar putih padat memakai ikon bundar, nama, konteks, nominal dan tindakan. Thumbnail bukti berukuran 44 × 51 px; viewer menampilkan gambar dengan konteks dan tombol Tutup. Bukti JPG/PNG opsional dapat berjumlah lebih dari satu. Tindakan edit mengikuti pemilik; kedua akun dapat membaca data keluarga.

## Do's and Don'ts

### Do:

- **Do** gunakan Caku sebagai arah aktif dan token CSS sebagai sumber bentuk yang berjalan.
- **Do** jaga input nominal, persentase dan sisa mudah ditemukan pada desktop serta ponsel.
- **Do** tampilkan label ilustrasi, status hanya baca, fokus keyboard dan keadaan error dengan jelas.
- **Do** hormati reduced motion dan periksa ulang render setelah perubahan font atau gerak.

### Don't:

- **Don't** menyebut sisa anggaran sebagai saldo rekening atau menambahkan fungsi transfer uang.
- **Don't** menghitung kiriman internal sebagai pemasukan atau pengeluaran eksternal keluarga.
- **Don't** mengklaim font asli Caku, inspeksi seluruh frame, atau audit visual menyeluruh.
- **Don't** menganggap prototipe memori tab sebagai aplikasi produksi yang sudah tersinkron.

## Penerapan visual yang disetujui — 16 November 2026

Beranda memakai tab Bulan/Tahun, tiga nominal ringkas, donut pembagian alokasi terisi (tiga pos terbesar dan kelompok sisanya), serta batang pemasukan anggaran/pengeluaran nyata. Tahun memakai rasio berbobot dan batang 12 bulan dengan detail bulan. Angka dan label tetap menjelaskan data tanpa mengandalkan warna; metode tersedia dalam dialog info. Kosong tetap —, nol tetap nol.

Kartu Suami ungu/Istri hijau, kolom langsung dan pemisah ribuan dipertahankan; tiap pos alokasi mendapat batang proporsi. Galeri Bukti menyatukan gambar pemasukan/pengeluaran siap dengan filter jenis. Gambar melalui API privat. CSS aktif di src/styles.css dan src/components/visual-finance.css; diagram tanpa dependensi baru. Plus Jakarta Sans dan reduced motion tetap berlaku. Pembaruan ini sudah ditayangkan pada 16 November 2026; bukti render dan fungsi ada di docs/TESTING.md.

## Alokasi aktual — disetujui dan dirilis 16 November 2026

Bahasa Caku/Jakarta dan diagram dipertahankan. Setiap baris non-income menampilkan Tercatat otomatis atau Alur lama, jenis pembagian, akses jenis/tanggal serta bukti langsung. Tinjau pencatatan memakai dialog agar selisih nominal pos dengan catatan lama terlihat sebelum konversi. Angka ringkas memakai hingga dua desimal dan nominal rupiah lengkap pada label/title. Sisa disebut Sisa belum dibagi; uang disisihkan terpisah dari belanja. Pasangan hanya membaca. Seluruh status simpan/error/draf tetap berlaku; perubahan semantik tidak mengganti arah visual.

## UX ringkas — visual, alur dan rilis disetujui 16 November 2026

Caku/Jakarta tetap. Beranda membuka bagian akun aktif dan kelompok pembagian, dengan konteks Saya/Pasangan/Keluarga serta tiga menu Beranda/Catat/Bukti. Dialog Pemasukan hanya memuat pemasukan sendiri. Kelola pos membuka rincian struktur dan catatan lama. Belanja terbaru tampil di Beranda. Ringkasan grafik bulan/tahun berada pada Keluarga.

Satu layar memuat nominal perpos, checkbox, total dan bukti bersama. Setelah konfirmasi berhasil kembali ke Beranda; upload gagal menyediakan retry dan penghapusan reservasi tertunda. Tabungan sendiri memakai label Tabungan/Sudah ditabung. Status konflik, sesi habis, nol/kosong dan angka terlalu besar tetap jelas. Bukti render mobile/desktop dan batas uji ada di TESTING.md.

## Buku keluarga, 18 November 2026

Preview disetujui sebelum implementasi. Identitas Caku, font lokal dan warna tetap. Beranda memakai ringkasan sisa/pemasukan/sudah dibagi serta daftar nominal; navigasi hanya Beranda/Bukti. Rincian per pos memuat pengaturan tracking dan pemakaian. Lihat bukti langsung menampilkan gambar serta pos terpilih; daftar centang hanya ketika membuat/mengubah tautan. Grafik dan penjelasan hitungan berada pada tindakan terkait. Semua pos biasa secara awal; tidak ada dompet pasangan atau pilihan Disisihkan.
