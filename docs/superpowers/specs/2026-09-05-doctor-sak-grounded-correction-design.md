# Spesifikasi: Doctor SAK-Grounded Correction Engine

Tanggal: 2026-09-05
Status: MENUNGGU REVIEW PENULIS → persetujuan user sebelum rencana implementasi
Modul: Temuan Doctor (diagnosa) + draf koreksi AI

## 1. Latar & tujuan

Pipeline usulan koreksi hari ini memakai template hardcode (`proposeCorrectionAction`):
nominal tetap yang tidak dihitung dari evidence, kode akun fiktif, tanpa pemetaan COA,
sitasi SAK generik. Hasilnya "asal": draf tak bisa dipercaya.

Desain ini menggantinya dengan pipeline hybrid (disetujui user 2026-09-05):
lapisan uang deterministik + narasi LLM yang disitasi ketat dari dokumen aturan milik user.

Keputusan yang dikunci:
- D1: kerangka koreksi setia bukti (akun + nominal dari evidence, nol angka template)
- D2: narasi SAK + sitasi terverifikasi ke dokumen user
- D3: akun COA yang belum ada diusulkan AI, dibuat atomik saat user setuju + posting
- D4: approval akun-baru di review, bukan otomatis, bukan manual-di-Pengaturan
- D5: grounding ketat dokumen (opsi A): sitasi di luar dokumen ditolak validator
- D6: arsitektur hybrid C (deterministik untuk uang, LLM untuk bahasa)

## 2. Arsitektur & aliran data

```
Temuan (evidence)
  → Resolver bukti: nominal aktual + entitas aktual (entryId/code)
  → Builder deterministik per tipe → kerangka koreksi (akun+nominal, D=K, fail-closed)
  → Resolver COA: akun ada → petakan; tak ada → proposal akun baru
  → Retriever SAK: chunk Bab relevan dari dokumen user (RAG tenant_chunks)
  → Narator LLM: penjelasan + sitasi (hanya dari chunk, JSON Schema)
  → Validator: D=K · nominal == evidence · akun ada/proposed · sitasi ∈ chunk
  → draf AI (review existing: Posting/Tolak)
  → setuju = buat akun baru (jika ada) + posting dalam satu transaksi
```

Gagal di validator mana pun → draf tidak dibuat; temuan dicap alasannya
("butuh otoritas manusia"). Review UI hampir tak berubah (badge "akun baru" +
sitasi terverifikasi sebagai tambahan).

## 3. Ingest dokumen SAK (menunggu upload user)

1. Upload → chunk ±800 token + overlap ke `tenant_chunks` via pipeline RAG existing,
   metadata Bab/paragraf.
2. Registrasi `sak_sources { docId, versi, tanggal_berlaku }`. Setiap sitasi proposal
   wajib menunjuk `(docId, Bab, paragraf)` terdaftar; sitasi liar ditolak.
3. Cakupan minimum yang disarankan: Bab 2 (pengakuan), Bab 7 (koreksi kesalahan —
   menentukan koreksi masuk laba-rugi vs saldo awal retrospektif), Bab 9/11/14,
   contoh ilustratif kas→akrual. Jika dokumen user lebih ramping, daftarkan Bab-nya;
   retriever hanya mengambil yang terdaftar.
4. Ganti dokumen = versi baru; draf lama tetap menunjuk versi saat dibuat.
5. Isi dokumen tidak disalin ke repo/spec — hanya chunk terindeks + rujukan Bab/paragraf.

## 4. Builder deterministik per tipe (lapisan uang)

| Temuan | Kerangka koreksi |
|---|---|
| Duplikat | Jurnal pembalik persis entri ganda (akun & nominal aktual), `reversal_of_id` tertaut (koreksi kesalahan) |
| Saldo abnormal | Reklasifikasi ke sisi normal, nominal = saldo abnormal aktual agregat akun |
| Bukti hilang | Reklas ke akun penampung dari COA org (bukan kode fiktif), nominal = amountMinor aktual |
| Tanggal luar periode | Usulan pindah tanggal ke periode OPEN terdekat / penyesuaian cut-off, nominal aktual |
| Anomali rasio | Tanpa jurnal otomatis: ringkasan + tautan entri pencilan |

Aturan keras bersama: D=K terverifikasi; selisih nominal vs evidence harus 0
(toleransi maksimal Rp1 untuk pembulatan); akun lawan default dari pemetaan COA org;
tiap builder beruji integrasi dengan angka nyata.

## 5. Narator LLM + validator sitasi

LLM hanya menulis (tak menyentuh angka):
1. Penjelasan 2–4 kalimat Indonesia awam-UKM: apa yang salah, mengapa jurnal benar
   menurut SAK, dampak ke laporan.
2. Sitasi format kaku `(Dok vX, Bab Y, par. Z)`, hanya dari chunk ter-retrieve
   (`response_format` JSON Schema, retry 2x mengikuti adapter existing).

Validator sitasi deterministik: tiap sitasi dicocokkan ke `sak_sources` + chunk;
gagal cocok → draf dibuang + temuan dicap manual. Keyakinan baris dihitung dari
keterpetakan akun. `AI_MOCK=1` untuk uji deterministik.

## 6. Alur akun baru

1. Resolver COA gagal → `usulan akun`: kode 4-digit mengikuti induk terdekat, nama,
   tipe, normal, induk + alasan SAK satu kalimat.
2. Review: baris bertanda chip "akun baru" + detail usulan; keyakinan disembunyikan.
3. Setuju + Posting = satu transaksi: buat akun → buat jurnal → tautkan.
   Gagal di langkah mana pun = batal semua (tanpa akun yatim).
4. Tolak = usulan hangus bersama draf; tak ada pembuatan diam-diam.
5. Guardrail server (bukan prompt): kode unik per org, induk header valid,
   tipe/normal konsisten dengan posisi D/K.

## 7. Error handling & testing

- Evidence tak lengkap / validator gagal / akun tak terpetakan & tak bisa diusulkan
  → cap temuan "butuh otoritas manusia", tanpa draf setengah jadi.
- Uji: tiap builder (D=K, nominal == evidence); mapping kode-tak-ada; atomicity
  akun-baru; eval sitasi 100% terverifikasi di sampel; deterministik via AI_MOCK.
- Batas: LLM tak menentukan nominal/akun; tanpa auto-posting (prinsip repo:
  AI mengusulkan, manusia memutuskan); draf pra-fitur tak dimigrasi (disembuhkan
  di read-time seperti pola existing).

## 8. Di luar cakupan

- Ubah alur review/Posting UI selain badge akun-baru + sitasi (sudah dimigrasikan
  ke PageActions sebelumnya).
- Jenis temuan baru di luar 5 rule existing.
- Auto-posting atau persetujuan otomatis dalam bentuk apa pun.
