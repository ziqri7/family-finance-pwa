# Financée

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Aplikasi lokal tahap 6: React, Vite, TypeScript, Tailwind CSS, komponen berpola shadcn/Radix, Cloudflare Workers, Hono, D1, Drizzle serta R2 privat. Prototipe tahap 4 tetap arsip terpisah; aplikasi aktual memakai API dan penyimpanan lokal.

## Users

Suami dan istri yang mengisi anggaran serta pengeluaran masing-masing melalui ponsel. Kedua akun membaca data keluarga; setiap akun hanya mengubah data miliknya.

## Product Purpose

Mengisi pemasukan/alokasi langsung, mencatat pengeluaran nyata dengan bukti opsional, serta melihat dashboard gabungan dan rincian suami/istri. Kiriman antar pasangan dicatat satu kali dan dikeluarkan dari total eksternal keluarga.

## Operating Context

Struktur dan rumus mengikuti Keu.xlsx yang diperiksa pada tahap 2 dan diperiksa ulang saat provisioning lokal: 16 label serta 74 rumus/hasil cache cocok. Pengguna memilih pos bawaan yang bisa ditambah/diubah/dihapus, simpan otomatis setelah selesai mengisi kolom, dan tanpa impor atau ekspor Excel. Nominal historis tidak disalin; label sumber disiapkan secara privat.

## Capabilities and Constraints

Periode bulanan, salin rencana sendiri tanpa realisasi/bukti, dua akun dengan batas kepemilikan, polling online, aset PWA, self-host Cloudflare, MIT. Bukti JPG/PNG opsional beberapa gambar per pengeluaran; kedua pihak dapat melihatnya. Detail keputusan 1A–6B ada di docs/REVISI_KELUARGA.md. Backend, akun, D1/R2 lokal, backup dan pemeriksaan pemulihan telah dijalankan. Kandidat kode publik tidak memuat nilai secret lokal/workbook. Belum ada publikasi atau deployment baru; aktivasi R2 remote dan potensi biaya memerlukan keputusan pada tahap deployment. Instalasi perangkat fisik dan batas runtime Cloudflare nyata belum dinyatakan lulus.

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
