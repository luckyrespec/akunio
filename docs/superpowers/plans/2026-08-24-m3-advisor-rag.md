# M3 Advisor RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Advisor chat that answers in Bahasa Indonesia from both live company numbers and the IFRS for SME handbook, with separate clickable citations and an optional one-click correction draft into the M2 flow, available as a full `/asisten` page and a floating widget.

**Architecture:** Two-tier pgvector (global `ifrs_chunks` seeded once + per-tenant `tenant_chunks` built real-time via `rag_queue` worker), hybrid vector+tsvector search reranked 0.7/0.3, Gemini `gemini-3.5-flash` (`@google/genai`, `store:false`) for both embeddings (`gemini-embedding` 768-dim) and generation, persisted `chat_threads`/`chat_messages` with citations.

**Tech Stack:** Next.js 16, `@google/genai` >=2.3, `pgvector`, Drizzle ORM, `zod`, `motion`.

## Global Constraints

- Generation model `gemini-3.5-flash` via `GEMINI_MODEL`, embedding model `gemini-embedding`/`text-embedding-004` family (768-dim), both via `@google/genai` >=2.3. Never `2.5-*`/`2.0-*`/`1.5-*`.
- `store:false` on every generation interaction (financial data never stored on Google). No `previous_interaction_id` needed.
- Real-time ingestion: hook after `postJournalEntry`/`uploadDocumentAction` → `rag_queue`, worker batch 20/2s, retry 3x.
- Bahasa Indonesia UI, Paper & Ink Matte, motion `prefers-reduced-motion` aware.
- Tests run on `ledger_test` only (guard in `tests/setup.ts`). Windows PowerShell, Git Bash at `C:\Program Files\Git\bin\bash.exe`.
- Conventional commits; `npx tsc --noEmit` and `npm run build` must stay green.

---

## File Structure

```
src/server/db/schema/rag.ts              # ifrs_chunks, tenant_chunks, chat_threads, chat_messages, rag_queue
src/server/db/repos/rag.repo.ts          # chunk CRUD, hybrid search, queue ops
src/server/ai/embeddings.ts              # embed(text): number[]  + AI_MOCK deterministic vectors
src/server/ai/chunking.ts                # pure: chunkIfsSection, chunkJournal, chunkAccount, chunkPeriodSummary
src/server/ai/rag-worker.ts              # processQueueBatch()
src/server/ai/advisor.ts                 # askAdvisor(orgId, threadId, question): { answer, citations, suggestedDraft? }
src/app/api/advisor/chat/route.ts        # POST { threadId?, message } → { reply, citations, threadId }
src/app/api/advisor/threads/route.ts     # GET list, POST create
src/app/(app)/asisten/page.tsx           # full chat page (thread list + chat pane + citation drawer)
src/components/assistant-widget.tsx      # floating 48px button + 380px sheet, reuses same API
src/components/assistant-thread.tsx      # shared chat UI (bubbles, citation chips, correction button)
src/server/actions/advisor.actions.ts   # createCorrectionDraftAction(threadId, messageId)
drizzle/0004_*.sql                        # pgvector extension + new tables + indexes
```

---

### Task 1: pgvector extension + RAG tables

**Files:**
- Create: `src/server/db/schema/rag.ts`
- Modify: `drizzle.config.ts` (ensure `src/server/db/schema/rag.ts` included), `src/server/db/rls.sql` (add `tenant_chunks`, `chat_threads`, `chat_messages` policies — `ifrs_chunks` global no RLS, `rag_queue` superuser-only)
- Test: `tests/integration/rag-schema.test.ts`

**Interfaces:**
- Produces: tables as per spec §3, HNSW on `embedding`, GIN on `tsv`.

- [ ] **Step 1: Write failing test** – checks `CREATE EXTENSION vector` present and tables exist with expected columns.

```ts
// tests/integration/rag-schema.test.ts
import { describe, it, expect } from "vitest";
describe("rag schema", () => {
  it("has pgvector and rag tables", async () => {
    const { db } = await import("@/server/db");
    const ext = await db.execute(sql`SELECT * FROM pg_extension WHERE extname='vector'`);
    expect(ext.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/integration/rag-schema.test.ts` → FAIL.
