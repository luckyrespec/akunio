# Doctor SAK-Grounded Correction Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded correction templates with a hybrid pipeline: deterministic money-moving frames computed from finding evidence plus LLM narratives cited strictly to the uploaded SAK EMKM document, including AI-proposed COA accounts created atomically on approval.

**Architecture:** Evidence resolver → per-type deterministic builders (pure, tested) → COA resolver/proposer → SAK chunk retrieval (`ifrs_chunks`, section prefix `SAK-EMKM`) → LLM narrator (Interactions API, JSON Schema, retry 2) → deterministic validators (balance, amounts, citations) → `ai_drafts` review → atomic accept (create accounts + post).

**Tech Stack:** Next.js 16.3 App Router, TypeScript strict (`no any`), Drizzle ORM 0.45 + pg, Vitest 4, `@google/genai` Interactions API (`gemini-3.5-flash-lite`, never `2.5-*`/`2.0-*`/`1.5-*`), `Money` BigInt minor, `withOrg` for tenant transactions.

**Spec:** `docs/superpowers/specs/2026-09-05-doctor-sak-grounded-correction-design.md`

## Global Constraints

- `bunx tsc --noEmit` strict, `no any` — use `unknown` + narrowing.
- Money: `numeric(18,2)` in DB, `Money` class BigInt minor via `Money.parseIdr`/`formatIdr` (`src/core/money/money.ts`) — never JS `number` for amounts.
- New tenant-scoped `db.transaction` calls must use `withOrg` (`src/server/db/repos/with-org.ts`), else RLS blocks under `app_user`.
- Jurnal: `validate → post → immutable`, DRAFT→POSTED only, corrections via `reversal_of_id` (`src/server/db/triggers.sql`).
- Gemini: Interactions API pattern in `src/server/ai/adapter.ts`, `response_format` JSON Schema, retry 2 (`MAX_RETRIES`), `GEMINI_MODEL=gemini-3.5-flash-lite`.
- Tests: `bun.exe x vitest run <file>` (Windows Bun via PowerShell); integration tests hit `ledger_test` only (`tests/setup.ts` rewrites URL, `tests/integration/helpers.ts:guardTestDb` throws otherwise). Never touch dev Neon from tests.
- `AI_MOCK=1` (or missing `GEMINI_API_KEY`) must degrade deterministically, never throw unhandled.
- Bahasa Indonesia user-facing copy. Paper & Ink tokens, no new colors.
- Copyright: SAK document text is NEVER committed to the repo. Ingest reads an explicit local path (`SAK_SOURCE_PATH`) at admin time; only indexed chunks live in DB. Tests use 2–3 sentence paraphrased fixtures, never copied passages.

---

## File Structure

- Create: `src/server/db/schema/sak.ts` — `sakSources` registry (`docId`, `version`, `effectiveDate`).
- Create: `src/server/db/repos/sak.repo.ts` — `registerSakSource`, `getActiveSakSource`, `isSakSection` (section starts with `SAK-EMKM`).
- Create: `src/server/ai/seed-sak.ts` — `seedSakChunks(sourcePath, opts)` reading a local file, splitting per `BAB`, chunking via `chunkIfsSection`, embedding via injectable `embedText` (default `embed`), INSERT with `to_tsvector`, registering source version.
- Create: `src/core/doctor/evidence.ts` — `resolveEvidenceAmounts(evidence: unknown)` returning `{ amountMinor: bigint; entryIds: string[]; codes: string[] }` with strict validation.
- Create: `src/server/doctor/builders.ts` — 5 pure builders returning `CorrectionFrame`.
- Create: `src/server/doctor/citations.ts` — `CorrectionNarrationSchema` (zod), `validateCitations(citations, retrievedIds, docId)`.
- Create: `src/server/ai/correction-narrator.ts` — `generateCorrectionNarration(input)` (Interactions API, JSON Schema).
- Modify: `src/app/(app)/temuan/actions.ts` — rewrite `proposeCorrectionAction` into the pipeline; extend accept path for atomic account creation.
- Modify: `src/server/actions/ai.actions.ts` — `acceptDraftAction` creates `accountProposals` before posting, same `withOrg` transaction.
- Modify: `src/app/(app)/jurnal/ai/[id]/review-client.tsx` — "akun baru" chip + verified citation line (minimal).
- Test: `tests/unit/doctor/evidence.test.ts`, `tests/unit/doctor/builders.test.ts`, `tests/unit/doctor/citations.test.ts`, `tests/integration/sak-correction.test.ts`, `tests/eval/correction-quality.test.ts`.

