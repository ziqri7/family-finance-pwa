# Usulan ganti sandi dalam aplikasi

Status: rancangan disetujui pengguna; implementasi pada branch feature/change-password, terverifikasi dengan data dummy dan siap tinjauan rilis. Produksi dan sandi pengguna belum diubah. Fitur diminta pengguna setelah rilis Pages. Acuan UI Caku dan font Plus Jakarta Sans dipertahankan.

## Alur yang diusulkan

- Tombol Ganti sandi pada area akun, dekat Keluar. Buka dialog dengan Sandi saat ini, Sandi baru dan Ulangi sandi baru. Sandi hanya untuk akun yang sedang masuk; tidak ada pilihan akun pasangan.
- Sandi baru berupa passphrase minimal 15 dan maksimal 128 karakter, mendukung spasi/Unicode tanpa trim atau pemotongan diam-diam. Tolak sandi yang sama dengan sandi lama serta daftar sandi umum yang disimpan lokal. Tidak mengirim sandi ke layanan pemeriksa eksternal atau ke chat.
- Pengguna boleh memakai pengelola sandi/paste, dan melihat/menyembunyikan input. Keterangan dan kesalahan tampil dekat formulir; jangan mencatat isian atau menyimpannya dalam browser.
- Sebelum membuka dialog, isian anggaran harus selesai tersimpan; jangan sampai pergantian sesi menghilangkan draf. Jika form pengeluaran/kiriman masih terbuka, minta pengguna menyelesaikannya dahulu.
- Wajib verifikasi sandi lama di backend, dengan rate limit per akun. Konfirmasi sandi baru diperiksa UI dan backend. Origin sama, sesi valid, JSON berukuran terbatas, dan identitas hanya dari sesi.
- Setelah berhasil: cabut seluruh sesi akun tersebut, termasuk perangkat ini, lalu tampilkan halaman masuk dengan pesan Sandi berhasil diganti. Silakan masuk kembali. Sesi pasangan tidak dicabut. Pernyataan awal bahwa dua akun harus keluar hanya berlaku pada pergantian konfigurasi lama, bukan desain baru ini.
- Jika respons jaringan hilang, jangan menyatakan berhasil; jelaskan bahwa hasil belum terkonfirmasi dan pengguna mungkin perlu mencoba masuk memakai sandi baru. Jangan otomatis mengulang pergantian dengan payload/versi baru.

## Rancangan backend yang disetujui

Tambahkan tabel kredensial ber-ID partner-a/partner-b, hash berformat berversi, versi kredensial dan waktu ubah. Identitas/nama tampilan tetap konfigurasi privat. Migrasi memindahkan hash awal yang sudah ada, bukan mengganti sandi pengguna. Login tidak boleh kembali diam-diam memakai sandi bootstrap lama setelah pergantian berhasil.

Usulan hashing untuk sandi pilihan sendiri: pre-hash HMAC-SHA384 berpepper di Cloudflare, encoding base64 64 karakter, lalu bcrypt cost 12 melalui pgcrypto Neon. Kata sandi mentah dan pepper tidak dikirim ke database; hanya hasil HMAC terikat secret. Pepper acak khusus disimpan di secret Cloudflare, terpisah dari SESSION_SECRET dan database. Bcrypt adalah pilihan kompatibilitas saat Argon2/scrypt tidak sesuai batas runtime; kelayakan serta waktu verifikasi harus dibuktikan pada lingkungan uji sebelum menetapkan parameter akhir. Jangan memakai profil PBKDF2 100.000 untuk sandi pilihan bebas hanya karena sebelumnya cukup bagi sandi acak 192-bit.

Pergantian hash, kenaikan versi dan pencabutan sesi harus satu transaksi atomik. Login yang berjalan bersamaan harus memeriksa versi/fingerprint terbaru ketika menyimpan sesi agar hash lama tidak menghasilkan sesi aktif sesudah pergantian. Dua request perubahan bersamaan hanya boleh satu berhasil; tidak ada hasil parsial jika transaksi gagal. Pengguna tidak boleh mengubah sandi pasangan dengan mengganti ID pada body.

Recovery pemilik tetap melalui langkah administratif privat terpisah, tidak ada reset email/registrasi publik/fitur akun tambahan. Tidak menambah paket berbayar atau penyedia layanan baru.

## Backup, migrasi dan rilis

Backup/recovery harus diperbarui untuk hash kredensial dan versi, dengan penanganan terpisah dari tabel domain agar versi backup lama tidak mereset sandi ke bootstrap. Pepper disimpan terpisah pada pengelola rahasia pemilik; backup data saja tidak cukup memulihkan login. Pemulihan mencabut sesi dan tidak menimpa kredensial aktif secara diam-diam.

Migrasi additive dan inisialisasi dua akun diuji pada cabang dummy lebih dahulu; dilarang mengganti sandi produksi untuk mengetes fitur. Cadangkan produksi sebelum migrasi. Publikasi/deployment produksi mengikuti tinjauan hasil dan persetujuan rilis; pengguna kemudian mengganti sandinya sendiri di aplikasi.

## Pemeriksaan yang direncanakan

Sandi lama salah; sandi pendek/umum/konfirmasi berbeda; pasangan tidak dapat dimutasi; perubahan sukses dan login lama ditolak; login baru berhasil; sesi akun sendiri pada dua perangkat dicabut dan pasangan tetap aktif; login vs perubahan sandi bersamaan; dua perubahan bersamaan; rate limit; Origin asing; body berlebih; transaksi rollback; respons hilang; tidak ada sandi/hash di API, log, build, cache atau GitHub. Uji formulir desktop/mobile, keyboard, password manager dan draf anggaran. Uji backup/restore kredensial dan rahasia yang terpisah.

Riset utama: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [PostgreSQL pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html), [Neon pgcrypto](https://neon.com/docs/extensions/pgcrypto).

Cara kerja: pemeriksaan autentikasi dan pembuktian hasil menjadi fokus utama; penyesuaian UI mengikuti komponen yang ada tanpa redesign. Penelusuran masalah hanya bila ada kegagalan. Tanpa subagen. Rekomendasi tahap ini tetap GPT-6.1 Sol dengan penalaran High; model aktif tidak diklaim berubah.
