# Arsitektur Financée — Cloudflare + Neon

Integrasi Neon disetujui sebagai pengganti D1/R2. UI, hitungan dan hak akses tidak berubah. Implementasi berada pada kandidat terisolasi; produksi belum dirilis. Hasil aktual dan batas bukti ada di TESTING.md dan NEON_REVIEW.md.

## Komponen

```mermaid
flowchart LR
 A[PWA suami] -->|HTTPS cookie sesi| W[Cloudflare Worker: Vite + Hono]
 B[PWA istri] -->|HTTPS cookie sesi| W
 W --> V[Validasi dan kepemilikan backend]
 V --> D[(Neon PostgreSQL)]
 V --> S[(Neon Object Storage Private)]
 K[Secret instalasi sendiri] --> W
```

Satu keluarga memakai akun Cloudflare dan Neon sendiri. Tidak ada server pusat, registrasi bebas, layanan email, koneksi bank, analytics atau pelaksanaan transfer uang. Neon Auth, Functions, Realtime dan AI Gateway tidak diperlukan.

## Database dan transaksi

- Skema Drizzle memakai pg-core. Snapshot bulan memakai Drizzle neon-http; mutasi memakai query PostgreSQL terikat parameter melalui worker/db/postgres.ts. Placeholder $1, $2 dan sintaks PostgreSQL ditulis eksplisit; bukan emulasi SQLite.
- Neon HTTP transaction menjalankan advisory transaction lock keluarga 61324017 sebagai pernyataan pertama, sebelum data dibaca/ditulis, dalam READ COMMITTED. Adapter batch dan snapshot Drizzle mengikuti urutan sama. Ini menyerialkan dua penulis untuk kuota dan relasi serta menjaga snapshot tidak bercampur revisi. Tiap instalasi mempunyai database sendiri, sehingga lock ini tidak mengunci keluarga lain.
- Tidak ada koneksi WebSocket global atau transaksi interaktif pada Worker. Koneksi HTTP dibuat per request. Tidak mengulang otomatis transaksi yang jawabannya hilang karena commit mungkin sudah terjadi.
- Nominal dan waktu milidetik memakai BIGINT. Nilai kembali diparsing sebagai number aman; parser menolak integer di luar rentang aman JavaScript. Nominal dibatasi 1 triliun rupiah per pos/catatan. Posisi/versi memakai INTEGER.
- Constraint komposit mengikat pos, bulan dan pemilik. Trigger memeriksa relasi aktif, kuota dan revisi. Semua skrip pemeliharaan mengambil lock sebelum operasi; SQL manual harus mengikuti urutan sama agar tidak berbalik urutan lock baris.
- Pembuatan/salin bulan merupakan transaksi INSERT…SELECT; sumber tidak tersedia tidak membuat target kosong, target yang sudah ada tidak ditimpa. Hanya rencana pemilik disalin, tanpa realisasi/gambar.

## Autentikasi dan keamanan

- Tepat dua akun partner-a/partner-b dari AUTH_USERS_JSON. Nama login/hash tidak masuk frontend atau GitHub. Provisioning menghasilkan sandi acak 24 byte; PBKDF2-SHA256 100.000 iterasi, salt acak 16 byte. Tidak menerima sandi bebas lemah atau menurunkan hash untuk mengatasi batas CPU.
- Cookie produksi __Host-ff_session: Secure, HttpOnly, SameSite=Strict, Path=/, tanpa Domain. PostgreSQL hanya menyimpan SHA-256 token, account ID, fingerprint HMAC dan kedaluwarsa tujuh hari. Logout mencabut sesi server; pergantian konfigurasi akun/SESSION_SECRET membatalkan sesi melalui fingerprint.
- Batas login atomik: lima percobaan per IP+identitas dan 30 per IP dalam 15 menit. Kunci HMAC, tanpa IP/email mentah. Respons akun tidak dikenal dan sandi salah sama.
- Setiap API kecuali login memerlukan sesi. Kedua akun membaca keluarga; hanya pemilik mengubah bagiannya. Owner dari input klien tidak dipercaya, termasuk pada retry dan referensi relasi. Kiriman masuk adalah turunan hanya baca.
- Mutasi memerlukan Origin tepat, tipe body benar, validasi Zod dan batas aktual 16 KiB untuk JSON. PUT gambar maksimal 5 MiB, JPG/PNG yang benar-benar didekode, batas dimensi/piksel/memori. Tidak ada endpoint upload workbook.
- Secret DATABASE_URL dan kredensial S3 hanya backend. Frontend menghubungi origin aplikasi sendiri. CSP aset lokal, nosniff, no-referrer, frame denial dan no-store berlaku pada API. Error tidak mengembalikan SQL atau konfigurasi. Observability default nonaktif; jangan mencatat sandi, token, nominal atau isi gambar.

## Kontrak API

Semua path di bawah /api. Semua endpoint selain POST /login memerlukan sesi valid. Respons kesalahan memakai {error:{code,message}}; 409 boleh menyertakan nilai terbaru untuk konflik pada data milik sesi. Snapshot bulan sekarang memuat dua bagian dan dashboard; GET boleh membaca pasangan, seluruh mutasi anggaran hanya pemilik.