**Interfaces:**
- `CorrectionFrame = { lines: Array<{ accountCode: string; debitMinor: bigint; creditMinor: bigint; memo: string }>; reversalOfId: string | null; strategy: "REVERSAL" | "RECLASS" | "CUTOFF" | "SUMMARY_ONLY" }`
- `AccountProposal = { code: string; name: string; type: "ASET"|"LIABILITAS"|"EKUITAS"|"PENDAPATAN"|"BEBAN"; normal: "D"|"K"; parentCode: string; reason: string }`
- `SakChunk = { id: string; section: string; content: string }`
- `CorrectionNarration = { explanation: string; citations: Array<{ docId: string; bab: string; paragraph: string }> }`

---

### Task 1: Registry sumber SAK (`sak_sources`)

**Files:**
- Create: `src/server/db/schema/sak.ts`
- Modify: `src/server/db/schema/index.ts` (add export; check current exports first)
- Create: `src/server/db/repos/sak.repo.ts`
- Test: `tests/integration/sak-sources.test.ts`
- Generate: `drizzle/` migration via `drizzle-kit generate`, then migrate test DB

**Interfaces:**
- Consumes: `Queryable` (`src/server/db/repos/queryable.ts`).
- Produces: `registerSakSource(q, input: { docId: string; version: string; effectiveDate: string }): Promise<SakSource>`, `getActiveSakSource(q): Promise<SakSource | null>` (latest `effectiveDate`), `isSakSection(section: string): boolean` (pure, `section.startsWith("SAK-EMKM")`).

- [ ] **Step 1: Tulis integration test registry**

```ts
import { describe, it, expect } from "vitest";
import { registerSakSource, getActiveSakSource, isSakSection } from "@/server/db/repos/sak.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("sak sources registry", () => {
  it("isSakSection detects SAK sections only", () => {
    expect(isSakSection("SAK-EMKM-Bab7")).toBe(true);
    expect(isSakSection("IFRS-SME-3")).toBe(false);
  });

  it("registers and returns the latest effective source", async () => {
    const { db } = await import("@/server/db");
    const docId = `TEST-DOC-${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await registerSakSource(tx as never, { docId, version: "v2024.1", effectiveDate: "2024-01-01" });
      await registerSakSource(tx as never, { docId, version: "v2024.2", effectiveDate: "2024-06-01" });
      const active = await getActiveSakSource(tx as never);
      expect(active?.version).toBe("v2024.2");
    });
    await db.execute(`DELETE FROM sak_sources WHERE doc_id = '${docId}'` as never);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan FAIL**

Run: `bun.exe x vitest run tests/integration/sak-sources.test.ts`
Expected: FAIL with "Cannot find module '@/server/db/repos/sak.repo'".

- [ ] **Step 3: Tulis schema + repo (ikuti gaya `src/server/db/schema/rag.ts` dan `src/server/db/repos/findings.repo.ts`)**

```ts
// src/server/db/schema/sak.ts
import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";

export const sakSources = pgTable("sak_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  docId: text("doc_id").notNull(),
  version: text("version").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SakSource = typeof sakSources.$inferSelect;
```

```ts
// src/server/db/repos/sak.repo.ts
import { desc } from "drizzle-orm";
import { sakSources, type SakSource } from "../schema/sak";
import type { Queryable } from "./queryable";

export async function registerSakSource(
  q: Queryable,
  input: { docId: string; version: string; effectiveDate: string },
): Promise<SakSource> {
  const [row] = await q.insert(sakSources).values(input).returning();
  return row;
}

export async function getActiveSakSource(q: Queryable): Promise<SakSource | null> {
  const [row] = await q.select().from(sakSources).orderBy(desc(sakSources.effectiveDate)).limit(1);
  return row ?? null;
}

export function isSakSection(section: string): boolean {
  return section.startsWith("SAK-EMKM");
}
```

Tambahkan `export * from "./sak";` ke `src/server/db/schema/index.ts` (buka file dulu, ikuti pola export yang ada).

- [ ] **Step 4: Generate + terapkan migrasi ke test DB**

Run: `bun.exe x drizzle-kit generate`
Expected: file `drizzle/NNNN_*.sql` baru berisi `CREATE TABLE "sak_sources"`.

Run (PowerShell, agar env terlihat oleh Bun Windows):
`$env:DATABASE_URL='postgresql://postgres:root@127.0.0.1:5432/ledger_test'; bun.exe x drizzle-kit migrate`
Expected: `migrations applied successfully!`

- [ ] **Step 5: Jalankan test, pastikan PASS**

Run: `bun.exe x vitest run tests/integration/sak-sources.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/sak.ts src/server/db/schema/index.ts src/server/db/repos/sak.repo.ts tests/integration/sak-sources.test.ts drizzle/
git commit -m "feat(sak): source registry for SAK EMKM grounding"
```

---

### Task 2: Ingest dokumen SAK ke `ifrs_chunks`

**Files:**
- Create: `src/server/ai/seed-sak.ts`
- Test: `tests/integration/sak-ingest.test.ts`

