# final-projeck-front-end

# Smart Zoo Management and Animal Information System

## 📊 Slide Presentasi Kelompok 6 (Canva)
- **Nama Presentasi:** **SMART ZOO PRESENTASI KELOMPOK 6**
- **Link Canva:** [https://canva.link/dc7x6v2djo3gc6l](https://canva.link/dc7x6v2djo3gc6l)
- **File Referensi:** [SMART ZOO PRESENTASI KELOMPOK 6.md](SMART%20ZOO%20PRESENTASI%20KELOMPOK%206.md)

---

Aplikasi web responsif untuk membantu simulasi pengelolaan kebun binatang: inventaris satwa dan kandang, layanan pengunjung, tiket QR, kesehatan, pakan, konservasi, serta operasional petugas.

## Teknologi

- React 19 + TypeScript
- Vite
- CSS responsif
- Cloud Firestore untuk sinkronisasi antarperangkat, dengan `localStorage` sebagai cache/offline fallback
- Browser `BarcodeDetector` untuk pemindaian QR (jika didukung browser/perangkat)

## Menjalankan aplikasi

1. Buka folder `rendy front-and` di VS Code.
2. Pasang dependency proyek dengan `npm install`.
3. Jalankan server pengembangan dengan `npm run dev`.
4. Buka URL lokal yang ditampilkan Vite.

Untuk mengecek TypeScript dan membuat build produksi gunakan `npm run build`. Untuk pemeriksaan gaya kode gunakan `npm run lint`.

## Modul aplikasi

| Modul | Kegunaan |
| --- | --- |
| Ringkasan | Jumlah satwa, jenis/spesies, pengunjung hari ini, kandang aktif, agenda perawatan. |
| Data Satwa | Tambah, ubah, cari, filter, hapus, ekspor CSV; foto dapat ditambahkan melalui URL. |
| Data Kandang | Habitat, kapasitas terisi, dan keterangan lokasi kandang. |
| Pengunjung | Catat nama/rombongan, kontak, tanggal, kategori, dan jumlah orang. |
| Tiket & QR | Atur harga dewasa/anak, terbitkan tiket, tampilkan/cetak QR, pindai tiket dan tandai sudah digunakan. |
| Informasi Petugas | Catat nama, jabatan, kontak, dan shift. |
| Rekam Medis | Catat diagnosis, vaksinasi, dokter, serta jadwal pemeriksaan berikutnya. |
| Jadwal Pakan | Atur makanan, porsi, jam, dan frekuensi pakan tiap satwa. |
| Konservasi | Catat status konservasi, kelahiran, jumlah anak, dan catatan pemantauan. |
| Peta Lokasi | Peta skematis habitat dan fasilitas umum. |
| Absensi Petugas | Catat jam masuk dan kehadiran harian. |
| Kritik & Saran | Simpan rating dan masukan pengunjung. |
| Laporan | Ringkasan kesehatan, komposisi spesies, data operasional, dan ekspor CSV data satwa. |

## Alur demo presentasi

1. Mulai dari **Ringkasan** untuk menjelaskan informasi yang dipantau.
2. Buka **Data Satwa**, tambahkan satu satwa, isi foto dengan URL gambar yang dapat diakses, lalu tunjukkan pencarian dan filter.
3. Buka **Data Kandang** dan **Peta Lokasi** untuk menjelaskan habitat, kapasitas, serta fasilitas.
4. Buat satu rekam medis dan jadwal pakan untuk menunjukkan pencatatan kesejahteraan satwa.
5. Tambahkan pengunjung, lalu terbitkan tiket. Tampilkan QR tiket dan demonstrasikan pemindaian dari perangkat dengan kamera yang mendukung `BarcodeDetector`.
6. Catat absensi petugas dan masukkan kritik/saran.
7. Akhiri pada **Laporan** dan tunjukkan ekspor CSV.

## Google Gemini

Chatbot Gemini memakai API server lokal agar API key tidak pernah dikirim ke browser.

1. Buat API key di [Google AI Studio](https://aistudio.google.com/apikey). ID proyek Google Cloud seperti `gen-lang-client-0874860617` bukan API key dan tidak dapat dipakai untuk autentikasi ini.
2. Isi `GEMINI_API_KEY` di `.env.local` dengan API key tersebut. Jangan menaruh key di kode frontend, variabel `VITE_*`, atau membagikannya ke publik.
3. Jalankan ulang aplikasi dengan `npm run dev`, lalu pilih **Google Gemini** pada konfigurasi chatbot. Untuk deployment, atur `GEMINI_API_KEY` sebagai environment variable rahasia di hosting dan pastikan server API aplikasi juga dijalankan.

## Firebase / Cloud Firestore

Aplikasi menyinkronkan data satwa, kandang, perawatan, pengunjung, tiket, petugas, rekam medis, jadwal pakan, konservasi, dan absensi ke Cloud Firestore proyek `smart-zoo-118da`. Data yang sudah tersimpan di `localStorage` akan diunggah saat koleksi cloud terkait masih kosong.

Untuk menghubungkan aplikasi Web ke Firebase:

1. Di Firebase Console proyek **Smart Zoo**, pilih **Add app** lalu ikon **Web** (`</>`), daftarkan aplikasi, dan buka konfigurasi SDK-nya.
2. Salin nilai `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, dan `appId` dari konfigurasi aplikasi Web ke variabel bernama sama di `.env.local` (dengan awalan `VITE_FIREBASE_`). Jangan gunakan atau menaruh service-account JSON di aplikasi frontend.
3. Pastikan Cloud Firestore sudah dibuat pada proyek tersebut, lalu jalankan ulang server Vite agar `.env.local` dibaca kembali.
4. Atur Firestore Security Rules dengan autentikasi dan izin yang sesuai sebelum memakai data sungguhan. Aplikasi ini belum memiliki autentikasi pengguna; jangan membuka akses publik atau menyimpan data pribadi pengunjung sungguhan.

## Catatan demo dan pengembangan produksi

- Data satwa lama tetap tersimpan pada kunci browser sebelumnya. Modul baru menyimpan data pada `localStorage`, sehingga data tetap ada setelah halaman dimuat ulang di browser/perangkat yang sama.
- Versi ini adalah prototipe presentasi dan **belum** memiliki login atau otorisasi pengguna. Data cloud dapat tersinkronisasi antarperangkat, tetapi jangan gunakan data pribadi pengunjung sungguhan sebelum autentikasi dan aturan keamanan diterapkan.
- Gambar satwa memakai URL; QR gambar dibuat oleh layanan QR eksternal sehingga penerbitan gambar QR memerlukan internet. Untuk penggunaan produksi, buat QR di aplikasi/server sendiri dan jangan menaruh data pribadi ke dalam QR.
- Pemindaian QR menggunakan kemampuan kamera browser. Gunakan `localhost` atau HTTPS dan izinkan akses kamera. Jika browser tidak mendukung API tersebut, tombol status dapat dipakai untuk simulasi pemeriksaan manual.
- Peta yang tersedia berupa ilustrasi skematis, bukan peta geografis terukur. Koordinat dan fasilitas perlu diganti sesuai denah kebun binatang sebenarnya.

## Pembagian presentasi kelompok

- **Anggota 1 — Analisis & dashboard:** tujuan sistem, masalah yang diselesaikan, statistik, dan kebutuhan pengguna.
- **Anggota 2 — Data satwa & kandang:** inventaris, foto, pencarian, habitat, dan peta.
- **Anggota 3 — Kesehatan & konservasi:** rekam medis, pakan, vaksinasi, dan perkembangbiakan.
- **Anggota 4 — Layanan & operasional:** pengunjung, tiket QR, petugas, absensi, kritik/saran, serta laporan.

## Struktur utama

- `src/App.tsx`: navigasi aplikasi, dashboard, inventaris, kandang, perawatan, dan laporan kesehatan.
- `src/ZooModules.tsx`: modul operasional pengunjung, tiket, petugas, kesehatan, pakan, konservasi, peta, absensi, kritik/saran, dan ringkasan operasional.
- `src/ZooModules.css`: tata letak dan gaya modul tambahan.
- `src/App.css`: dashboard dan modul awal kebun binatang.

## Cara membaca alur kode

1. `src/main.tsx` memasang komponen utama `App` ke elemen `#root` pada halaman HTML.
2. `src/App.tsx` menyimpan data utama satwa, kandang, dan jadwal perawatan di React state. `useEffect` menyinkronkan perubahan itu ke `localStorage`.
3. Setiap menu mengubah nilai `view`. Kondisi seperti `view === 'animals'` menentukan bagian halaman yang ditampilkan.
4. Formulir menggunakan `onSubmit`: cegah reload halaman, baca nilai dengan `FormData`, validasi, lalu ubah state. Jika sedang mengedit, data dicari berdasarkan `id`; kalau tidak, record baru dibuat.
5. `src/ZooModules.tsx` menerapkan pola yang sama untuk modul operasional. Helper `FormPanel`, `ModuleTable`, dan `RowActions` digunakan bersama agar formulir/tabel konsisten.
6. Helper `read` membaca data lokal dengan data contoh sebagai nilai awal. Helper `save` menyimpan JSON dan mengirim event agar angka di dashboard ikut diperbarui.
7. Tombol hapus meminta konfirmasi sebelum membuang record. Data tersimpan kembali melalui `useEffect` setelah state berubah.
8. Ekspor laporan mengubah baris data menjadi CSV. Tombol cetak membuka dialog browser yang bisa dipakai untuk mencetak atau menyimpan PDF.

Komentar berbahasa Indonesia di dekat bagian-bagian utama kode menjelaskan tanggung jawab tipe data, state, penyimpanan, handler formulir, dan tampilan per modul.
