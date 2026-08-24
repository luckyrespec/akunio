# M3 Advisor RAG — Design Spec

**Date:** 2026-08-24
**Status:** Approved design, pre-implementation
**Parent spec:** `docs/superpowers/specs/2026-08-22-ai-accounting-saas-design.md` (§5 AI Layer, roadmap M3) + `docs/superpowers/specs/2026-08-23-m2-copilot-design.md`

## 1. Tujuan

Memberi setiap organisasi chat advisor yang menjawab dalam Bahasa Indonesia atas dua sumber sekaligus — angka perusahaan sendiri (jurnal, COA, ringkasan laporan) dan handbook IFRS untuk SME — dengan sitasi terpisah yang bisa diklik. Advisor hidup di dua tempat (halaman penuh `/asisten` dan widget floating di semua halaman `(app)`), menyimpan riwayat per thread, dan bila menemukan kesalahan dapat mengusulkan satu draft koreksi yang masuk ke flow review M2 (`ai_drafts`).

### Keputusan terkunci

| Keputusan | Pilihan |
|---|---|
| Sumber jawaban | Keduanya setara — sitasi IFRS dan data tenant terpisah |
| Tempat chat | Keduanya — halaman penuh `/asisten` + widget floating 380px di `(app)` |
| Tindakan koreksi | Boleh usulkan 1 draft koreksi (tombol → `ai_drafts` M2) |
| Kesegaran data tenant | Real-time (hook setelah jurnal/document baru) |
| Riwayat chat | Ya — disimpan per organisasi sebagai threads |
| Pendekatan RAG | A — Two-tier pgvector + hybrid vector+FTS, rerank, provider-agnostic adapter |

## 2. Arsitektur

```
IFRS Handbook ──(sekali saat deploy/migrasi)──▶ ifrs_chunks (global, tanpa org_id)
                                                │  embedding vector(768) + tsvector
                                                ▼
Jurnal/COA/Ringkasan Periode/Dokumen ─(real-time)─▶ tenant_chunks (per org_id)
       postJournalEntry / uploadDocumentAction ──▶ rag_queue ──▶ worker in-process (batch 20/2s)
                                                └─────────┬─────────┐
                                                          ▼         ▼
                                                   Hybrid search → Rerank (0.7 cosine + 0.3 ts_rank)
                                                          ▼
User ──▶ Chat API (/api/advisor/chat) ── embed pertanyaan ──────────▶ Gemini gemini-3.5-flash (store:false)
  ▲                      │                                              │
  │                      └──── citations + angka live (saldo Kas, laba YTD)
  │                            │
  └──── saran draft koreksi ──▶ ai_drafts (source ADVISOR) ──▶ /jurnal/ai/[id] (M2)
```

**Embedding:** `@google/genai` `embedContent` dengan model `gemini-embedding` / `text-embedding-004` family (768-dim), API key sama dengan generasi. `store:false` untuk generasi; embedding tidak disimpan di Google.

**Vector store:** Postgres + ekstensi `pgvector` (`CREATE EXTENSION vector`). `ifrs_chunks.embedding vector(768)`, `tenant_chunks.embedding vector(768)`, GIN pada `tsv`, HNSW pada embedding. Satu tabel `tenant_chunks` dengan filter `WHERE org_id = $1` — isolasi dijamin RLS (`tenant_isolation_tenant_chunks`).

**Chunking:** IFRS per seksi 400 token overlap 60 (metadata `section, chunk_index`); tenant: (a) 1 chunk per jurnal yang diposting (deskripsi "Jurnal JE-… tanggal …"), (b) 1 chunk ringkasan laporan per periode (snapshot Laba Rugi/Neraca seperti Dasbor), (c) 1 chunk per akun COA, (d) 1 chunk per dokumen terunggah (ekstrak). UMKM kecil < 2k chunk total.

