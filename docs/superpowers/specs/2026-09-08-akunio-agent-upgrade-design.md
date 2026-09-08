# Spesifikasi Desain: Upgrade AI Agent Akunio — Perilaku, Unifikasi Sesi & Memory Lintas Sesi

**Tanggal:** 2026-09-08
**Status:** Draft menunggu review Human Partner
**Cakupan:** `src/components/assistant-widget.tsx`, `src/app/(app)/asisten/*`, `src/hooks/use-nara-*.ts`, `src/app/api/nara/*`, `src/server/ai/*`, `src/server/db/schema/*`, `src/app/(app)/pengaturan/*`
**Pendekatan disetujui:** B. Bertahap proper (Fase 1 bug fix → Fase 2 persona/tools → Fase 3 memory + kontrol)

---

## 1. Ringkasan & Tujuan

Tiga bug dilaporkan + permintaan upgrade agent:

1. Quick access selalu auto-kirim `☀️ Berikan ringkasan briefing keuangan hari ini.` saat dibuka — harus diam sampai user meminta.
2. Suggest langsung eksekusi — harus isi prompt box, user yang kirim.
3. History `/asisten` vs quick access tidak sinkron.
4. Memory lintas sesi belum ada (hanya `gemini_interaction_id` per-thread + 12 pesan terakhir).
5. Persona + pemakaian tools belum maksimal.

Tujuan: quick access diam total, suggest isi-prompt, satu store thread, persona Mentor UMKM page-aware, memory kombinasi (profil + fakta eksplisit + auto-ringkas) dengan kontrol user per item.

Non-tujuan: tidak mengubah struktur HITL (SAFE auto / MUTATING approval tetap), tidak menambah tool baru, tidak full semantic recall (ditunda ke pendekatan C bila perlu).

---

## 2. Fase 1A — Quick Access Diam + Suggest Isi Prompt

### 2.1 Root cause terverifikasi

- `src/components/assistant-widget.tsx:168-179`: jika `localStorage neraca:last_briefing_date != todayISO && messages.length===0` → langsung `handleSendMessage("☀️ Berikan ringkasan...")`. Boros kuota + mengejutkan.
- `assistant-widget.tsx:360-363` dan `asisten-client.tsx:399-402`: `onSelectSuggestion = setInput + handleSendMessage` (auto-eksekusi). Primitif `suggestion.tsx:51-93` dumb, keputusan di caller.
- Event mati: `akunio-briefing-card.tsx:16-20` dispatch `akunio:open-assistant` tapi tidak ada listener.

### 2.2 Desain

- Hapus blok auto-briefing. Empty-state widget = greeting statis + chips dari `GET /api/nara/suggestions` (fetch diam-diam, tidak kirim chat). Definisi "diam": nol `POST /api/nara/chat/stream` sampai user kirim; `GET threads/suggestions` tetap boleh.
- Kontrak suggest baru: semua `onClick` → `setInput(prompt)` + fokus `PromptInput`, tidak pernah `handleSendMessage`. Berlaku untuk empty-state chips, pills SSE `type:suggestions` di `nara-message-feed.tsx:165-175/317-327`, dan chips dasbor.
- Widget pasang `addEventListener("akunio:open-assistant")` → buka sheet + `setInput(detail.prompt)` saja.
- Pengecualian yang dipertahankan: chip `Ekstrak & Input Barang` tetap `setInput + buka file picker` (pola lama `assistant-widget.tsx:377-380`), bukan kirim.

### 2.3 File tersentuh

`assistant-widget.tsx`, `asisten/asisten-client.tsx:409-451`, `ai-elements/nara-message-feed.tsx`, `ai-elements/suggestion.tsx`, `dasbor/akunio-briefing-card.tsx`.

### 2.4 Kriteria terima

- Buka quick access 10x → zero `chat/stream` di network.
- Klik semua chips → input terisi, tidak ada SSE baru sampai kirim manual.
- Klik `Tanya lanjutan` di dasbor → widget terbuka + prompt terisi.

---