**Interfaces:**
- Consumes: `chunkIfsSection(text, section)` (`src/server/ai/chunking.ts`), `embed(text)` (`src/server/ai/embeddings.ts`), `registerSakSource` (Task 1), `ifrsChunks` schema.
- Produces: `seedSakChunks(sourcePath: string, opts?: { docId?: string; version?: string; embedText?: (t: string) => Promise<number[]> }): Promise<{ chunks: number; docId: string; version: string }>`

Aturan: section SELALU `SAK-EMKM-Bab<N>` (diambil dari heading `BAB <N>` dalam file; teks sebelum BAB pertama → `SAK-EMKM-Pembuka`). Embeddings default `embed`; injeksi `embedText` untuk test (tanpa API key). Tanpa API key DAN tanpa injeksi → throw `AI_TIDAK_TERSEDIA` (konsisten dengan `embed`).

- [ ] **Step 1: Tulis integration test ingest (embedder palsu, tanpa API key)**

```ts
import { describe, it, expect } from "vitest";
import { seedSakChunks } from "@/server/ai/seed-sak";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BAB_FIXTURE = [
  "BAB 7",
  "KEBIJAKAN AKUNTANSI, ESTIMASI, DAN KESALAHAN",
  "",
  "Paragraf contoh pertama tentang koreksi kesalahan periode lalu secara retrospektif.",
  "Paragraf contoh kedua tentang estimasi akuntansi yang diakui prospektif.",
].join("\n");

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("sak ingest", () => {
  it("splits per BAB, sections prefixed, source registered", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sak-"));
    const p = join(dir, "sak.md");
    writeFileSync(p, `${BAB_FIXTURE}\n\nBAB 9\n\nParagraf contoh tentang persediaan diukur sebesar biaya perolehan.`);
    const fakeEmbed = async () => new Array(768).fill(0.01);
    const res = await seedSakChunks(p, {
      docId: `TEST-SAK-${crypto.randomUUID()}`,
      version: "vTEST",
      embedText: fakeEmbed,
    });
    expect(res.chunks).toBeGreaterThanOrEqual(2);
    const { db } = await import("@/server/db");
    const rows = (await db.execute(
      `SELECT section FROM ifrs_chunks WHERE section LIKE 'SAK-EMKM-%' LIMIT 5`,
    ) as unknown as { rows: Array<{ section: string }> }).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.section.startsWith("SAK-EMKM"))).toBe(true);
  });
});
```

(Catatan: fixture 2–3 kalimat parafrase — bukan salinan dokumen asli.)

- [ ] **Step 2: Jalankan test, pastikan FAIL**

Run: `bun.exe x vitest run tests/integration/sak-ingest.test.ts`
Expected: FAIL with "Cannot find module '@/server/ai/seed-sak'".

- [ ] **Step 3: Implementasi minimal (cerminkan `src/server/ai/seed-ifrs.ts`)**

```ts
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { chunkIfsSection } from "./chunking";
import { embed } from "./embeddings";
import { registerSakSource } from "@/server/db/repos/sak.repo";

export async function seedSakChunks(
  sourcePath: string,
  opts?: { docId?: string; version?: string; embedText?: (t: string) => Promise<number[]> },
): Promise<{ chunks: number; docId: string; version: string }> {
  const raw = readFileSync(sourcePath, "utf8");
  const embedText = opts?.embedText ?? embed;
  const docId = opts?.docId ?? "SAK-EMKM-2024";
  const version = opts?.version ?? "v2024.1";

  // Pecah per BAB; teks sebelum BAB pertama jadi Pembuka.
  const parts: Array<{ bab: string; text: string }> = [];
  const re = /^BAB\s+(\d+)\s*$/gim;
  let lastIdx = 0, lastBab = "Pembuka", m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIdx) parts.push({ bab: lastBab, text: raw.slice(lastIdx, m.index) });
    lastBab = `Bab${m[1]}`;
    lastIdx = m.index;
  }
  parts.push({ bab: lastBab, text: raw.slice(lastIdx) });

  let total = 0;
  await db.transaction(async (tx) => {
    for (const part of parts) {
      if (!part.text.trim()) continue;
      const section = `SAK-EMKM-${part.bab}`;
      for (const [i, c] of chunkIfsSection(part.text, section).entries()) {
        if (!c.content.trim()) continue;
        const embedding = await embedText(c.content);
        await tx.execute(sql`
          INSERT INTO ifrs_chunks (section, chunk_index, content, embedding, tsv)
          VALUES (${section}, ${String(i)}, ${c.content}, ${JSON.stringify(embedding)}, to_tsvector('english', ${c.content}))
        `);
        total++;
      }
    }
    await registerSakSource(tx as never, { docId, version, effectiveDate: new Date().toISOString().slice(0, 10) });
  });
  return { chunks: total, docId, version };
}
```

- [ ] **Step 4: Jalankan test, pastikan PASS**