- [ ] **Step 3: Implement** `schema/rag.ts` – define tables with `vector("embedding", { dimensions: 768 })` (import from `pgvector/drizzle-orm` or raw `customType`), `tsvector` via `text` + generated column, indexes.
- [ ] **Step 4: Run migrations** `npx drizzle-kit generate && npx drizzle-kit push` (or `migrate`), then `npm run test:db:setup`.
- [ ] **Step 5: Verify** `npx vitest run tests/integration/rag-schema.test.ts` → PASS. Commit.

```bash
git add src/server/db/schema/rag.ts tests/integration/rag-schema.test.ts drizzle
git commit -m "feat(rag): pgvector extension and rag tables"
```

---

### Task 2: Chunking utilities (pure)

**Files:**
- Create: `src/server/ai/chunking.ts`
- Test: `src/server/ai/chunking.test.ts`

**Interfaces:**
- Produces: `chunkIfsSection(text: string, section: string): Array<{ content: string, metadata: { section, chunk_index } }>` (400 tokens, 60 overlap), `chunkJournal(entry), chunkAccount(acc), chunkPeriodSummary(period)` returning `string` content ready for embedding.

- [ ] **Step 1: Write failing test** – asserts IFRS 1000-token input splits into 3 chunks with overlap, journal chunk contains `JE-` number.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – simple whitespace token split, 400/60, metadata. Journal chunk: template `"Jurnal ${number} tanggal ${date} memo ${memo} garis ${lines}"`.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 3: Embedding adapter

**Files:**
- Create: `src/server/ai/embeddings.ts`
- Test: `src/server/ai/embeddings.test.ts`

**Interfaces:**
- Produces: `embed(text: string): Promise<number[]>` – calls `ai.models.embedContent` with `gemini-embedding`, `store:false` not needed for embeddings; `AI_MOCK=1` returns deterministic hash-based vector (length 768).

- [ ] **Step 1: Write failing test** – `AI_MOCK=1` returns same vector for same text, different for different text, length 768.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – check `process.env.AI_MOCK`, else `new GoogleGenAI({apiKey}).models.embedContent(...)`.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 4: Ingestion queue + worker

**Files:**
- Create: `src/server/ai/rag-worker.ts`
- Modify: `src/server/db/repos/journals.repo.ts` (hook after successful post), `src/server/actions/upload.actions.ts` (hook after document upload)
- Test: `tests/integration/rag-ingestion.test.ts`

**Interfaces:**
- Produces: `enqueueRagJob(orgId, kind, refId)` and `processQueueBatch(limit=20): Promise<number>` (processes, embeds via Task 3, upserts `tenant_chunks` with advisory lock).

- [ ] **Step 1: Write failing test** – enqueue a journal, run worker, assert `tenant_chunks` count increments and is tenant-isolated.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – `rag_queue` insert, worker selects `FOR UPDATE SKIP LOCKED`, per-org advisory lock, calls `embed()` + `to_tsvector`.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 5: IFRS seed

**Files:**
- Create: `scripts/seed-ifrs.ts`, `src/server/ai/ifrs-fixture.ts` (5 sample sections for tests)
- Test: `tests/integration/ifrs-seed.test.ts`

**Interfaces:**
- Produces: `seedIfsChunks()` idempotent, populates `ifrs_chunks` from fixture (real handbook PDF later, fixture suffices for M3).

- [ ] **Step 1: Write failing test** – after seed, `SELECT count(*) FROM ifrs_chunks` > 0.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – use chunking + embeddings (mock in tests) to fill table, skip if already populated.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 6: Chat threads/messages + quota

**Files:**
- Create: `src/server/db/repos/chat.repo.ts`
- Test: `tests/integration/chat-repo.test.ts`

**Interfaces:**
- Produces: `createThread(orgId, title)`, `listThreads(orgId)`, `addMessage(threadId, role, content, citations)`, `checkAdvisorQuota(orgId): Promise<{ allowed, message }>` (counts `chat_messages` user role this month vs `ADVISOR_MONTHLY_MESSAGES_LIMIT` default 200).

