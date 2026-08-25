# M4 Doctor — Design Spec

**Date:** 2026-08-25
**Status:** Approved design, pre-implementation
**Parent spec:** `docs/superpowers/specs/2026-08-22-ai-accounting-saas-design.md` (§5 AI Layer, §3 Data Model, roadmap M4)

## 1. Tujuan

Mendeteksi masalah pembukuan secara deterministik lalu meninjaunya dengan LLM, menyajikan temuan berperingkat di inbox `/temuan` (dan preview di Dasbor), dan mengusulkan satu draft koreksi yang diposting lewat pipeline M1 yang sama (`validate → post → immutable`) — tidak pernah auto-post.

### Keputusan terkunci

| Keputusan | Pilihan |
|---|---|
| Aturan deterministik MVP | Semua 5: saldo abnormal, duplikat, bukti hilang, tanggal janggal, anomali rasio |
| Trigger pemindaian | Setiap jurnal diposting + nightly (hook `afterPost` + Vercel Cron 02:00) |
| Review LLM | Semua temuan flagged + sampling 5% jurnal acak, via `gemini-3.5-flash-lite` `store:false` |
| Siklus temuan | Manual: `open → resolved / dismissed` (jejak audit jelas) |
| Pendekatan | A — Pure core + repo tipis + LLM ringan, reuse pola M1–M3 |

## 2. Arsitektur

```
postJournalEntry ──(after COMMIT)──▶ enqueueDoctorScan(orgId, entryId)
        │                                    │
        ▼                                    ▼
   rag_queue (reuse)              ai_findings (open, severity HIGH/MEDIUM/LOW)
        │                                    ▲
        │ nightly Cron ──────────────────────┘
        │  (scan histori + sampling 5%)
        ▼
  LLM review doctor-llm.ts (gemini-3.5-flash-lite, store:false)
        │  bukti rule + hybridSearch (tenant_chunks + ifrs_chunks) + IFRS citation
        ▼
  ai_proposals (DraftEntry + ifrsCitation, pending) ──▶ "Buat draft koreksi" ──▶ ai_drafts (M2) ──▶ review diff ──▶ postJournalEntry
```

**Reuse:** `DraftEntry` zod M2, `resolveDraftAccounts`, `diffDraftVsEdited`, `hybridSearch` (0.7 cosine + 0.3 ts_rank), `liveNumbers` via `postedLinesThrough` + `aggregateFromLines`, `appendAudit`, `withOrg`/`app.current_org` RLS, `effectiveStatus` pattern, quota `ASSISTANT_MONTHLY_LIMIT`.

**Isolasi:** `src/core/doctor/rules.ts` murni tanpa DB; `src/server/db/repos/findings.repo.ts` tipis; `src/server/ai/doctor-llm.ts` terpisah.

## 3. Komponen

- **`src/core/doctor/rules.ts`** — 5 fungsi murni:
  - `abnormalBalances(aggs: AccountAggregate[]): FindingDraft[]` — saldo berlawanan normal tipe (ASET D, LIABILITAS/EKUITAS/PENDAPATAN K, BEBAN D); contra dibalik.
  - `duplicates(entries: JournalEntry[]): FindingDraft[]` — hash `memo+lines` dan `document_id` duplikat.
  - `missingReceipts(entries: JournalEntry[], threshold Minor): FindingDraft[]` — entri > Rp1.000.000 tanpa `documentId`/`extracted`.
  - `oddDates(entries, periods): FindingDraft[]` — tanggal di luar `fiscal_periods` OPEN atau weekend yang janggal vs histori.
  - `ratioAnomalies(currentAggs, historyAggs[]): FindingDraft[]` — banding 3 bulan, z-score >2 pada rasio kas/pendapatan, beban/pendapatan.

  Tipe: `FindingDraft { type, severity, evidence: { entryId?, accountCode?, expected, actual, tenantChunkId?, ifrsSection? } }`

- **`src/server/db/repos/findings.repo.ts`** — `createFinding`, `listFindings(orgId, status?)`, `getFinding`, `resolveFinding`, `dismissFinding`, `createProposal(findingId, draft)`, `listProposals`.

- **`src/server/ai/doctor-llm.ts`** — `reviewFinding(finding, sampleJournals): Promise<{ suggestion: string, ifrsCitation?: string, proposalDraft?: DraftEntry }>` — prompt Bahasa Indonesia, konteks bukti + `hybridSearch` + `suggestedDraft` via `DraftEntry` zod, `store:false`, retry 2, `AI_MOCK=1` deterministik.

- **Hooks:** `enqueueDoctorScan` dipanggil di `journals.repo.ts` setelah `COMMIT` dan di `Vercel Cron` (`src/app/api/cron/doctor/route.ts`).

## 4. Model Data