## 3. Fase 1B — Unifikasi History

### 3.1 Root cause terverifikasi

- Sumber sama (`chat_threads` via `listThreads` order `pinned, updatedAt desc`), transport beda: `/asisten/page.tsx:8-11` SSR `initialThreads`, widget `fetch /api/nara/threads` tiap `[open, activeThreadId]`.
- Bug kontrak: `src/app/api/nara/threads/route.ts:6-10` return array mentah, widget baca `data.threads` → selalu `[]`.
- State duplikat, widget `slice(0,8)`, tanpa pin/search/rename/delete/library/model selector.

### 3.2 Desain

- Satukan kontrak `GET /api/nara/threads` → `{ threads: ThreadItem[] }`. Widget tahan backward-compat (terima array mentah selama transisi), semua caller baru pakai objek.
- Hook baru `src/hooks/use-nara-threads.ts`: fetch sekali, seed dari SSR `initialThreads`, `onThreadCreated` prepend optimistik, invalidasi saat rename/delete/pin. Dipakai widget + `asisten-client` (ganti `useState(initialThreads)`).
- Widget tetap ringan: dropdown 8 terbaru + indikator pin + waktu + link `Lihat semua di /asisten`. CRUD penuh tetap hanya di `/asisten`.
- Sinkron `activeThreadId` via `localStorage neraca:last_thread_id` + query `?thread=` saat Maximize2 ke `/asisten`.

### 3.3 File tersentuh

`api/nara/threads/route.ts`, `hooks/use-nara-threads.ts` (baru), `assistant-widget.tsx:61-62/127-166`, `asisten-client.tsx:56-59`, `app-shell.tsx`.

### 3.4 Kriteria terima

- Buat/lanjut/hapus thread di `/asisten` → muncul/hilang di widget tanpa reload.
- `data.threads` kosong → tampil empty-state benar, bukan karena bug parsing.

---

## 4. Fase 2 — Persona Mentor UMKM + Tools Page-Aware

### 4.1 Sekarang

Persona generik di `chat/stream/route.ts:177-248` + `nara.ts:252-280` ("ramah solutif", anti-lupa 12 pesan, jangan karang angka). `pageContext` (`lib/assistant-context.ts`) dikirim tapi tidak mengubah gaya. Tools sudah benar (40 SAFE auto + 24 MUTATING via `NaraHitlApprovalCard`, `nara-tools.ts:13-65`), suggest belum page-aware.

### 4.2 Desain

- Satu suara Mentor UMKM: bahasa sederhana, jelaskan *kenapa*, kutip SAK EMKM via pola `SakRuleSheet` yang ada, akhiri 2-3 langkah lanjut sebagai chips (isi prompt, bukan auto-kirim). Identitas tetap "Akunio, bukan Nara". Pertahankan aturan format (list `- item`, hindari heading/bintang berlebihan) + anti-lupa.
- Page-aware sudut pandang (bukan persona ganda): `/dasbor` analis (`get_daily_briefing`/`get_financial_kpis`), `/jurnal` validator (`create_journal_draft`), `/kas-bank` (`record_cash_entry`/`get_cash_summary`), `/aturan` pengajar SAK. Suntik `org_profiles.business_type` + `pageContext.summary` + blok ingatan (Bag 5) ke `fullPrompt`.
- Struktur HITL tidak berubah. `suggestions.ts` + `briefing.ts:getDailyBriefingData` jadi sumber chips kontekstual.

### 4.3 File tersentuh

`api/nara/chat/stream/route.ts` systemInstruction, `server/ai/nara.ts`, `server/ai/suggestions.ts`, `lib/assistant-context.ts`.

### 4.4 Kriteria terima (AI_MOCK=1)

- Tiap halaman keluarkan sudut + chips yang tepat; mutasi tetap munculkan approval card; tidak ada klaim angka tanpa tool/RAG.

---

## 5. Fase 3 — Memory Lintas Sesi (Kombinasi + Kontrol)

### 5.1 Sekarang

