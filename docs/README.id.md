# YouTube Auto Skip + Adblock

**Pemblokir iklan Chrome dengan perlindungan khusus untuk YouTube.**

Ekstensi sumber terbuka berbasis Manifest V3. Menggabungkan filter iklan dan pop-up dengan pencegahan iklan pada respons pemutar YouTube, pelewatan otomatis, dan upaya pemulihan pemutaran awal yang dibatasi.

[Português (Brasil)](../README.md) · [English](README.en.md) · [한국어](README.ko.md)

## Pasang versi pratinjau

1. Unduh ZIP dari [halaman rilis](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.0-preview.1) lalu ekstrak folder `youtube-auto-skip`.
2. Buka `chrome://extensions` dan aktifkan **Mode developer**.
3. Pilih **Muat yang belum dikemas**, lalu pilih folder hasil ekstraksi yang berisi `manifest.json`.
4. Pastikan versi **3.0.0**, lalu muat ulang halaman yang sudah terbuka, termasuk YouTube.
5. Gunakan popup ekstensi untuk mengatur pemblokiran umum atau mengizinkan situs saat ini.

Memerlukan Chrome 111+ di komputer. Belum tersedia di Chrome Web Store. Paket ini belum memiliki dukungan tervalidasi untuk Firefox, Safari, iPhone, atau aplikasi YouTube. Untuk memperbarui, ganti berkas hasil ekstraksi, muat ulang ekstensi, lalu muat ulang halaman.

Pengaturan pemblokiran umum dan pengecualian situs bekerja terpisah dari perlindungan YouTube. Untuk menghentikan semua fitur, nonaktifkan ekstensi di `chrome://extensions`.

## Fitur dan batasan

- Filter jaringan dan penyembunyian elemen iklan berbasis EasyList dan YousList.
- Pemblokiran pop-up yang menuju server iklan yang dikenal.
- Penghapusan kolom iklan pada respons pemutar YouTube yang dikenali, dengan pelewatan otomatis dan klik tombol sebagai cadangan.
- Upaya terbatas untuk memulihkan buffer kosong saat awal pemutaran, dengan posisi awal video tetap dipertahankan.

**Ini versi pratinjau.** Hasil bergantung pada situs, format iklan, dan perubahan YouTube. Tidak menjamin semua iklan terblokir atau video langsung diputar. Mesin filter tidak mencakup semua kemampuan uBlock Origin atau AdGuard. Penyembunyian notifikasi gangguan saat ini hanya mengenali pesan YouTube dalam bahasa Korea.

Paket memuat 29.893 aturan jaringan dan 30.236 entri filter tampilan. Batas konversi dicatat di [`filters/provenance.json`](../filters/provenance.json). YousList merupakan tambahan untuk situs Korea; ABPindo dan EasyList Portuguese belum disertakan. Cakupan situs Indonesia belum diuji secara khusus.

## Izin dan data

Akses situs HTTP/HTTPS diperlukan untuk pemfilteran. `storage` menyimpan preferensi lokal, `scripting` menerapkan CSS, `declarativeNetRequest` memfilter permintaan, dan `webNavigation` menangani tab pop-up iklan. `debugger` digunakan sebagai cadangan untuk mengklik tombol lewati iklan YouTube dan dapat menampilkan pemberitahuan Chrome.

Kode rilis ini tidak mengirim telemetri kepada pengelola. Filter disertakan dalam paket dan diperbarui melalui rilis baru. Perintah pembangunan filter untuk pengembang mengunduh sumber filter.

## Pengembangan dan kontribusi

Gunakan Node.js 22+, jalankan `npm ci`, `npm test`, `npm run check:package`, dan `npm run build:release`. Filter sudah disertakan untuk pemasangan. Pengujian memeriksa skenario simulasi dan integritas paket, bukan keberhasilan pemblokiran iklan YouTube secara universal.

Baca [catatan teknis](TECHNICAL.md) dan [panduan kontribusi](../CONTRIBUTING.md). Kirim [laporan yang dapat direproduksi](https://github.com/stpcoder/youtube-auto-skip/issues/new/choose) dalam bahasa Indonesia, Portugis, Inggris, atau Korea.

Kode proyek: [GPL-3.0-only](../LICENSE). Filter mengikuti [lisensi dan atribusi masing-masing](../THIRD_PARTY_NOTICES.md). Proyek independen, tidak berafiliasi dengan YouTube atau Google.