**Ingestion:** hook di `postJournalEntry` dan `uploadDocumentAction` → insert `rag_queue(org_id, kind, ref_id)`. Worker polling tiap 2 detik, batch 20, generate embedding & upsert `tenant_chunks`. Gagal → `attempts` increment, retry 3x, lalu tandai `failed` tanpa blokir transaksi utama. Concurrent upsert di-serialkan per `org_id` via `pg_advisory_xact_lock(hashtext(org_id::text))`.

## 3. Model Data

| Tabel | Kolom kunci | Catatan |
|---|---|---|
| `ifrs_chunks` | `id, section, chunk_index, content, embedding vector(768), tsv tsvector` | Global, tanpa org_id, tanpa RLS per-org |
| `tenant_chunks` | `id, org_id, source_kind (JOURNAL/ACCOUNT/PERIOD_SUMMARY/DOCUMENT), ref_id, content, embedding vector(768), tsv tsvector, created_at` | RLS `org_id = current_setting('app.current_org')` |
| `chat_threads` | `id, org_id, title, created_at` | RLS per org |
| `chat_messages` | `id, thread_id → chat_threads, role (user/assistant), content, citations jsonb, created_at` | `citations: [{kind:"tenant"|"ifrs", ref, excerpt, score, section?}]` |
| `rag_queue` | `id, org_id, kind, ref_id, attempts, created_at` | Internal, tidak di-RLS-kan ketat (worker superuser) |

Batasan: `chat_threads.org_id` dan `chat_messages` diakses lewat join `thread.org_id` untuk RLS; implementasi via policy atau check di repo (pilih repo-check untuk kesederhanaan, konsisten dengan `ensureUserWorkspace`).

## 4. Alur Chat (Hybrid RAG)

1. Cek kuota chat: `COUNT(chat_messages WHERE role='user' AND created_at >= awal bulan AND org_id)` vs `ADVISOR_MONTHLY_MESSAGES_LIMIT` (default 200, env terpisah dari `AI_MONTHLY_DRAFT_LIMIT`). Habis → 429 dengan pesan + tanggal reset.
2. Embed pertanyaan via `@google/genai`.
3. Query kedua indeks bersamaan (top-5 tenant dengan `WHERE org_id`, top-5 global) — skor hybrid per chunk: `score = 0.7*(1 - cosine_distance) + 0.3*normalized_ts_rank`. Gabung 10, rerank, ambil top-6. Jika tenant < 2 hasil (tenant baru) → fallback: hanya `ifrs_chunks` + 3 angka live.
4. Prompt Gemini: sistem Bahasa Indonesia ("jawab singkat, sitasi wajib [IFRS §…] untuk aturan dan [Jurnal JE-…] untuk angka; jangan halusinasi angka"), konteks 6 chunk (excerpt 400 token each) + 3 angka live (saldo Kas, laba YTD dari `postedLinesThrough` seperti Dasbor) + 6 pesan terakhir thread.
5. Panggil `gemini-3.5-flash` dengan `store:false`. Jika output mengandung intent koreksi dan `overallConfidence > 0.75` (atau model menyertakan `suggestedDraft`), sertakan `suggestedDraft: DraftEntry` (reuse schema M2 zod) + tombol "Buat draft koreksi" di balon.
6. Simpan `chat_messages` user + assistant (dengan `citations` lengkap). Kembalikan ke UI.

**Usulan koreksi:** klik tombol → `POST /api/advisor/drafts` → buat `ai_drafts` baru `source: "ADVISOR"`, `input_text = "usulan dari chat <threadId>"`, `model = gemini-3.5-flash` → redirect ke `/jurnal/ai/[id]` (flow M2). Validasi akun tetap lewat `resolveDraftAccounts` + `postJournalEntry`.

## 5. UI

