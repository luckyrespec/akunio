# M2 Copilot — Design Spec

**Date:** 2026-08-23
**Status:** Approved design, pre-implementation
**Parent spec:** `docs/superpowers/specs/2026-08-22-ai-accounting-saas-design.md` (§5 AI Layer, roadmap M2)

## 1. Tujuan

Pengguna menulis deskripsi transaksi dalam Bahasa Indonesia (atau mengunggah foto/PDF faktur) dan AI menyusun **draft jurnal seimbang** yang harus direview manusia sebelum diposting. Draft tidak pernah memposting dirinya sendiri: satu-satunya jalan masuk buku besar tetap pipeline M1 (`validate → post → immutable`).

### Keputusan terkunci

| Keputusan | Pilihan |
|---|---|
| Provider default | Gemini via `@google/genai` (Interactions API), model `gemini-3.5-flash-lite` (configurable `GEMINI_MODEL`); adapter tetap provider-agnostic di level interface |
| Sitasi IFRS-SME | Tidak di M2 — menyusul di M3 bersama RAG |
| Penyimpanan dokumen | SeaweedFS S3-compatible (dev `D:\Lucky\weed_strorage`, produksi SeaweedFS S3 juga) |
| Review UX | Halaman review khusus + diff, draft tersimpan di DB, daftar draft |
| Guardrail biaya | Kuota request sederhana per org per bulan (env `AI_MONTHLY_DRAFT_LIMIT`, default 100) |
| Backlog hardening M1 | Dimasukkan sebagai tugas awal M2 |

## 2. Arsitektur & Alur

```
COMPOSER /jurnal/ai  (textarea + dropzone)
   | cek kuota org bulan ini --x--> pesan kuota habis (manual entry tetap jalan)
   v
src/server/ai/adapter.ts   (@google/genai Interactions API + zod)
   |  teks -> ekstraksi langsung; dokumen -> vision
   v
pemetaan akun terhadap COA tenant (fuzzy match string; vektor menyusul di M3)
   v
documents (file -> SeaweedFS) + ai_drafts (status PENDING)
   v
REVIEW /jurnal/ai/[id]  (editable + diff) --[Posting]--> postJournalEntry (M1)
```

Prinsip: draft AI hanya masuk buku lewat tombol *Posting* yang memanggil `postJournalEntry` yang sama dengan entri manual. Provider mati → composer menampilkan offline; entri manual tidak terpengaruh.

## 3. Model Data

### Tabel `documents`

| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid pk | |
| org_id | uuid NOT NULL → organizations | + RLS |
| storage_key | text | path objek di SeaweedFS |
| mime | text | whitelist `image/*`, `application/pdf` |
| size_bytes | integer | maks 5 MB |
| extracted | jsonb | hasil ekstraksi vision (merchant, tanggal, item, PPN) |
| status | enum `UPLOADED/EXTRACTED/FAILED` | |
| created_at | timestamptz | |

### Tabel `ai_drafts`

| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid pk | |
| org_id | uuid NOT NULL → organizations | + RLS |
| kind | enum `TEXT/DOCUMENT` | |
| document_id | uuid → documents, nullable | |
| input_text | text | teks user / ringkasan sumber |
| draft | jsonb | DraftEntry (baris + confidence + penjelasan) |
| model | text | mis. `google/gemini-3.5-flash-lite` |
| status | enum `PENDING/ACCEPTED/REJECTED` | PENDING > 7 hari → dibaca sebagai REJECTED (lazy) |
| posted_entry_id | uuid → journal_entries, nullable | terisi saat ACCEPTED diposting |
| created_at | timestamptz | dipakai juga untuk kuota bulanan |

### SeaweedFS

- Skrip dev `scripts/weed-dev.cmd`: menjalankan `weed server` (volume + filer + S3 gateway :8333), membuat bucket `neraca-docs` bila belum ada.
- Env: `S3_ENDPOINT`, `S3_BUCKET=neraca-docs`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- Akses via `@aws-sdk/client-s3` (PutObject/GetObject/DeleteObject) — API identik untuk produksi.
- Validasi upload: maks 5 MB, hanya `image/*` dan `application/pdf`.

### Kuota

Tanpa tabel baru: `COUNT(ai_drafts WHERE org_id AND created_at >= awal bulan)` dibanding `AI_MONTHLY_DRAFT_LIMIT` (default 100). Generate ditolak dengan pesan Bahasa Indonesia + tanggal reset bulan depan.

## 4. Lapisan AI

### Adapter (`src/server/ai/adapter.ts`)

- Dibangun di atas **`@google/genai` (>= 2.3.0, Interactions API)** sesuai skill gemini-api-dev / gemini-interactions-api. `AI_PROVIDER` disiapkan untuk masa depan (google dulu); interface adapter `generateJournalDraft(input): Promise<DraftEntry>` tetap satu pintu sehingga provider lain cukup implementasi baru.
- Model: `gemini-3.5-flash-lite` (multimodal, 1M token) via env `GEMINI_MODEL`; **dilarang memakai model legacy `gemini-2.5-*`/`2.0-*`/`1.5-*`**.
- Structured output memakai responseSchema Interactions API; hasil divalidasi ulang dengan zod — gagal validasi → retry maks 2 kali.
- `store=false` pada setiap interaction (data keuangan tidak disimpan di server Google; kita tidak butuh `previous_interaction_id` untuk one-shot drafting).
- Sebelum menulis kode adapter, WAJIB fetch halaman docs: Structured Output, Document Processing, dan Image Understanding (`.md.txt` dari indeks `ai.google.dev/gemini-api/docs/llms.txt`).
- `AI_MOCK=1` → fixture deterministik tanpa panggilan jaringan (unit test, eval, e2e).

