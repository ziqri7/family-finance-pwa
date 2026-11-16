# Financée

## Keputusan Alokasi aktual — 16 November 2026

Pengguna mengisi nominal Alokasi setelah uang dibayar atau diserahkan. Preview dan rancangan implementasi telah disetujui. Kandidat lokal menerapkan sumber nominal tunggal dengan catatan turunan, bukti langsung, peninjauan data lama, tiga jenis pembagian dan salin struktur tanpa nominal. Rumus rencana dari workbook tetap sebagai referensi historis yang teruji; sumber ringkasan aktual kini mengikuti catatan efektif, bukan rencana lama. Ini keputusan produk eksplisit, bukan klaim rumus baru dari Excel. Kandidat belum dirilis.


Status 16 November 2026: seluruh paket yang disetujui sudah ditayangkan setelah persetujuan pengguna dan diperiksa online. Input langsung, rumus, batas kepemilikan, dan sandi aktif dipertahankan.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, Vite, TypeScript, Tailwind CSS, komponen berpola shadcn/Radix, Cloudflare Pages Functions/Hono, Neon PostgreSQL, Drizzle serta Neon Object Storage privat. Integrasi dasar sudah dirilis. Kandidat visual 16 November 2026 diuji terpisah dari data keluarga.

## Users

Suami dan istri yang mengisi anggaran serta pengeluaran masing-masing melalui ponsel. Kedua akun membaca data keluarga; setiap akun hanya mengubah data miliknya.

## Product Purpose

Mengisi pemasukan/alokasi langsung, mencatat pengeluaran nyata dengan bukti opsional, serta melihat dashboard gabungan dan rincian suami/istri. Kiriman antar pasangan dicatat satu kali dan dikeluarkan dari total eksternal keluarga.

## Operating Context

Struktur dan rumus mengikuti Keu.xlsx yang diperiksa pada tahap 2 dan diperiksa ulang saat provisioning lokal: 16 label serta 74 rumus/hasil cache cocok. Pengguna memilih pos bawaan yang bisa ditambah/diubah/dihapus, simpan otomatis setelah selesai mengisi kolom, dan tanpa impor atau ekspor Excel. Nominal historis tidak disalin; label sumber disiapkan secara privat.

## Capabilities and Constraints

Periode bulanan, salin rencana sendiri tanpa realisasi/bukti, dua akun dengan batas kepemilikan, polling online, aset PWA, self-host Cloudflare, MIT. Bukti JPG/PNG opsional beberapa gambar per pengeluaran; kedua pihak dapat melihatnya. Detail keputusan 1A–6B ada di docs/REVISI_KELUARGA.md. Versi Pages/Neon beserta visual, ringkasan tahun dan bukti pemasukan sudah dirilis; bukti aktual dan keterbatasan ada di TESTING.md. Integrasi memakai akun Cloudflare dan Neon milik setiap keluarga, dengan Free tier yang dibatasi kuota. Tidak memindahkan nominal lama otomatis. Instalasi perangkat fisik dan batas runtime Cloudflare nyata belum dinyatakan lulus.

## Brand Commitments

Nama tampilan Financée. Nama teknis proyek tetap family-finance-pwa. Bahasa antarmuka Indonesia. Pengguna memilih Caku sebagai arah visual utama setelah melihat alternatif Editorial A, GoPay dan Flip. Persetujuan terbaru disertai permintaan font baru dan animasi yang tetap ringan. Alur pengisian langsung tahap 4 tetap menjadi acuan fungsi. Acuan visual aktif ada dalam DESIGN.md; spesifikasi tahap 5 ada di docs/PRD.md, docs/ARCHITECTURE.md, dan docs/DATABASE.md.

Aplikasi lokal memakai adaptasi Caku: kartu anggaran suami/istri, catatan pengeluaran dan bukti, serta tombol Catat di tengah navigasi ponsel. Plus Jakarta Sans disimpan lokal; animasi singkat memakai CSS dan mengikuti pengaturan kurangi animasi. Font ini pilihan adaptasi, bukan klaim font asli Caku. Pengguna menerima pembaruan lewat permintaan lanjut tahap 6. Prototipe beserta alternatif lama tetap menjadi arsip pembanding; aplikasi aktual berada pada src/ dan tidak memakai pemilih gaya prototipe.

## Evidence on Hand

docs/KEBUTUHAN.md, docs/ALUR_PENGGUNAAN.md, docs/TESTING.md, kode dan pemetaan privat workbook. Nominal keluarga tidak digunakan sebagai data dummy. Seluruh angka uji sengaja fiktif dan dipisahkan dari anggaran bulan kerja pengguna.

## Product Principles

- Kolom pengisian segera tersedia.
- Perhitungan mengikuti sumber yang diperiksa.
- Status penyimpanan harus jujur.
- Setiap tahap berhenti untuk pemeriksaan pengguna sebelum tahap berikutnya.

## Pergantian sandi yang disetujui

Tombol kunci di area akun membuka dialog sandi lama/baru/konfirmasi. Sandi baru 15–128 karakter; seluruh sesi akun sendiri dicabut setelah sukses, pasangan tetap aktif. Hash aktif tersimpan Neon, kunci pelindung terpisah pada secret Cloudflare. Implementasi diuji memakai akun dummy sebelum tinjauan rilis baru.

## Ringkasan lintas bulan

Pengguna menyetujui ringkasan tahun kalender dan satu grafik tren bulanan. Rasio berbobot total nominal, data keluarga gabungan, tanpa kiriman internal. Cakupan bulan terisi terlihat dan bulan belum lengkap tidak dianggap nol. Bahasa visual Caku/Plus Jakarta Sans dipertahankan. Pada 16 November 2026 pengguna menginstruksikan “kerjakan semua”: dashboard, visual yang telah disetujui, dan bukti pemasukan digabung sebagai satu kandidat.

## Bukti pemasukan yang disetujui

JPG/PNG opsional langsung pada pos pemasukan bulanan, pemilik mengunggah/menghapus dan kedua akun melihat. Memakai pola bukti pengeluaran, layanan dan bucket privat yang sama. Tidak membuat transaksi kedua atau mengubah rumus. Salin bulan membawa rencana saja.