Run: `bun.exe x vitest run tests/integration/sak-ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/seed-sak.ts tests/integration/sak-ingest.test.ts
git commit -m "feat(sak): ingest SAK EMKM document into ifrs_chunks"
```

---

### Task 3: Resolver evidence (`resolveEvidenceAmounts`)

**Files:**
- Create: `src/core/doctor/evidence.ts`
- Test: `tests/unit/doctor/evidence.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `resolveEvidenceAmounts(evidence: unknown): { amountMinor: bigint; entryIds: string[]; codes: string[] }`. Rules: `amountMinor`/`amount`/`totalMinor`/`curTot` string numerik → BigInt (gagal → throw `EVIDENCE_TIDAK_VALID`); `entryId` string non-kosong → `entryIds`; `code` string non-kosong → `codes`; `null`/non-object → throw. UUID tidak divalidasi formatnya (hanya non-kosong).

- [ ] **Step 1: Tulis unit test**

```ts
import { describe, it, expect } from "vitest";
import { resolveEvidenceAmounts } from "@/core/doctor/evidence";

describe("resolveEvidenceAmounts", () => {
  it("reads amountMinor + entryId + code", () => {
    expect(resolveEvidenceAmounts({ amountMinor: "10000000", entryId: "e1", code: "1110" }))
      .toEqual({ amountMinor: 10000000n, entryIds: ["e1"], codes: ["1110"] });
  });
  it("accepts amount/curTot aliases", () => {
    expect(resolveEvidenceAmounts({ curTot: "5000" }).amountMinor).toBe(5000n);
  });
  it("throws on null, non-object, and non-numeric amount", () => {
    expect(() => resolveEvidenceAmounts(null)).toThrow("EVIDENCE_TIDAK_VALID");
    expect(() => resolveEvidenceAmounts("x")).toThrow("EVIDENCE_TIDAK_VALID");
    expect(() => resolveEvidenceAmounts({ amountMinor: "abc" })).toThrow("EVIDENCE_TIDAK_VALID");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan FAIL** — Run: `bun.exe x vitest run tests/unit/doctor/evidence.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implementasi minimal sesuai interface di atas.**
- [ ] **Step 4: PASS** — rerun, Expected: PASS (3 tests).
- [ ] **Step 5: Commit** — `git add src/core/doctor/evidence.ts tests/unit/doctor/evidence.test.ts && git commit -m "feat(doctor): strict evidence amount resolver"`

---

### Task 4: Builder deterministik per tipe

**Files:**
- Create: `src/server/doctor/builders.ts`
- Test: `tests/unit/doctor/builders.test.ts`

**Interfaces:**
- Consumes: `CorrectionFrame` types (defined here), org leaf accounts `Array<{ id: string; code: string; name: string }>` for counterparty lookup, `resolveDraftAccounts` (`src/core/ai/map-accounts.ts`) — builders output `accountCode`s; resolution to IDs happens in Task 7 orchestrator (keeps builders pure).
- Produces: `buildDuplicateCorrection(entry: { id: string; memo: string; lines: Array<{ accountCode: string; debitMinor: bigint; creditMinor: bigint }> }): CorrectionFrame` (REVERSAL: mirror lines D↔K, `reversalOfId: entry.id`); `buildAbnormalCorrection(code: string, abnormalMinor: bigint, normal: "D"|"K"): CorrectionFrame` (RECLASS: lawan = `3100` Modal Disetor bila tak ada info lain — didokumentasikan di kode sebagai default eksplisit per tipe, bukan tebakan umum); `buildMissingReceiptCorrection(amountMinor: bigint, suspenseCode: string): CorrectionFrame` (RECLASS ke akun penampung dari COA org, BUKAN 1180 fiktif — caller wajib oper kode akun penampung yang resolved, throw bila kosong); `buildOddDateCorrection(...)`: `CorrectionFrame` dengan `strategy: "CUTOFF"` dan memo pindah periode (tanpa jurnal lawan — tanggal ditangani saat posting); `buildRatioSummary(...)`: `strategy: "SUMMARY_ONLY"`, lines kosong.

Nominal SELALU dari argumen (bigint), tidak ada konstanta nominal di file ini kecuali NOL.

- [ ] **Step 1: Tulis unit test (angka nyata, D=K, reversal menunjuk entry)**

```ts
import { describe, it, expect } from "vitest";
import { buildDuplicateCorrection, buildAbnormalCorrection } from "@/server/doctor/builders";

describe("correction builders", () => {
  it("duplicate mirrors lines and links reversal", () => {
    const f = buildDuplicateCorrection({
      id: "e1", memo: "Beli ATK",
      lines: [
        { accountCode: "5100", debitMinor: 15000000n, creditMinor: 0n },
        { accountCode: "1110", debitMinor: 0n, creditMinor: 15000000n },
      ],
    });
    expect(f.reversalOfId).toBe("e1");
    const d = f.lines.reduce((s, l) => s + l.debitMinor, 0n);
    const c = f.lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(d).toBe(c);
    expect(d).toBe(15000000n);
    expect(f.lines[0]).toMatchObject({ accountCode: "5100", debitMinor: 0n, creditMinor: 15000000n });
  });

  it("abnormal reclasses the exact abnormal amount", () => {
    const f = buildAbnormalCorrection("1110", 2500000n, "D");
    const d = f.lines.reduce((s, l) => s + l.debitMinor, 0n);
    expect(d).toBe(2500000n);
    expect(f.lines.some((l) => l.accountCode === "1110")).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `bun.exe x vitest run tests/unit/doctor/builders.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implementasi 5 builder + tipe `CorrectionFrame`/`CorrectionStrategy` persis seperti interface di atas.**
- [ ] **Step 4: PASS** — rerun, Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/server/doctor/builders.ts tests/unit/doctor/builders.test.ts && git commit -m "feat(doctor): deterministic per-type correction builders"`

---

### Task 5: Skema narasi + validator sitasi

**Files:**
- Create: `src/server/doctor/citations.ts`
- Test: `tests/unit/doctor/citations.test.ts`

**Interfaces:**
- Consumes: nothing (pure; zod — cek `package.json`, zod tersedia).
- Produces: `CorrectionNarrationSchema` (zod object `{ explanation: string(min 20, max 600), citations: array(min 1, max 3) of { docId: string, bab: string(min 1), paragraph: string(min 1) } }`), `validateCitations(narration: unknown, retrieved: Array<{ id: string; section: string }>, docId: string): { ok: true } | { ok: false; reason: string }`. Aturan: schema parse gagal → `{ok:false}`; setiap sitasi `docId` harus sama dengan docId aktif; setiap sitasi harus cocok ke minimal satu retrieved chunk yang `section`-nya mengandung `Bab<bab>` (case-insensitive, abaikan spasi); minimal 1 sitasi valid.

- [ ] **Step 1: Tulis unit test**

```ts
import { describe, it, expect } from "vitest";
import { validateCitations } from "@/server/doctor/citations";

const retrieved = [{ id: "c1", section: "SAK-EMKM-Bab7" }];

describe("validateCitations", () => {
  it("accepts verifiable citations", () => {
    expect(validateCitations(
      { explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.", citations: [{ docId: "D", bab: "7", paragraph: "7.16" }] },
      retrieved, "D",
    ).ok).toBe(true);
  });
  it("rejects wrong doc, unmatched bab, and short explanation", () => {
    expect(validateCitations(
      { explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.", citations: [{ docId: "X", bab: "7", paragraph: "7.16" }] },
      retrieved, "D",
    ).ok).toBe(false);
    expect(validateCitations(
      { explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.", citations: [{ docId: "D", bab: "99", paragraph: "99.1" }] },
      retrieved, "D",
    ).ok).toBe(false);
    expect(validateCitations({ explanation: "pendek", citations: [] }, retrieved, "D").ok).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `bun.exe x vitest run tests/unit/doctor/citations.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implementasi zod schema + validator persis interface di atas.**
- [ ] **Step 4: PASS** — rerun, Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/server/doctor/citations.ts tests/unit/doctor/citations.test.ts && git commit -m "feat(doctor): narration schema and citation validator"`

---

### Task 6: Narator LLM (pola adapter existing)

**Files:**
- Create: `src/server/ai/correction-narrator.ts`
- Test: `tests/unit/doctor/narrator.test.ts` (AI_MOCK path, tanpa API key)

**Interfaces:**
- Consumes: `CorrectionNarrationSchema` (Task 5), Interactions API persis `src/server/ai/adapter.ts:35-79` (model `GEMINI_MODEL ?? "gemini-3.5-flash-lite"`, `store: STORE_INTERACTIONS` dari `./interaction-memory`, `response_format` JSON Schema, retry `MAX_RETRIES = 2`), `SakChunk` (`{ id, section, content }`).
- Produces: `generateCorrectionNarration(input: { findingType: string; frameSummary: string; chunks: SakChunk[]; docId: string }): Promise<CorrectionNarration>`. Prompt: instruksikan Bahasa Indonesia 2–4 kalimat, sitasi HANYA `(docId, Bab, paragraf)` dari chunk yang diberikan (cantumkan daftar section valid di prompt), angka dilarang diubah (narator tak menerima nominal — hanya `frameSummary` tekstual seperti "pembalik Rp150.000 atas JE-2026-0001"). Tanpa `GEMINI_API_KEY` atau `AI_MOCK=1` → kembalikan narasi deterministik dari chunk pertama (BUKAN citations kosong — itu gagal validator): `{ explanation: ..., citations: [{ docId, bab: <angka dari section>, paragraph: "mock" }] }`. Jika chunks kosong → throw `SAK_TIDAK_TERSEDIA`.

- [ ] **Step 1: Tulis unit test (mock path)**

```ts
import { describe, it, expect } from "vitest";
import { generateCorrectionNarration } from "@/server/ai/correction-narrator";

describe("correction narrator (mock)", () => {
  it("returns deterministic narration citing the first chunk without API key", async () => {
    process.env.AI_MOCK = "1";
    const n = await generateCorrectionNarration({
      findingType: "duplicates",
      frameSummary: "pembalik Rp150.000 atas JE-2026-0001",
      chunks: [{ id: "c1", section: "SAK-EMKM-Bab7", content: "x" }],
      docId: "D",
    });
    expect(n.citations[0].docId).toBe("D");
    expect(n.explanation.length).toBeGreaterThanOrEqual(20);
    delete process.env.AI_MOCK;
  });

  it("throws SAK_TIDAK_TERSEDIA when no chunks", async () => {
    process.env.AI_MOCK = "1";
    await expect(generateCorrectionNarration({
      findingType: "duplicates", frameSummary: "x", chunks: [], docId: "D",
    })).rejects.toThrow("SAK_TIDAK_TERSEDIA");
    delete process.env.AI_MOCK;
  });
});
```

- [ ] **Step 2: FAIL** — Run: `bun.exe x vitest run tests/unit/doctor/narrator.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implementasi (salin pola `callGemini`, schema narasi sendiri, bukan DraftEntry).**
- [ ] **Step 4: PASS** — rerun, Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/server/ai/correction-narrator.ts tests/unit/doctor/narrator.test.ts && git commit -m "feat(doctor): SAK-grounded correction narrator"`

---

### Task 7: Orkestrator — tulis ulang `proposeCorrectionAction`

**Files:**
- Modify: `src/app/(app)/temuan/actions.ts:64-147` (ganti isi `proposeCorrectionAction`, pertahankan signature + return `{ ok, draftId }`)
- Test: `tests/integration/sak-correction.test.ts`

**Interfaces:**
- Consumes: Task 3 (`resolveEvidenceAmounts`), Task 4 (builders), `resolveDraftAccounts` (`src/core/ai/map-accounts.ts`), `hybridSearch` (`src/server/db/repos/rag-search.ts`), Task 6 (narrator), Task 5 (validator), `createProposal` (findings.repo), `createDraft` (drafts.repo), `getEntryWithLines` (journals.repo), `listAccountsWithBalances` (ledger.repo) untuk abnormal amounts, `withOrg`.
- Produces: perilaku baru `proposeCorrectionAction(findingId)`. Alur per tipe:
  - duplicates/oddDates/missingReceipts: ambil entry via `getEntryWithLines`; builder dari lines/entry aktual (duplicates → reversal; oddDates → CUTOFF; missingReceipts → suspense = akun penampung COA org: cari code `1600`, lalu `1200`, lalu lempar `AKUN_PENAMPUNG_TIDAK_ADA` → proposal akun baru Task 8).
  - abnormalBalances: amount dari `listAccountsWithBalances` (cocokkan `code`), builder RECLASS.
  - ratioAnomalies: `SUMMARY_ONLY` — draf berisi ringkasan + tautan, tanpa lines (review memblokir posting sampai user isi; JANGAN isi angka template).
  - Setelah frame: resolve codes → IDs via `resolveDraftAccounts` terhadap leaf accounts; codes tak terpetakan → `AccountProposal` (Task 8); confidence baris = `1.0` terpetakan / `0.45` usulan (aturan kejujuran existing, bukan 0.85/0.88 generik — `overallConfidence` = rata-rata confidence baris).
  - Retrieve: `hybridSearch(orgId, await embed(query), queryText, 4)` lalu filter `isSakSection(section)`; butuh `GEMINI_API_KEY` untuk embed — tanpanya fallback kata kunci: `SELECT ... WHERE section LIKE 'SAK-EMKM-Bab%'` per Bab yang dipetakan tipe→Bab (`{ duplicates: ["Bab7"], abnormalBalances: ["Bab2","Bab3","Bab4"], missingReceipts: ["Bab2","Bab6"], oddDates: ["Bab2"], ratioAnomalies: ["Bab2"] }`). Tanpa chunk → cap temuan manual, return `{ ok: false, error: "SAK_BELUM_TERSEDIA: jalankan ingest dokumen" }` (BUKAN draf asal).
  - Narrate → validate → `createProposal` + `createDraft` (model `"doctor-sak"`, sertakan `mapping`, `accountProposals`, `citations`, `sakDocId`, `sakVersion` di JSON draf).

- [ ] **Step 1: Tulis integration test pengaman (duplicates, tanpa API key)**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("sak correction pipeline", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT SAK")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("duplicate proposal path is auth-guarded and never drafts blindly", async () => {
    const journals = await import("@/server/db/repos/journals.repo");
    const findings = await import("@/server/db/repos/findings.repo");
    const { db } = await import("@/server/db");
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    const entry = await db.transaction((tx) =>
      journals.postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-05-01`, memo: "Beli ATK",
        lines: [
          { accountId: byCode["5200"], debitMinor: 7500000n, creditMinor: 0n },
          { accountId: byCode["1110"], debitMinor: 0n, creditMinor: 7500000n },
        ],
      }));
    const f = await db.transaction((tx) =>
      findings.createFinding(tx as never, orgId, {
        type: "duplicates", severity: "MEDIUM",
        evidence: { entryId: entry.id, entryNumber: entry.number, memo: "Beli ATK" },
      }));
    const { proposeCorrectionAction } = await import("@/app/(app)/temuan/actions");
    // Server action butuh sesi auth: tanpa sesi ia melempar FORBIDDEN.
    // Test ini mengunci perilaku aman (hanya error yang diizinkan, tak ada draf buta).
    const res = await proposeCorrectionAction(f.id).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!res.ok) {
      expect(["FORBIDDEN_AKSES", "SAK_BELUM_TERSEDIA"]).toContain(
        (res as { error?: string }).error?.split(":")[0] ?? "FORBIDDEN_AKSES",
      );
    }
  });
});
```

- [ ] **Step 2: Tulis DULU sebagai jaring pengaman** — Run: `bun.exe x vitest run tests/integration/sak-correction.test.ts` — Expected: PASS terhadap kode lama (hanya mengunci error aman), lalu refactor.
- [ ] **Step 3: Tulis ulang `proposeCorrectionAction` sesuai interface di atas.** Hapus SEMUA konstanta nominal template (`100.000`, `500.000`, `250.000`, `1.000.000`) dan kode `1180` dari fungsi ini. Simpan `mapping`, `accountProposals`, `citations`, `sakDocId`, `sakVersion` di JSON draf.
- [ ] **Step 4: PASS + `tsc`** — rerun test + `bun.exe x tsc --noEmit`. Expected: hijau.
- [ ] **Step 5: Commit** — `git add "src/app/(app)/temuan/actions.ts" tests/integration/sak-correction.test.ts && git commit -m "feat(doctor): SAK-grounded proposal pipeline"`

---

### Task 8: Proposal akun COA + posting atomik

**Files:**
- Modify: `src/server/actions/ai.actions.ts:139+` (`acceptDraftAction` — baca file dulu, pertahankan signature)
- Create: `src/server/accounts/propose.ts` — `validateAccountProposal(q, orgId, p: AccountProposal): Promise<void>` (kode unik per org; induk ada & header; tipe/normal konsisten D/K; throw `USULAN_AKUN_TIDAK_VALID: <alasan>`)
- Test: `tests/integration/account-proposal.test.ts`

**Interfaces:**
- Consumes: tipe `AccountProposal` dari `src/server/doctor/builders.ts` (Task 4 — pastikan diekspor dari sana), `createAccount` (`src/server/db/repos/accounts.repo.ts:32` — baca signature persisnya dulu).
- Produces: `acceptDraftAction` yang, bila JSON draf memuat `accountProposals: AccountProposal[]`, memvalidasi + membuat semuanya DAHULU lalu memetakan ulang lines yang `accountId`-nya null ke akun baru tersebut, baru posting — semua dalam SATU transaksi `withOrg` yang sama. Gagal di langkah mana pun → throw, tak ada akun yatim.

- [ ] **Step 1: Tulis integration test atomicity**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("account proposal atomicity", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Akun")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("validateAccountProposal rejects duplicate code and bad parent", async () => {
    const { validateAccountProposal } = await import("@/server/accounts/propose");
    const { db } = await import("@/server/db");
    await expect(db.transaction((tx) =>
      validateAccountProposal(tx as never, orgId, {
        code: "1110", name: "Duplikat", type: "ASET", normal: "D",
        parentCode: "1100", reason: "x",
      }),
    )).rejects.toThrow(/USULAN_AKUN_TIDAK_VALID/);
    await expect(db.transaction((tx) =>
      validateAccountProposal(tx as never, orgId, {
        code: "1190", name: "X", type: "ASET", normal: "D",
        parentCode: "9999", reason: "x",
      }),
    )).rejects.toThrow(/USULAN_AKUN_TIDAK_VALID/);
  });

  it("accepts a well-formed proposal shape", async () => {
    const { validateAccountProposal } = await import("@/server/accounts/propose");
    const { db } = await import("@/server/db");
    await db.transaction(async (tx) => {
      await validateAccountProposal(tx as never, orgId, {
        code: "1190", name: "Uang Muka", type: "ASET", normal: "D",
        parentCode: "1100", reason: "penampung",
      });
    });
  });
});
```