```sql
ai_findings(id uuid pk, org_id uuid→organizations, type text, severity HIGH/MEDIUM/LOW,
            status open/resolved/dismissed, evidence jsonb, created_at timestamptz)
ai_proposals(id uuid pk, org_id uuid→organizations, finding_id uuid→ai_findings, draft jsonb DraftEntry,
             ifrs_citation text, status pending/accepted/rejected, created_at)
```

- `evidence` contoh: `{ "entryId": "JE-...", "accountCode": "1110", "expected": "D", "actual": "K 5.000.000", "tenantChunkId": "...", "ifrsSection": "§17.2" }`
- RLS: tambah `ai_findings` & `ai_proposals` ke `ARRAY` di `rls.sql` (`ENABLE/FORCE RLS` + policy `org_id = current_setting('app.current_org')`), plus `withOrg` di semua repo. `VIEWER` tidak melihat tombol aksi (guard di UI + `requireContext(["OWNER","ACCOUNTANT"])` di actions).

## 5. UI & Alur

- **Inbox `/temuan`** (menggantikan badge "Segera" di sidebar): tabel temuan berperingkat — HIGH terracotta `bg-terra/10 border-terra`, MEDIUM amber, LOW `text-ink-soft`. Kolom `type`, `ringkasan`, `tanggal`, `severity`. Klik baris → drawer bukti: tautan ke `/jurnal` (highlight garis), kutipan `tenant_chunks` + badge `IFRS §` (klik → pratinjau chunk), dan tombol **Buat draft koreksi**.
- **Dasbor preview:** 3 temuan HIGH terbaru di atas callout lama; kosong → "Tidak ada temuan — pembukuan rapi" dengan ikon `BadgeCheck`.
- **Alur koreksi:** Temuan → `ai_proposals` (DraftEntry + `ifrsCitation`) → klik "Buat draft" → `ai_drafts` baru `source:DOCTOR` (+ audit `PROPOSAL_ACCEPT`) → redirect ke `/jurnal/ai/[id]` (review diff M2) → `postJournalEntry` (validate→post→immutable) + `appendAudit` `FINDING_RESOLVED`.
- **Gaya:** Paper & Ink Matte, `Stagger` untuk daftar, `Pressable` untuk kartu, `PageTransition` untuk drawer — konsisten M1–M3. `prefers-reduced-motion` dihormati.

## 6. Error, Kuota, Audit

| Kondisi | Perilaku |
|---|---|
| LLM timeout/down | Temuan tetap `open` tanpa saran ("Saran AI tidak tersedia — coba lagi"), nightly retry 3x via `rag_queue` reuse |
| Kuota `ASSISTANT_MONTHLY_LIMIT` habis | LLM review diskip, rule engine tetap jalan; manual entry & M2 tetap jalan |
| HOOK gagal | Enqueue best-effort `try/catch`, tidak blokir transaksi utama |
| `NEXT_REDIRECT` | Di-rethrow sebelum catch generik (reuse `redirect-guard.ts`) |
| Audit | `FINDING_CREATED/RESOLVED/DISMISSED`, `PROPOSAL_CREATED/ACCEPTED` dengan `actor` email atau `doctor` |

## 7. Testing

- **Unit (pure):** 5 rules — mis. ASET saldo kredit → HIGH, duplikat hash identik, missing receipt > threshold, tanggal di luar OPEN, rasio z-score >2.
- **Integrasi:** post jurnal duplikat → temuan muncul (hook), RLS isolasi (org lain tidak lihat), `propose → ai_drafts` terhubung + `reversal_of_id` tidak diperlukan (koreksi adalah jurnal baru, bukan reversal), `resolve/dismiss` mengubah status, `VIEWER` 403 pada aksi.
- **Eval:** 10 skenario temuan terkunci `AI_MOCK=1` (5 aturan + 5 LLM misclassifikasi) → saran & sitasi IFRS terukur.
- **E2E:** buat jurnal duplikat → muncul di `/temuan` → buat draft → posting → temuan hilang dari open (manual resolve).
- **Isolasi:** `ledger_test` via `tests/setup.ts` + `helpers.ts` guard, deterministik mock vectors.

## 8. Out of Scope (M4)

- Auto-post tanpa persetujuan (prinsip: tidak pernah silent)
- Billing/plan limits global
- Bank import / rekonsiliasi lanjutan
- Vector DB eksternal (tetap Postgres `vector` fallback text)

## 9. Constraints

- Bahasa UI Bahasa Indonesia; Paper & Ink Matte; `zod` validasi output model; `store:false` untuk data keuangan.
- TS strict, no `any`, `write` tool untuk file, Windows PowerShell (`bash` = WSL).
- Tests di `ledger_test` (guard), `drizzle-kit migrate` + `npm run db:sql` untuk kedua DB, commits konvensional.
