# Laporan Perbaikan Akunio — Bahasa Non-Teknis

Tanggal: 13 September 2026. Branch: `fix/audit-remediation`.
Status mutu: **579 tes lolos semua, 0 gagal** (termasuk 9 tes yang sebelumnya selalu merah).

> Cara baca: tiap bagian memakai pola **Dulu** (penyakitnya) → **Sekarang** (obatnya) → **Artinya buat Anda** (dampak bisnis).
> Versi teknis lengkap: `docs/superpowers/specs/2026-09-13-audit-remediation-design.md`.

## Ringkasan satu paragraf

Audit menemukan sekitar 30 penyakit pembukuan — dari nomor dokumen yang bisa kembar, tombol yang bila diklik dua kali mencatat dua kali, potongan harga yang salah hitung, sampai laporan laba yang angkanya kebesaran. Semuanya sudah diobati dan dibuktikan dengan 579 tes otomatis yang semuanya hijau. Aplikasi belum live, jadi perbaikan dilakukan mumpung masih masa development.

## 1. Fondasi catatan (buku tidak bisa dicoret-coret lagi)

| Dulu | Sekarang | Artinya buat Anda |
|---|---|---|
| Nomor faktur/aset bisa kembar bila dua orang input barengan | Nomor antri rapi dengan pengaman, tak bisa kembar | Tak ada lagi faktur kembar yang membingungkan penagihan |
| Draf yang salah hitung tetap bisa disahkan | Draf dicek ulang penuh sebelum disahkan | Jurnal yang sudah disahkan (POSTED) pasti seimbang |
| Catatan yang sudah disahkan masih bisa "dipindahkan" lewat celah | Celah ditutup + dikunci database | Buku yang sudah tinta tidak bisa diubah diam-diam; koreksi hanya lewat jurnal lawan yang tercatat |
| Klik "Simpan" dua kali = tercatat dua kali; bayar faktur dua kali = status kacau | Klik berulang dikenali sebagai satu transaksi yang sama | Jari terpeleset tak lagi menggelembungkan omzet/kas |
| Pecahan sen bisa meleset 1 perak; layar persetujuan AI menampilkan total 100× lipat | Uang dihitung eksak sampai sen; layar persetujuan tampil benar | Total yang Anda setujui = total yang tercatat |

## 2. Kas, faktur, dan kasir (POS)

| Dulu | Sekarang | Artinya buat Anda |
|---|---|---|
| Bayar faktur Rp0 atau lebih dari tagihan bisa lolos | Ditolak dengan pesan jelas | Piutang tak bisa "lunas" secara ajaib |
| Pelunasan faktur tak muncul di daftar Kas | Setiap pelunasan otomatis tercatat di daftar Kas (nomor PMB-) | Uang masuk dari pelanggan terlihat di satu tempat |
| Asisten AI mencatat pembayaran tapi tak menjurnal | AI langsung menjurnal seperti input manual | Tak ada pembayaran "hilang" dari laporan |
| Struk kembar bernomor kosong; diskon bikin HPP salah baris; tutup shift barengan bisa bikin 2 draf selisih | Nomor struk benar; biaya per baris tepat; tutup shift dikunci | Setoran kasir cocok dengan sistem |
| Contoh kode akun di AI menunjuk akun yang sudah tak boleh dipakai | Contoh diganti + AI menolak akun grup sejak draf | Draf AI jarang gagal saat disahkan |

## 3. Stok dan aset tetap