- [ ] **Step 2: FAIL** — Run: `bun.exe x vitest run tests/integration/account-proposal.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implementasi `validateAccountProposal` + kabel `acceptDraftAction`.** Baca `createAccount` dan badan `acceptDraftAction` yang ada DAHULU; jangan ubah signature-nya. Usulan akun dibuat via repo accounts yang sama (bukan SQL mentah).
- [ ] **Step 4: PASS + `tsc`** — rerun + `bun.exe x tsc --noEmit`. Expected: hijau.
- [ ] **Step 5: Commit** — `git add src/server/accounts/propose.ts src/server/actions/ai.actions.ts tests/integration/account-proposal.test.ts && git commit -m "feat(doctor): atomic COA account proposals on accept"`

---

### Task 9: UI review — chip akun baru + sitasi terverifikasi

**Files:**
- Modify: `src/app/(app)/jurnal/ai/[id]/review-client.tsx` (baca dulu; pola NEEDS_ACCOUNT + PageActions sudah ada)
- Create helper teruji: `src/app/(app)/jurnal/ai/[id]/proposal-labels.ts` — JANGAN logika di JSX tanpa helper teruji.
- Test: `tests/unit/components/doctor-proposal.test.ts`

**Interfaces:**
- Consumes: bentuk JSON draf dari Task 7 (`accountProposals`, `citations`, `sakVersion`).
- Produces: baris ber-usulan-akun tampil chip "akun baru" (terra outline, konsisten badge existing) + detail usulan (kode · nama · induk); blok sitasi "Dasar SAK: Dok vX Bab Y par. Z" hanya dari sitasi tervalidasi; tak ada perubahan perilaku Posting/Tolak. Helper: `proposalChipLabel(line: { accountCode: string; proposed?: boolean }): string`, `citationLabel(c: { docId: string; bab: string; paragraph: string }): string`.

- [ ] **Step 1: Tulis unit test helper**

```ts
import { describe, it, expect } from "vitest";
import { proposalChipLabel, citationLabel } from "@/app/(app)/jurnal/ai/[id]/proposal-labels";

