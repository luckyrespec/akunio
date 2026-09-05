# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pemilik UKM dan akuntan / staf keuangan, setara. Situasi: hijrah dari spreadsheet, nota dan kuitansi menumpuk sebelum dicatat, butuh kepatuhan IFRS for SMEs / SAK EMKM tanpa admin manual. Pekerjaan: catat transaksi lewat jurnal manual, chat AI, atau foto struk / PDF faktur; review draf; posting; pantau buku besar dan laporan real-time.

## Product Purpose

SaaS akuntansi double-entry untuk UKM: foto nota langsung jadi jurnal seimbang, buku besar dikunci anti-utak-atik, laporan standar tersedia real-time. Sukses berarti jurnal selalu seimbang (Debit = Kredit), pelaporan tidak terlambat karena antrean nota, dan jejak audit kredibel karena data posted tidak bisa diubah sepihak.

## Positioning

Akunio AI capture: nota fisik / PDF faktur dan prompt teks diubah menjadi draf jurnal seimbang dengan ekstraksi vendor, tanggal, pajak, subtotal, dan pencocokan bagan akun sebelum posting. Ledger imutabel dan laporan standar adalah pendukung kepercayaan, bukan klaim pembeda utama.

## Operating Context

Alur: input transaksi (nota / PDF, teks / kasir, jurnal manual) → validasi keseimbangan → draf jurnal → kebijakan izin (review manual / auto-approve) → posting `POSTED` → trigger kunci imutabilitas + hash chaining audit trail → buku besar → neraca, laba rugi, perubahan ekuitas, arus kas metode tidak langsung. Bagan akun template SAK EMKM / IFRS terisolasi per `org_id`. Penomoran `JE-YYYY-NNNN` per tahun fiskal dengan counter transaksional. Penutupan 12 periode per tahun kalender. Asisten RAG memakai regulasi + konteks tenant. Bahasa operasi Indonesia.

## Capabilities and Constraints

Fungsionalitas terkonfirmasi: dasbor, jurnal manual, `jurnal/ai` chat dan review diff per id, buku-besar, `laporan/*`, faktur, kontak, aset, persediaan, aturan, rekonsiliasi, tutup-buku, temuan (doctor), pengaturan (arsip COA, periode), asisten, onboarding beserta daftar / masuk / verifikasi, `api/nara` dan `api/advisor`.

Batasan keras: total Debit harus sama dengan total Kredit sebelum posting; jurnal `POSTED` terkunci permanen dan koreksi hanya via jurnal pembalik tertaut `reversal_of_id`; unggahan maksimal 5MB (gambar, PDF, csv/txt/xls/xlsx); uang `numeric(18,2)` dihitung sebagai minor BigInt; isolasi tenant via `org_id` dan RLS; AI `store:true` + `previous_interaction_id` per `chat_threads.gemini_interaction_id` (memory server-side anti-lupa, retensi Google 55 hari berbayar / 1 hari gratis) dengan retry 2.

## Brand Commitments

Nama mengikat: Akunio. Resolusi konflik: jawaban init ini menggantikan penyebutan Neraca di `AGENTS.md` untuk kebenaran produk; perbarui `AGENTS.md` / README bila perlu agar tunggal. Voice mengikat: Bahasa Indonesia.

## Evidence on Hand

Ada: salinan dan alur di `README.md`, kontrak kerja dan rute di `AGENTS.md`, implementasi berjalan Next 16.3 App Router. Tidak ada: testimoni, pelanggan bernama, benchmark, harga, klaim lisensi / deployment — jangan difabrikasi oleh pekerjaan berikutnya.

## Product Principles

1. Seimbang dulu, posting kemudian.
2. Posted berarti final; koreksi selalu eksplisit dan tertaut.
3. AI mengusulkan, manusia memutuskan.
4. Standar akuntansi tanpa beban admin bagi UKM.
5. Setiap angka penting bisa ditelusur ke bukti dan jurnalnya.
