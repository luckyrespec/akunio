# ADK Multi-Agent Accounting — Design Spec (B murni + hybrid)

Tanggal: 2026-09-21 · Status: DRAFT untuk review · Jalur: brainstorming architectural

## 1. Tujuan & success criteria

Upgrade dari single Nara agent (`src/server/ai/nara.ts`, `TOOL_REGISTRY` di
`src/server/ai/nara-tools.ts`, Interactions API + SSE manual di
`src/app/api/nara/chat/stream/route.ts`) ke multi-agent ADK TypeScript
(`@google/adk`) dengan prinsip: **LLM = reasoning, Tool = truth/action**.

Fase-1 (spec ini): `accountant_coordinator` + `bookkeeping_agent` +
`analyst_agent`, orchestrator hybrid, Accounting Control Layer, evaluasi
trajectory. Fase-2 (roadmap): invoice, bank-rec graph, tax, reporting,
audit, AR/AP — dirinci di `doc/next-agent.md`.

Success criteria fase-1:
- Tidak ada angka akuntansi yang berasal dari LLM tanpa tool (hitung,
  validasi, posting selalu via deterministic tools).
- Tidak ada `post_journal` / mutasi uang tanpa approval manusia
  (control layer reject, bukan cuma instruksi prompt).
- Trajectory kasus uji invoice lolos IN_ORDER; negative-case
  (post tanpa approval, tax rule salah tanggal, duplikat lolos) FAIL.
- `bunx tsc --noEmit` + `bun run build` hijau; suite trajectory baru hijau.

## 2. Arsitektur (B murni, direvisi hybrid)

- **Runner:** `stream/route.ts` (saat ini `ai.interactions.create(stream:true)` +
  SSE manual + `previous_interaction_id` di `chat_threads.gemini_interaction_id`)
  diganti `Runner`/`InMemoryRunner` ADK dengan root router hybrid (lihat §4).
- **Session:** `chat_threads`/`chat_messages` (`src/server/db/repos/chat.repo.ts`)
  tetap source of truth UI + RLS + kuota. ADK session InMemory/custom per
  `(app=orgId, user, session=threadId)`, sinkron tiap turn ke Postgres.
  **Jangan pakai `DatabaseSessionService`** — tidak didukung fitur tool
  confirmation ADK (known limitation). `geminiInteractionId` dipakai ulang
  untuk invocation id / chaining.
- **Tools:** `TOOL_REGISTRY` (`ToolDefinition` + `ToolHandler(orgId, actorEmail,
  args)` di `src/server/ai/tools/types.ts`) dibungkus jadi ADK `FunctionTool`
  per spesialis. Logic `execute` manual cek `toolContext.toolConfirmation` →
  `requestConfirmation({hint, payload})` untuk semua MUTATING (ADK TS masih
  manual, belum flag otomatis). `confirm/route.ts` diubah untuk kirim
  `FunctionResponse {name: adk_request_confirmation, confirmed, payload}` +
  `invocation_id` bila Resume dipakai.
- **Dipertahankan:** `withOrg` RLS (`src/server/db/repos/with-org.ts`),
  `Money` BigInt + `deBigInt` (`nara-tools.ts:140-148`), threshold
  `approvalThresholdMinor` + `aiHitlPolicy` (`smart/strict/autonomous`) +
  `postDirectly` pindah dari route ke dalam wrapper `execute` per-tool mutasi,
  kuota `checkAssistantQuota`, `allowAllForSession` hanya berlaku bila
  `!overThreshold`.

Risiko dicatat jujur: confirmation ADK TS experimental + manual; session
double-write (InMemory ADK ↔ Postgres) rawan drift; SSE /
`NaraHitlApprovalCard` / thinking-trace harus dirombak mengikuti event
`adk_request_confirmation`.

## 3. Disiplin Agent vs Tool (R1)

Aturan: memahami pertanyaan / memilih akun / menentukan workflow & treatment /
menganalisis varians / OCR / anomali = Agent (+ tool baca bila perlu).
Mengambil data DB / hitung pajak & debit-kredit / validate journal & tax &
periode & balance-sheet / generate laporan / posting / transfer = Tool
(deterministic, unit-tested).

Konsekuensi fase-1:
- `bookkeeping_agent` boleh reasoning klasifikasi, tapi nominal & validasi
  wajib via `calculate_tax`, `validate_journal_entry`, `check_period`,
  `detect_duplicate_invoice`.
- `analyst_agent` read-only; interpretasi varians boleh LLM, angka wajib dari
  `get_report` / `calculate_variance` / `compare_periods`.
- Tidak ada "Tax Calculation Agent" / "Balance Sheet Agent" yang menghitung
  di prompt — hanya tool.

## 4. Hybrid orchestration (R2)

Bukan coordinator 100% LLM. Alur:

```
USER → ROUTER (deterministik, kode) → BOOKKEEP / ANALYST (/ fase-2: TAX…)
  → VALIDATION (control layer) → HUMAN APPROVAL → POST → AUDIT LOG
```

- **Router deterministik dulu:** intent jelas (keyword/threshold) langsung ke
  spesialis; ambigu → fallback ke `accountant_coordinator` (LlmAgent).
  ADK TS: `RoutedAgent` (router function + failover) untuk chat fase-1.