describe("proposal labels", () => {
  it("labels proposed accounts", () => {
    expect(proposalChipLabel({ accountCode: "1180", proposed: true })).toBe("akun baru");
    expect(proposalChipLabel({ accountCode: "5100", proposed: false })).toBe("periksa");
  });
  it("formats verified citations", () => {
    expect(citationLabel({ docId: "SAK-EMKM-2024", bab: "7", paragraph: "7.16" }))
      .toBe("Dok SAK-EMKM-2024 Bab 7 par. 7.16");
  });
});
```

- [ ] **Step 2: FAIL** — Run: `bun.exe x vitest run tests/unit/components/doctor-proposal.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implementasi helper + kabel ke review-client (chip + blok sitasi, tanpa ubah alur).**
- [ ] **Step 4: PASS + `tsc` + detector** — rerun test; `bun.exe x tsc --noEmit`; `powershell.exe -NoProfile -Command "node .opencode/skills/impeccable/scripts/detect.mjs --json 'src/app/(app)/jurnal/ai/[id]/review-client.tsx'"` — Expected: hijau; detector tanpa temuan baru di luar advisory badge 10/11px.
- [ ] **Step 5: Commit** — `git add "src/app/(app)/jurnal/ai/[id]/proposal-labels.ts" "src/app/(app)/jurnal/ai/[id]/review-client.tsx" tests/unit/components/doctor-proposal.test.ts && git commit -m "feat(review): proposed-account chip and verified citations"`