| Dulu | Sekarang | Artinya buat Anda |
|---|---|---|
| Stok opname metode FIFO dinilai pakai rata-rata (HPP vs neraca selisih) | Dinilai per lapisan pembelian tertua, sesuai metode | Nilai sediaan di neraca = metode yang Anda pilih |
| Stok bisa diubah saat periode sudah ditutup, tanpa jejak | Wajib periode terbuka; tanpa selisih tak mengunci metode | Histori bulan tutup tak bisa diubah diam-diam |
| Harga modal basi (ada pembelian baru di tengah opname) tetap dipakai | Opname basi dibatalkan otomatis, harus hitung ulang | HPP tak pernah pakai harga kadaluarsa |
| Barang bersisa nilai receh bisa diarsipkan dan "menghilang" | Arsip wajib stok NOL dan nilai NOL | Tak ada nilai yang lenyap tanpa jurnal |
| Penyusutan bisa jalan dua kali; jurnalnya tercatat sebagai "AI"; jual aset tanpa terima uang tetap lolos | Sekali jalan terkunci; tercatat MANUAL jelas; jual wajib ada kas; AI ikut menjurnal | Beban penyusutan tepat; aset AI masuk laporan |

## 4. Laporan (laba rugi, neraca, arus kas, tutup tahun)

| Dulu | Sekarang | Artinya buat Anda |
|---|---|---|
| **Kritis:** retur penjualan, akumulasi penyusutan, dan prive malah MENAMBAH total (laba/aset/ekuitas kebesaran) | Tanda hitung diperbaiki dan dibuktikan tes | **Angka laba, aset, dan modal kini benar** |
| Rekonsiliasi bank menghitung draf yang belum sah | Hanya yang sudah disahkan | Selisih bank vs buku bisa dipercaya |
| Angka di halaman utama beda dengan halaman detail; drilldown double-hitung; kas dasbor termasuk tanggal masa depan | Satu sumber hitung yang dipakai halaman + tes; kas = posisi hari ini | Angka konsisten di semua layar |
| Arus kas selalu "pas" karena selisihnya disembunyikan di baris lain-lain | Kategori dilengkapi (utang, pajak, dibayar dimuka); sisa yang tak terpetakan jadi temuan Doctor | Arus kas jujur; yang aneh langsung ditandai |
| Tutup tahun: akun abnormal bocor, prive tak ikut tutup, bisa tutup tanpa akun laba ditahan (diam-diam gagal), buka-tutup merusak | Semua akun temporer nol termasuk prive; syarat dicek server; buka-tutup dikunci sampai jurnal penutup dibalik; tanpa akun laba ditahan = ditolak tegas | Tutup tahun tuntas dan aman diulang |

## 5. Keamanan data dan kerapian teknis

| Dulu | Sekarang | Artinya buat Anda |
|---|---|---|
| Semua peran database bisa mengintip data perusahaan lain (tak bisa dicabut) | Peran uji khusus tanpa hak intip + 6 tes isolasi ketat | Data tiap perusahaan tersekat; terbukti oleh tes |
| Upload dokumen gagal di lokal (kunci S3 ditolak) | Kunci diterima + bucket disiapkan | Lampiran nota/struk bisa diunggah dan teruji |
| Daftar perintah AI bisa selisih dengan programnya | Satu daftar tunggal (tak bisa drift) | Fitur AI tak tiba-tiba hilang |
| Reset database ikut menghapus user uji + data RAG | User `kerjaanlucky@gmail.com` dipertahankan; RAG diverifikasi/ditanam ulang otomatis + ada runbook | Reset dev aman; tinggal jalan + verifikasi |

## Yang sengaja TIDAK diubah (bukan kelalaian)

- Tahun buku non-Januari: ditolak dengan pesan jelas (mesinnya belum dibangun).
- Laba kotor PERIODIC di tengah tahun: diberi catatan jujur di layar (baru final setelah penyesuaian akhir tahun).
- Duplikat faktur/aset yang terlihat kasat mata (bisa di-void): ditunda karena tak merusak uang secara diam-diam.
- Merapikan 50 layar baca + hal kecil label/teks: ditunda karena tak memengaruhi angka.

## Bukti mutu

- 579/579 tes unit+integrasi hijau • 6/6 tes sekat data • 22/22 tes alur end-to-end • build + type-check bersih.
- Tiap perbaikan diawali tes yang GAGAL dulu (membuktikan penyakitnya nyata), baru diobati sampai hijau, lalu direview sub-agen independen sebelum merge.