- **Halaman penuh `/asisten`:** layout dua kolom — kiri daftar threads (judul auto 5 kata pertama, urut `created_at DESC`, tombol "Percakapan baru"), tengah area chat (balon user kanan, assistant kiri), setiap balon assistant menampilkan chip sitasi (warna beda: terracotta untuk IFRS, biru-hijau untuk data perusahaan); klik chip → drawer pratinjau excerpt + tombol "Lihat sumber" (navigasi ke jurnal/laporan bila tenant). Input di bawah dengan `Cmd+Enter` kirim. Gaya tetap Paper & Ink Matte, marginalia.
- **Widget floating:** tombol bulat 48px pojok kanan bawah di semua halaman `(app)` (`src/components/assistant-widget.tsx`). Klik → sheet 380px di kanan (shadcn Sheet) dengan chat ringkas memakai `chat_threads` default "Cepat" (satu thread per org yang dipakai ulang). API chat sama (`/api/advisor/chat`), jadi kuota & riwayat terpusat. Sheet overlay tidak menutup konten Laporan di belakang (semi-transparan backdrop).
- **Empty & loading:** empty thread → undangan "Tanya kondisi kas, laba, atau aturan IFRS…"; loading → skeleton balon; error → banner Bahasa Indonesia.

## 6. Error Handling & Kuota

| Kondisi | Perilaku |
|---|---|
| Provider down / timeout 20s | Balasan assistant "Asisten sedang tidak tersedia — coba lagi sebentar" + tombol retry; riwayat tidak terputus |
| Kuota chat habis | Blokir kirim baru; pesan "Kuota tanya advisor bulan ini habis (200). Coba lagi 1 <bulan depan>."; M2 & manual entry tetap jalan |
| Indeks tenant belum siap (org baru) | Fallback ke `ifrs_chunks` + angka live; badge "data perusahaan belum terindeks — jawaban mungkin belum pakai angka terbarumu" |
| Embedding gagal (worker) | `rag_queue.attempts` increment; retry 3x; tandai `failed` dan log; chat tetap jalan dengan data yang sudah terindeks |
| Jawaban tanpa sitasi | Tampilkan tanpa chip; jangan paksa kutip palsu |

## 7. Testing

- **Unit:** chunking (400/overlap), hybrid scoring (0.7/0.3), `effectiveStatus` chat (tidak ada expiry — beda dengan ai_drafts), `checkQuota` advisor, `isRedirectError` di actions advisor.
- **Integrasi:** ingestion real-time (post jurnal → chunk muncul di `tenant_chunks` dengan org yang benar, bukan org lain); hybrid search mengembalikan tenant sebelum IFRS untuk query spesifik perusahaan ("saldo kas November"); chat menyimpan `citations` dan riwayat thread; tombol usulan koreksi membuat `ai_drafts` bertaut dan diposting lewat M1; tamper: tenant tidak bisa membaca chunk org lain (RLS).
- **Eval:** 10 tanya-jawab terkunci dengan `AI_MOCK=1` fixtures (5 tanya IFRS, 5 tanya angka perusahaan) → akurasi sitasi & angka terukur.
- **E2E:** buka `/asisten`, tanya "berapa saldo kas?", lihat sitasi + angka live, klik chip, buat percakapan baru, widget floating di `/laporan` → tanya cepat → jawaban muncul; offline fallback saat `AI_MOCK` dimatikan dan provider down.

## 8. Out of Scope (M3)

- Deteksi masalah otomatis & inbox (M4 Doctor)
- Bank import / rekonsiliasi
- Multi-dokumen → satu draft (v1 sudah satu dokumen = satu draft di M2)
- Billing / plan limits global
- Fine-tuning model atau vector DB eksternal (Qdrant/Pinecone)

## 9. Constraints

- Bahasa UI Bahasa Indonesia; Paper & Ink Matte; motion `prefers-reduced-motion` aware; tulis via `write` tool, bukan `bash` heredoc.
- `@google/genai` >= 2.3.0, model generasi `gemini-3.5-flash`, embedding `gemini-embedding`/`text-embedding-004`, `store:false` untuk data keuangan.
- Tests berjalan di `ledger_test` (guard di `tests/setup.ts`), bukan database dev.
- Windows PowerShell, `bash` adalah WSL — shell scripts harus via Git Bash eksplisit.