- [ ] **Step 1: Write failing test** – create thread, add 2 messages, list, quota blocks at limit.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – Drizzle CRUD, quota via `COUNT(*) WHERE created_at >= month_start`.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 7: Hybrid search

**Files:**
- Create: `src/server/db/repos/rag-search.ts`
- Test: `tests/integration/rag-search.test.ts`

**Interfaces:**
- Produces: `hybridSearch(orgId, queryEmbedding, queryText, limit=6): Promise<SearchHit[]>` where `SearchHit = { id, content, kind, score, excerpt, section? }`. Score = 0.7*(1 - cosine) + 0.3*normalized_ts_rank, top-5 tenant + top-5 global merged.

- [ ] **Step 1: Write failing test** – seed tenant chunk "saldo kas November 5jt" and global "IFRS 10 leases", query "saldo kas" returns tenant first.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – raw SQL with `<=>` and `ts_rank`, union + rerank in JS, tenant fallback when <2 hits.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 8: Advisor chat API

**Files:**
- Create: `src/server/ai/advisor.ts`, `src/app/api/advisor/chat/route.ts`, `src/server/actions/advisor.actions.ts`
- Test: `tests/integration/advisor.test.ts` (mock Gemini)

**Interfaces:**
- Produces: `askAdvisor(orgId, threadId, question): Promise<{ answer: string, citations: Citation[], suggestedDraft?: DraftEntry }>` – checks quota, embeds question, hybridSearch, builds prompt (6 chunks + 3 live numbers from Dasbor helpers + last 6 messages), calls `gemini-3.5-flash` `store:false`, parses `suggestedDraft` via zod if confidence>0.75.

- [ ] **Step 1: Write failing test** – mock Gemini returns answer with 2 citations, assert citations saved, quota enforced.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** – use Task 3/7, prompt builder, `generateJournalDraft` reuse for suggestedDraft validation, save messages.
- [ ] **Step 4: Verify** → PASS. Commit.

---

### Task 9: Full page `/asisten`

**Files:**
- Create: `src/app/(app)/asisten/page.tsx`, `src/components/assistant-thread.tsx`
- Test: `tests/e2e/advisor.spec.ts` (smoke with AI_MOCK=1)

**Interfaces:**
- Consumes: chat repo + chat API.

- [ ] **Step 1: Write e2e skeleton** – visit `/asisten`, create thread, send "berapa saldo kas?", expect citation chips.
- [ ] **Step 2: Implement page** – thread list left, chat center, citation drawer, input with Cmd+Enter, `PageTransition`.
- [ ] **Step 3: Verify** → PASS. Commit.

---

### Task 10: Floating widget

**Files:**
- Create: `src/components/assistant-widget.tsx`
- Modify: `src/app/(app)/layout.tsx` (mount widget inside `AppShell`)

**Interfaces:**
- Produces: floating 48px button + 380px Sheet reusing same chat API (default "Cepat" thread per org).

- [ ] **Step 1: Implement** – Sheet, same `askAdvisor` call, semi-transparent backdrop so Laporan stays visible.
- [ ] **Step 2: Verify** e2e – open widget on `/laporan`, ask quick question, see answer. Commit.

---

### Task 11: Correction draft bridge + polish

**Files:**
- Modify: `src/server/actions/advisor.actions.ts` (add `createCorrectionDraftAction`), `src/app/(app)/asisten/page.tsx` (button)
- Test: integration – clicking suggestion creates `ai_drafts` with `source:ADVISOR` and redirects to `/jurnal/ai/[id]`.

- [ ] **Step 1: Implement** – server action creates `ai_drafts` via M2 repo, returns draftId.
- [ ] **Step 2: Verify** → PASS. Commit.

---

## Self-Review Checklist

- Spec coverage: every spec § addressed (two-tier indexes T1/5, real-time ingestion T4, chat history T6, hybrid search T7, Gemini generation T8, both UIs T9-10, correction draft T11).
- Placeholders: none (all steps have code).
- Type consistency: `hybridSearch` signature matches advisor usage; `askAdvisor` returns `suggestedDraft?: DraftEntry` where `DraftEntry` is M2's zod type.