---

### Task 10: Eval kualitas + full gate

**Files:**
- Create: `tests/eval/correction-quality.test.ts` (pola `tests/eval/draft-accuracy.test.ts` — baca dulu)

**Interfaces:**
- Consumes: semua task di atas.
- Produces: eval 5 kasus (satu per tipe temuan bermakna + 1 tanpa-chunk): asersi deterministik — D=K, nominal == evidence (±Rp1), semua kode terpetakan/terusulkan, sitasi lolos `validateCitations`, tanpa-chunk → `{ ok:false }` bukan draf. AI_MOCK agar deterministik.

- [ ] **Step 1: Tulis eval test** (mock narrator + fake chunks; tanpa API key).
- [ ] **Step 2: FAIL** — Run: `bun.exe x vitest run tests/eval/correction-quality.test.ts` — Expected: FAIL (lapisan belum tersambung penuh atau asersi belum lolos).
- [ ] **Step 3: Perbaiki apa pun yang gagal di lapisan yang benar** (jangan poles test agar lolos — perbaiki implementasi).
- [ ] **Step 4: FULL GATE** — Run berurutan, semua harus hijau:
  1. `bun.exe x tsc --noEmit`
  2. `bun.exe x vitest run` (full suite)
  3. `bun.exe run build`
  Expected: tsc 0 error; vitest 0 failed; build sukses dengan rute `/temuan/[id]`, `/jurnal/ai/[id]` terdaftar.
- [ ] **Step 5: Commit** — `git add tests/eval/correction-quality.test.ts && git commit -m "test(doctor): correction quality eval"`