- **Pipeline dokumen fase-2:** `Workflow` + `RequestInput` graph
  (invoice_to_journal, bank_rec, month_end) — deterministik, node HITL tanpa
  model.
- Struktur TS (adaptasi dari konsep `accounting_agent/`):
  `src/server/ai/agents/` (coordinator, bookkeeping, analyst),
  `src/server/ai/tools/` (existing, dipecah per-agent),
  `src/server/ai/workflows/` (fase-2), `src/server/ai/controls/`,
  `src/server/ai/schemas/` (zod `schema.ts` + skema invoice),
  `tests/.../trajectory.*` (evaluasi).

## 5. Pembagian tools fase-1

- **accountant_coordinator:** tanpa tool DB langsung (opsional
  `get_server_time`). Delegasi → review → jawab Bahasa Indonesia.
- **bookkeeping_agent:** `journal.*` (search/list/create_draft/post/reverse) +
  `invoicing` (create/update/record_payment/post_to_journal/list/detail) +
  `cash-bank` (list/summary/record) + read `list_accounts`, `list/find_contact`,
  `get_server_time`. Semua MUTATING wajib confirmation.
- **analyst_agent:** read-only — `get_report/kpis/briefing/drilldown/
  list_periods/health`, `get_ar_ap_aging`, `list_invoices/detail`,
  `list_contact_ledgers/ledger`, `stock_card`, `bank_rec_status`,
  `list_accounts`. `open/close_period` digeser ke closing-agent fase-2.
- Baru (deterministic, wajib di fase-1): `calculate_tax`,
  `validate_journal_entry`, `check_period`, `detect_duplicate_invoice`,
  `calculate_variance`/`compare_periods` (bila belum ada sebagai tool).

## 6. Accounting Control Layer (R3)

Agen tidak sentuh DB langsung — semua mutasi lewat `src/server/ai/controls/`:

| Kontrol | Implementasi existing yang dipakai ulang |
|---|---|
| Authorization | `requireContext` + `withOrg(orgId, …)`; handler tanpa org → `ORG_WAJIB` |
| Validation | debit=kredit, akun ada & postable (childless, bukan GROUP 4100/5100), periode OPEN via `findPeriodByDate`, tax rule `effective_from/to` per tanggal transaksi |
| Audit log | `appendAudit` (`AKUNIO_DRAFT_CREATE` pattern) untuk tiap draft/post/approve/reject |
| Idempotency | kunci per submit + nomor invoice unik (`detect_duplicate_invoice`) |
| Approval | HITL existing → ADK `requestConfirmation`; `post_journal` tanpa `confirmed` → reject di control layer |
| Period lock | tanggal di luar periode OPEN → tolak dengan nama periode + status |

Contoh workflow nyata (invoice Google Ads Rp11.100.000 incl PPN):
Coordinator → Invoice (fase-2; fase-1 via bookkeeping: extract/validate/
duplikat) → Bookkeeping (`search_account("Google Ads")`, `get_tax_rule`,
`create_journal_draft`) → Control (`validate_journal`, `validate_tax`,
`check_period`) → Human Approval → `post_journal` → Audit Log.

## 7. Data-flow per turn + error

Client SSE → route bangun Runner + session bridge → router → sub-agent →
`FunctionTool.execute` dalam `withOrg` → bila MUTATING/over-threshold:
`requestConfirmation({hint, payload: fullArgs})` → SSE
`adk_request_confirmation` → kartu approval (reuse `NaraHitlApprovalCard` +
`invocation_id`) → `/confirm` kirim FunctionResponse + resume → eksekusi ulang
lolos konfirmasi → tulis `chat_messages` (user/assistant + toolInvocations +
citations) + update bridge/id.

Error: stale interaction/invocation → retry sekali tanpa chaining; tool gagal →
status `failed` + pesan ramah tanpa halusinasi angka; RLS fail-closed; BigInt
via `deBigInt` sebelum SSE/jsonb; kuota dicek sebelum runner.

## 8. Evaluasi trajectory (R4)

ADK `tool_trajectory_avg_score` (EXACT/IN_ORDER/ANY_ORDER) + rubric tool-use
diadaptasi ke Vitest (eval native ADK Python tidak dipakai langsung):

- Kasus emas: "Invoice Google Ads Rp11,1jt incl PPN" ekspektasi
  `extract → detect_duplicate → get_tax_rule → search_account →
  create_draft → validate → request_approval` (IN_ORDER, toleran tool baca
  tambahan di antara).
- Negative-case (harus FAIL bila dilanggar): post tanpa approval, tax rule
  salah tanggal efektif, duplikat lolos, debit≠kredit lolos, posting ke akun
  GROUP, posting ke periode LOCKED.
- Rubric respons: Bahasa Indonesia, tanpa angka halusinasi (`hallucinations_v1`
  adaptasi: setiap angka harus tertelusur ke output tool), sitasi seperlunya.

## 9. Roadmap & non-goals

Roadmap agen berikutnya di `doc/next-agent.md` (invoice, bank-rec graph, tax
rules DB, reporting+validate, audit findings, AR/AP, inventory/assets-closing).
Non-goals fase-1: migrasi session ke `DatabaseSessionService`, auto-post
low-risk tanpa approval, transfer uang otomatis, graph pipeline dokumen
(itu fase-2).