| Metode dan path | Input / hasil |
| --- | --- |
| POST /login | email, password → cookie sesi dan nama tampilan |
| GET /me | Identitas tampilan akun aktif tanpa hash/kredensial |
| POST /logout | Cabut sesi; hapus cookie |
| GET /periods | Daftar ID bulan dan revision |
| POST /periods | id, mode, sourcePeriodId → buat periode bila belum ada dan anggaran milik sesi saja; salin hanya rencana pemilik |
| GET /periods/:id?revision=n | Snapshot konsisten; unchanged:true bila revisi sama |
| POST /periods/:id/items | id acak buatan klien, label, kind → baris baru nominal null |
| PATCH /items/:id | field: label atau amount, value, expectedVersion → nilai kanonik dan versi terbaru |
| DELETE /items/:id | expectedRowVersion → tombstone, bukan menghapus pos bulan lain |
| POST /expenses | id, date, itemId, note, amount → pengeluaran milik sesi |
| PATCH /expenses/:id | data lengkap, expectedVersion → ubah hanya pengeluaran sendiri |
| DELETE /expenses/:id | expectedVersion → hapus milik sendiri dan cabut akses bukti |
| POST /transfers | id, date, sourceItemId, amount → pengirim dari sesi, penerima pasangan otomatis |
| DELETE /transfers/:id | expectedVersion → hanya pengirim; tampilan kedua pihak diperbarui |
| POST /expenses/:id/attachments | id, contentType, byteSize, sha256 → reservasi slot upload milik sendiri |
| PUT /attachments/:id/content | bytes JPG/PNG → validasi dan simpan, tandai ready setelah konfirmasi |
| GET /attachments/:id/content | kedua akun dapat membaca ready jika pengeluaran induk aktif |
| DELETE /attachments/:id | pemilik pengeluaran saja; tandai deleting dan cabut akses sebelum hapus objek |

Kode: 400 input tidak valid; 401 sesi tidak valid/kedaluwarsa; 403 origin tidak diizinkan; 404 bulan/pos tidak ada; 409 versi berbeda atau bulan sudah ada; 413 body terlalu besar; 415 tipe body salah; 429 batas login; 500 kesalahan internal. Pos yang dihapus mengembalikan 409 ITEM_DELETED saat diedit. API tidak menerima total atau persentase dari klien.


## Draf, konflik dan sinkronisasi

React memisahkan snapshot dan draf per itemId+field. Maksimal satu request per kolom; jawaban terlambat tidak menandai draf baru tersimpan. CAS nama/nominal mempunyai versi terpisah, row_version untuk hapus. Expense/transfer mempunyai versi catatan. Retry nilai sama boleh berhasil tanpa menulis lagi; payload berbeda/ID tombstone ditolak. Konflik memerlukan keputusan pengguna sebelum mencoba versi baru.

Polling setiap 10 detik hanya saat tab terlihat dan online; berhenti saat sesi tidak aktif. Tidak menjanjikan realtime seketika. Tab terbuka dapat mempertahankan compute Neon aktif. Internal transfer tidak dihitung sebagai pemasukan/pengeluaran eksternal keluarga. Rumus domain tetap mengikuti workbook terverifikasi; tidak mengarang saldo rekening.

## Gambar privat dan kegagalan lintas layanan

Bucket evidence harus Private. Adapter S3 memakai aws4fetch SigV4, endpoint cabang, path-style dan region hasil CLI Neon (proyek Singapura yang diuji: ap-southeast-1). Kredensial storage scoped read/write cabang; tidak membuat URL publik/presigned. GET bukti selalu diproxy backend setelah sesi, status ready dan induk aktif diperiksa.

Reservasi ID tetap dengan checksum/ukuran, maksimal 10 pending/ready per pengeluaran. Key acak dibuat server, bukan nama asli. PUT memvalidasi isi, menulis storage lalu memfinalisasi PostgreSQL bila induk masih aktif. Jika jawaban hilang, ulangi ID/checksum sama. Bukti pending tidak dapat dibaca. Hapus mencabut metadata dahulu, lalu objek; deleting dipertahankan untuk pemeliharaan. Kegagalan SQL tidak membatalkan objek S3. Adapter tidak menambahkan retry tersembunyi.

## PWA dan data privat

Service worker hanya menyimpan shell, font dan aset; API, data keluarga, cookie dan gambar tidak masuk cache permanen. Draf hanya memori tab. Offline menampilkan kebutuhan koneksi dan menahan pengisian baru. Pembaruan menunggu antrean/isian aman dan persetujuan pengguna.

Workbook, template privat, .env*, .dev.vars, konfigurasi deployment nyata, akun, backup dan WORKLOG dikecualikan dari paket publik. Allowlist sumber diperiksa termasuk nilai rahasia lokal yang diketahui; ini bukan audit seluruh riwayat Git.

## Migrasi dan pemulihan

Migrasi SQL bernomor mempunyai registry SHA-256; file yang sudah diterapkan tidak boleh berubah. Tidak ada migrasi otomatis pada request pengguna. Tabel domain sembilan, ditambah registry schema_migrations.

Backup format 2 membaca tujuh tabel domain konsisten dan gambar siap dengan checksum. Sesi/percobaan login tidak diekspor. Restore hanya ke database/bucket terpisah, tujuan kosong dan versi migrasi sama. Seluruh nilai diperiksa kembali; reservasi belum siap menjadi deleting. Tidak ada transaksi tunggal PostgreSQL/S3 atau backup terjadwal. Lihat BACKUP.md. D1 lokal lama dipertahankan; tidak ada cutover data otomatis.

## Gerbang produksi

Cloudflare nyata masih harus membuktikan CPU hash/decode gambar, dua perangkat, instalasi PWA serta backup sebelum data keluarga digunakan. Local Worker + Neon nyata tidak sama dengan deployment produksi. Pemilik menyetujui rilis konkret setelah seluruh bahan siap.