Ingatan = `chat_threads.gemini_interaction_id` (`interaction-memory.ts`, `store:true + previous_interaction_id`, retry tanpa chaining saat stale) + 12 pesan terakhir. Ganti thread = lupa. Tidak ada tabel memory; terdekat `org_profiles` + `organizations.settings` generik.

### 5.2 Skema baru `assistant_memories`

```sql
-- drizzle/NNNN_assistant_memories.sql
CREATE TABLE IF NOT EXISTS assistant_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL, -- PROFILE | PREFERENCE | FACT | THREAD_SUMMARY
  content text NOT NULL,
  source text NOT NULL DEFAULT 'auto', -- user | auto
  source_thread_id uuid REFERENCES chat_threads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
--> statement-breakpoint
);
CREATE INDEX IF NOT EXISTS assistant_memories_org_idx ON assistant_memories(org_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assistant_memories_org_kind_idx ON assistant_memories(org_id, kind);
```

- Drizzle schema baru `src/server/db/schema/assistant-memory.ts`; migrasi hand-write + entri `meta/_journal.json` (tanpa snapshot, precedent `0012/0013`); blok DO idempotent `FORCE RLS` di `rls.sql`; repo `repos/assistant-memory.repo.ts` selalu via `withOrg`; tambah tabel ke TRUNCATE `tests/integration/helpers.ts`.
- Setting `organizations.settings.aiMemoryEnabled` (default true) sebagai kill-switch.

### 5.3 Penulis & pembaca

- Eksplisit: "ingat ya ..." → `ai/memory-extractor.ts` (JSON Schema, `store:false`, retry 2, pola `DraftEntrySchema`) simpan FACT/PREFERENCE/PROFILE, `source:user`. Validasi `content` 1–500 char di repo (trim, tolak kosong/lebih), bukan DB CHECK agar migrasi tetap sederhana.
- Otomatis: di `addMessage` saat jumlah pesan thread melewati 20 (cek `COUNT chat_messages WHERE thread_id`), upsert 1 baris THREAD_SUMMARY per `source_thread_id` via extractor (MVP sinkron fail-silent; worker antrean bila terbukti lambat). Bukan append terus.
- Pembaca: tiap chat ambil ≤20 (PROFILE → PREFERENCE/FACT terbaru → THREAD_SUMMARY relevan) → blok `Ingatan tersimpan:` di systemInstruction/fullPrompt, di bawah liveNumbers/RAG/pageContext. Jika toggle off → tanpa blok.

### 5.4 Kontrol user

Seksi `Ingatan Akunio` di `/pengaturan`: list per kind, edit/hapus per item, toggle master. Badge `menggunakan N ingatan` di chat (pola citations). RLS org-scoped, hapus permanen, tidak lintas org.

### 5.5 Kriteria terima

- Fakta disimpan di thread A → dipakai di thread B; dimatikan di pengaturan → tidak dipakai; dihapus → hilang permanen. RLS `app_user + withOrg` lolos; integrasi TRUNCATE tidak merusak suite lain.

---

## 6. Error Handling, Testing & Rollout

- Stale interaction → clear + retry tanpa chaining (pertahankan). Suggest/threads/briefing gagal → fallback (`FALLBACK_SUGGESTIONS`, seed SSR). Extractor gagal → log saja.
- Kuota satu pintu `checkAssistantQuota` (`ASSISTANT_MONTHLY_LIMIT=200`); Fase 1 menghemat kuota.
- Wajib hijau tiap fase: `bun x tsc --noEmit` (strict, no any) + `bun run build`.
- Vitest: `fileParallelism:false`, `tests/setup.ts` → `ledger_test`, `guardTestDb`; run per-file `bunx vitest run tests/integration/<file>`.
- Playwright `workers:1`, `reuseExistingServer:true`, warm `/asisten`, `networkidle` + hidrasi sebelum klik; jaga `data-testid` (`assistant-*` baru konsisten).
- Urutan rilis: Fase 1 (tanpa migrasi) → Fase 2 (mock-verified) → Fase 3 (migrasi + RLS + UI).
