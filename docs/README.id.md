# AdBlock + YouTube

[Português (Brasil)](../README.md) · [English](README.en.md) · [한국어](README.ko.md)

Ekstensi Chrome MV3 untuk memblokir iklan situs web dan memproses serta melewati iklan YouTube yang didukung. **Chrome 3.0.4 · Chrome desktop 111+ · rilis pratinjau.**

## Instalasi

1. Unduh `youtube-auto-skip-chrome-3.0.4.zip` dari [halaman rilis](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.4-preview.1), lalu ekstrak.
2. Buka `chrome://extensions` dan aktifkan **Mode developer**.
3. Pilih **Muat yang belum dipaketkan / Load unpacked**, lalu pilih folder `youtube-auto-skip` yang berisi `manifest.json`.
4. Buka tombol ekstensi untuk memeriksa versi dan pengaturan.

Tidak perlu memasang Node.js atau menjalankan build. Gunakan juga Code → Download ZIP atau clone repositori, lalu muat folder utamanya. Simpan folder instalasi. Saat memperbarui, ganti berkas dalam folder yang sama, muat ulang ekstensi, lalu halaman yang terbuka. [Pilihan instalasi (English)](INSTALL.md)

## Fitur

- Aturan jaringan dan visual dari snapshot EasyList/YousList serta perlindungan popup iklan yang dikenal.
- Jeda per situs, pengecualian domain induk dan aturan kompatibilitas untuk menjaga konten biasa.
- Pemrosesan respons YouTube, upaya melewati iklan dan bantuan tombol lewati; berjalan terpisah dari pemblokiran umum.
- Pemulihan buffer kosong awal yang terbatas dan penyembunyian pesan gangguan tertentu dalam bahasa Korea. Kesalahan lainnya tetap terlihat.
- Status filter halaman dan tombol muat ulang. Pengaturan Chrome tersedia dalam bahasa Portugis, Inggris, Indonesia dan Korea.

Memuat 29.894 aturan jaringan, 30.236 aturan visual dan 169 aturan kebijakan filter visual. Batas Chrome dan sintaks yang belum didukung mengurangi cakupan. Filter regional Indonesia/Brasil belum disertakan dan daftar tidak diperbarui otomatis. Tidak semua iklan atau waktu tunggu YouTube dapat dihilangkan.

## Safari dan privasi

Kode sumber Safari 1.1.1 adalah port pengembangan dengan filter iklan umum bersama Chrome, PiP dan alat pemutaran latar belakang bersyarat yang mempertahankan video asli. ZIP publik sebelumnya 1.0.0 belum memuat perubahan ini. Instalasi iPhone memerlukan Mac, Xcode dan penandatanganan sendiri. PiP dan pemutaran saat layar terkunci pada perangkat nyata belum diverifikasi. [Panduan Safari (English)](SAFARI.en.md)

Akses HTTP/HTTPS dipakai untuk pemblokiran umum. Izin `debugger` mendukung input tombol lewati YouTube dan dapat memunculkan pemberitahuan kontrol browser. Pengaturan disimpan lokal; kode tidak mengirim riwayat penjelajahan ke endpoint analitik eksternal.

## Pengembangan

```sh
npm ci
npm run verify
npm run build:release
npm run preview
```

Gunakan Node.js 22+. Bangun ulang bundle umum setelah mengubah sumbernya. Paket ZIP dibuat tanpa utilitas ZIP sistem atau Xcode. [Validasi](VALIDATION.md) · [Teknis](TECHNICAL.md) · [Kontribusi](../CONTRIBUTING.md) · [Atribusi](../THIRD_PARTY_NOTICES.md)

Kode proyek: GPL-3.0-only. Filter mempertahankan lisensi dan atribusinya masing-masing.