### Schema zod `DraftEntry`

```ts
{
  dateISO: string,          // YYYY-MM-DD
  memo: string,
  lines: Array<{
    accountCode: string,    // harus ada di COA tenant
    debitText: string, creditText: string,  // format "5.000.000"
    confidence: number,     // 0..1 per baris
    reason: string,         // alasan singkat Bahasa Indonesia
  }>,
  overallConfidence: number,
  explanation: string,      // penjelasan draft Bahasa Indonesia
}
```

### Prompt

Bahasa Indonesia; berisi: tanggal hari ini, **daftar akun tenant** (kode, nama, normal), aturan satu-sisi per baris & seimbang, satu contoh one-shot. Untuk dokumen: file dikirim sebagai attachment multimodal; model diminta mengekstrak merchant, tanggal, item, dan PPN sebelum menyusun jurnal.

### Pemetaan & validasi akun

Server memvalidasi ulang setiap `accountCode` terhadap COA tenant. Kode tak dikenal → fuzzy match (normalisasi string + skor kemiripan) ke akun terdekat; tetap gagal → baris ditandai confidence rendah "pilih akun manual" di halaman review (posting ditolak oleh `checkPostingAccounts` M1 bila akun tetap invalid).

### Guardrails

Kuota bulanan; timeout generate 30 detik; API key hanya server-side; semua pesan gagal dalam Bahasa Indonesia.

## 5. UI (Paper & Ink; AI tampil sebagai marginalia)

- **`/jurnal/ai` — Composer:** textarea besar, dropzone dokumen, tombol *Buat Draft*. Kartu marginalia status: siap / offline / kuota habis. Hanya `OWNER` dan `ACCOUNTANT` yang dapat membuat/mereview/memposting draft — `VIEWER` tidak melihat composer (konsisten dengan aturan posting manual M1).
- **`/jurnal/ai/[id]` — Review (dua kolom):** kiri *"Apa yang dibaca asisten"* (input mentah / pratinjau dokumen + field terekstrak); kanan draft **editable** (ganti akun, ubah nominal, hapus/tambah baris; baris confidence < 0.7 ditandai garis terracotta "periksa"). Footer: total D/K live, **[Tolak]**, **[Posting]**.
- **Diff:** ringkasan *"Perubahanmu vs draft AI"* (diubah/ditambah/dihapus) di atas tombol Posting.
- **Daftar draft:** tab di `/jurnal` — PENDING (bisa dibuka ulang), ACCEPTED (tertaut nomor JE), REJECTED.

## 6. Hardening (tugas awal M2, dari final review M1)

1. Index `journal_lines.entry_id`.
2. Partial unique index pada `reversal_of_id` (anti balikan ganda per entri asal).
3. Tanggal default form memakai waktu lokal Asia/Jakarta, bukan UTC.
4. Rethrow `NEXT_REDIRECT` di `fail()` server actions agar redirect tidak berubah jadi pesan error.
5. CHECK constraint DB: `journal_entries.status`, `journal_entries.source`, `fiscal_periods.status`, `memberships.role`.

## 7. Error Handling

| Kondisi | Perilaku |
|---|---|
| Provider down / timeout 30s | Composer: "Asisten sedang tidak tersedia" + tombol coba lagi |
| Kuota habis | Composer nonaktif + tanggal reset; manual entry normal |
| Dokumen tak terbaca | `documents.status=FAILED` + pesan; user bisa coba ulang |
| Output tak valid setelah repair | Draft gagal dibuat; pesan generik + log server |
| Draft PENDING > 7 hari | Dibaca REJECTED (lazy, tanpa job) |

## 8. Testing

- **Unit:** schema zod DraftEntry, fuzzy-match akun, perhitungan diff draft-vs-final, logika kuota.
- **Integrasi:** siklus draft PENDING→ACCEPTED→tertaut JE; REJECTED; kuota menolak generate; posting draft lewat pipeline M1; upload dokumen ke SeaweedFS (dijalankan terhadap instance lokal; bila tak tersedia, test skip terkendali seperti pola `SKIP_DB_TESTS`).
- **Eval:** 10 fixture kuitansi/frasa Indonesia dengan `AI_MOCK=1` jawaban terkunci → akurasi ekstraksi terukur.
- **E2E:** alur composer→review→posting dengan `AI_MOCK=1`.

## 9. Out of Scope (M2)

- Sitasi IFRS-SME dan seluruh RAG (M3)
- Bank import / rekonsiliasi
- Multi-dokumen → satu jurnal (v1: satu dokumen = satu draft)
- Deteksi masalah otomatis (M4)
- Billing/plan limits

