# Plan A — Fondasi DB & Primitif Posting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunci invariansi akuntansi di lapisan terbawah (CHECK tunggal, penomoran anti-race, validasi draf penuh, idempotency, uang eksak, RLS).

**Architecture:** Perbaikan bottom-up tanpa mengubah API repo yang sudah benar (`postJournalEntry`, advisory-lock POS/kas dipertahankan). Skema baru hanya 2 tabel counter + 1 FK; sisanya raw SQL terurut dan kode repo.

**Tech Stack:** Next 16 / Drizzle 0.45 + pg 8 / Vitest 4 / PowerShell 5.1 (tanpa `&&`).

**Spec:** `docs/superpowers/specs/2026-09-13-audit-remediation-design.md` (Section 1).

## Global Constraints

- `bunx tsc --noEmit` strict, tanpa `any`.
- `Money.parseIdr` hanya untuk rupiah utuh, tepat sekali di server; minor lintas batas sebagai string digit-only (`/^\d+$/`); larangan `parseFloat(x)*100`.
- Dilarang hardcode `4100`/`5100` sebagai target posting; pakai resolver + predikat postable (`!archived`, childless).
- Setiap `db.transaction` tenant-scope baru wajib `withOrg` (`src/server/db/repos/with-org.ts`).
- Tabel baru wajib masuk TRUNCATE di `tests/integration/helpers.ts`.
- Migrasi Drizzle ditulis tangan (`IF NOT EXISTS`, pemisah `--> statement-breakpoint`, entri `meta/_journal.json`, tanpa snapshot; `drizzle-kit generate` dilarang).
- Raw `src/server/db/*.sql` di-apply terurut via `bun run db:sql`; `bun.exe` auto-load `.env` (target DB lain pakai temp config).
- Satu file vitest: `bunx vitest run <file>` (fileParallelism:false, setup rewrite ke `ledger_test`).

---

## File Structure

- Modify: `src/server/db/tax.sql` (kanonis CHECK + komentar kepemilikan).
- Modify: `src/server/db/hardening.sql` (hapus CHECK duplikat).
- Create: `drizzle/0021_seq_counters.sql` + entri `drizzle/meta/_journal.json` (tabel `invoice_seq_counters`, `ast_seq_counters`).
- Create: `drizzle/0022_reversal_fk.sql` + entri journal (FK `journal_entries.reversal_of_id` → `journal_entries.id`).
- Modify: `src/server/db/schema/invoicing.ts`, `src/server/db/schema/assets.ts` (definisi tabel counter; relasi reversal opsional).
- Modify: `src/server/db/triggers.sql` (`guard_journal_lines` cek `OLD.entry_id`).
- Modify: `src/server/db/repos/invoices.repo.ts` (`getNextInvoiceNumberRepo` dalam tx + lock).
- Modify: `src/server/db/repos/assets.repo.ts` (numbering AST via counter+lock, reset tahunan).
- Modify: `src/server/db/repos/prepaid.repo.ts` (lock penomoran DM).
- Modify: `src/server/db/repos/journals.repo.ts` (helper `nextJournalNumber`; `postDraftEntry` validasi penuh + `ORDER BY position`; pemetaan unique-violation → return-existing; `makeReversal` warisi source + mirror links).
- Modify: `src/core/journals/validate.ts` (batas atas `numeric(18,2)`; perbaiki typo `SUBLEDGER_KIND_TIDAK_COCok`).
- Modify: `src/server/actions/cash-bank.actions.ts`, `invoice.actions.ts`, `assets.actions.ts`, komponen form terkait (generate `idempotencyKey` per submit).
- Modify: `src/server/actions/journal.actions.ts` (`reverseEntryAction` cek reversal existing; error modul jadi `PostingError`).
- Modify: `src/server/db/repos/reconciliation.repo.ts`, `src/server/db/repos/periods-closing.repo.ts`, `src/components/invoicing/record-payment-dialog.tsx`, `src/app/(app)/faktur/baru/faktur-baru-client.tsx`, `src/components/journal/nara-hitl-approval-card.tsx` (unifikasi Money).
- Modify: `src/server/actions/invoice.actions.ts`, `src/server/actions/assets.actions.ts`, halaman `laporan/*`, `dasbor/page.tsx` (sweep `withOrg`).
- Modify: `tests/integration/helpers.ts` (TRUNCATE + helper `getPool` tetap).
- Create: `tests/integration/posting-foundation.test.ts` (semua regression test Section 1).
- Docs: prosedur peran `app_user` non-bypass di `docs/` (file: `docs/runbook-app-user.md`).

---

### Task A1: CHECK tunggal di tax.sql

**Files:**
- Modify: `src/server/db/tax.sql:28-30`
- Modify: `src/server/db/hardening.sql:9-11`
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces: `je_source_chk` kanonis berisi 12 source (`MANUAL,AI,DOCUMENT,IMPORT,STOCK_OPNAME,TAX,KAS_BAYAR,KAS_TERIMA,KAS_TRANSFER,DIMUKA,POS,POS_SELISIH`).

- [ ] **Step 1: Hapus CHECK duplikat, tambah komentar kepemilikan**

Hapus blok `CONSTRAINT je_source_chk` di `hardening.sql`, tambah di atasnya:
```sql
-- je_source_chk dimiliki tax.sql (penulis alfabetis terakhir menang). Jangan definisikan ulang di sini.
```
Tambah di atas CHECK di `tax.sql`:
```sql
-- KANONIS: satu-satunya definisi je_source_chk. Source baru ditambah di sini + src/server/db/schema/journal.ts + src/core/journals/types.ts.
```

- [ ] **Step 2: Tulis failing test definisi CHECK**

```ts
import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("check tunggal je_source", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  it("definisi kanonis memuat 12 source", async () => {
    const r = await admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='je_source_chk'`);
    expect(r.rows).toHaveLength(1);
    for (const s of ["KAS_TERIMA", "KAS_BAYAR", "KAS_TRANSFER", "POS_SELISIH", "DIMUKA", "TAX"]) {
      expect(r.rows[0].def).toContain(s);
    }
    await admin.end();
    await truncateAll();
  });
});
```

- [ ] **Step 3: Run test, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: FAIL (2 definisi `je_source_chk` → `toHaveLength(1)` gagal).

- [ ] **Step 4: Apply perubahan SQL**

Run: `bun run db:sql`
Expected: sukses tanpa error.

- [ ] **Step 5: Run test, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/tax.sql src/server/db/hardening.sql tests/integration/posting-foundation.test.ts
git commit -m "fix(db): je_source_chk single-source di tax.sql"
```

### Task A2: Migrasi 0021 tabel counter

**Files:**
- Create: `drizzle/0021_seq_counters.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/server/db/schema/invoicing.ts`, `src/server/db/schema/assets.ts`
- Modify: `tests/integration/helpers.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces: tabel `invoice_seq_counters(org_id, year, type, last_seq)`, `ast_seq_counters(org_id, year, last_seq)` + definisi Drizzle `invoiceSeqCounters`, `astSeqCounters`.

- [ ] **Step 1: Tulis migrasi tangan**

```sql
CREATE TABLE IF NOT EXISTS "invoice_seq_counters" (
  "org_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "type" text NOT NULL CHECK ("type" IN ('INVOICE','BILL')),
  "last_seq" integer NOT NULL DEFAULT 0,
  CONSTRAINT "invoice_seq_counters_pk" PRIMARY KEY ("org_id","year","type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ast_seq_counters" (
  "org_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "last_seq" integer NOT NULL DEFAULT 0,
  CONSTRAINT "ast_seq_counters_pk" PRIMARY KEY ("org_id","year")
);
```

Tambah entri ke `drizzle/meta/_journal.json` mengikuti format entri `0020` (idx+1, version, when now, tag `0021_seq_counters`, snapshot kosong seperti preseden `0012`/`0013`). Tambah definisi `pgTable` setara di `schema/invoicing.ts` dan `schema/assets.ts`.

- [ ] **Step 2: Tambah ke TRUNCATE helpers**

Di `tests/integration/helpers.ts:29`, tambah `invoice_seq_counters, ast_seq_counters` ke daftar TRUNCATE.

- [ ] **Step 3: Terapkan ke TEST DB dan verifikasi tabel ada**

Run: `bun run test:db:setup`
Lalu probe dengan `node.exe` (hindari autoload `.env` oleh bun):
```bash
node.exe -e "const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.TEST_DATABASE_URL});const r=await p.query(\"SELECT tablename FROM pg_tables WHERE tablename IN ('invoice_seq_counters','ast_seq_counters')\");console.log(r.rows);await p.end();})()"
```
Expected: 2 baris.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0021_seq_counters.sql drizzle/meta/_journal.json src/server/db/schema/invoicing.ts src/server/db/schema/assets.ts tests/integration/helpers.ts
git commit -m "feat(db): 0021 counter penomoran faktur dan aset"
```

### Task A3: Numbering faktur + AST + DM anti-race

**Files:**
- Modify: `src/server/db/repos/invoices.repo.ts:42-90`
- Modify: `src/server/db/repos/assets.repo.ts:34-51`
- Modify: `src/server/db/repos/prepaid.repo.ts:46-58`
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: `invoiceSeqCounters`, `astSeqCounters` (Task A2).
- Produces: `getNextInvoiceNumberRepo(q, orgId, type, year)` wajib dalam transaksi + lock; `nextAssetCode(q, orgId, year)` reset tahunan; penomoran DM dalam lock.

- [ ] **Step 1: Tulis failing test penomoran**

```ts
it("nomor faktur naik berurutan dalam satu tahun", async () => {
  const { orgId } = await makeOrg("Nomor Co");
  const a = await db.transaction((tx) => getNextInvoiceNumberRepo(tx as never, orgId, "INVOICE", 2026));
  await db.transaction((tx) => createInvoiceRepo(tx as never, orgId, { invoiceNumber: a } as never));
  const b = await db.transaction((tx) => getNextInvoiceNumberRepo(tx as never, orgId, "INVOICE", 2026));
  expect(a).toBe("INV-2026-0001");
  expect(b).toBe("INV-2026-0002");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: FAIL (counter belum dipakai).

- [ ] **Step 3: Implementasi minimal**

`getNextInvoiceNumberRepo`: `SELECT pg_advisory_xact_lock(hashtext(...))`, upsert counter (`INSERT ... ON CONFLICT (org_id,year,type) DO UPDATE SET last_seq = ... RETURNING`), format `INV-YYYY-NNNN`/`BILL-YYYY-NNNN`. Pindah pemanggilan di `invoices.repo.ts:88-90` ke dalam transaksi. AST: pola sama per tahun akuisisi (`AST-YYYY-NNNN` reset tiap tahun). DM: bungkus existing dengan lock yang sama.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/invoices.repo.ts src/server/db/repos/assets.repo.ts src/server/db/repos/prepaid.repo.ts tests/integration/posting-foundation.test.ts
git commit -m "fix(posting): penomoran faktur/AST/DM anti-race"
```

### Task A4: Trigger loophole + FK reversal

**Files:**
- Modify: `src/server/db/triggers.sql:16-33`
- Modify: `src/server/db/schema/journal.ts:26`
- Create: `drizzle/0022_reversal_fk.sql` + entri journal
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces: `guard_journal_lines` menolak mutasi baris POSTED via `OLD` maupun `NEW`; FK `je_reversal_of_fk`.

- [ ] **Step 1: Tulis failing test**

```ts
it("pindah baris POSTED ke draf ditolak trigger", async () => {
  // buat + posting 2 jurnal seimbang via postJournalEntry, ambil lineId jurnal pertama
  await expect(admin.query(
    `UPDATE journal_lines SET entry_id=$2 WHERE id=$1`, [postedLineId, draftEntryId],
  )).rejects.toThrow();
});
it("reversal_of_id tanpa target ditolak FK", async () => {
  await expect(postRandomReversalWithBogusTarget()).rejects.toThrow();
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: FAIL (UPDATE lolos).

- [ ] **Step 3: Implementasi**

`triggers.sql`: guard bandingkan `OLD.entry_id` (status entri asal) selain `NEW.entry_id`; `bun run db:sql`. FK: `ALTER TABLE journal_entries ADD CONSTRAINT je_reversal_of_fk FOREIGN KEY (reversal_of_id) REFERENCES journal_entries(id)` via `0022` + definisi schema.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/triggers.sql src/server/db/schema/journal.ts drizzle/0022_reversal_fk.sql drizzle/meta/_journal.json tests/integration/posting-foundation.test.ts
git commit -m "fix(db): tutup loophole trigger + FK reversal"
```

### Task A5: postDraftEntry validasi penuh + helper nomor

**Files:**
- Modify: `src/server/db/repos/journals.repo.ts:74-86,394-411,475-492,522-562`
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: `validateEntry`, `checkPostingAccounts` (existing).
- Produces: `nextJournalNumber(q, orgId, period)` dipakai `postJournalEntry` + `createDraftJournalEntry`.

- [ ] **Step 1: Tulis failing tests**

```ts
it("draf tak-seimbang ditolak saat posting", async () => {
  const draft = await createDraftWithUnbalancedLines();
  await expect(db.transaction((tx) => postDraftEntry(tx as never, orgId, "a@b.c", draft.id)))
    .rejects.toThrow("UNBALANCED");
});
it("draf akun grup/arsip ditolak saat posting", async () => {
  await expect(postDraftWithGroupAccount()).rejects.toThrow("GROUP_ACCOUNT");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: FAIL (lolos tanpa error).

- [ ] **Step 3: Implementasi**

Ekstrak `nextJournalNumber(q, orgId, period)` dari `:394-411`, pakai di kedua jalur. `postDraftEntry`: panggil `validateEntry` + `checkPostingAccounts` dengan baris draf (order `ORDER BY position`), sebelum `assertSubledgerControl`. Perbaiki typo `SUBLEDGER_KIND_TIDAK_COCok` → `SUBLEDGER_KIND_TIDAK_COCOK` di `src/core/subledger/guard.ts:22` + semua import-nya (`journals.repo.ts:52`); verifikasi tanpa sisa via grep `COCok`.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/journals.repo.ts tests/integration/posting-foundation.test.ts
git commit -m "fix(posting): postDraftEntry validasi penuh + helper nomor"
```

### Task A6: Idempotency ujung-ke-ujung

**Files:**
- Modify: `src/server/db/repos/journals.repo.ts:364-370,437-439`
- Modify: `src/server/actions/cash-bank.actions.ts:51-67`, `src/server/actions/invoice.actions.ts`, `src/server/actions/assets.actions.ts`, form terkait
- Modify: `src/server/actions/journal.actions.ts:83-114`
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: `nextJournalNumber` (Task A5).
- Produces: kontrak "key sama → record sama, tanpa error mentah".

- [ ] **Step 1: Tulis failing tests**

```ts
it("double postJournalEntry key sama kembali existing", async () => {
  const p1 = await postWithKey("k-1");
  const p2 = await postWithKey("k-1");
  expect(p2.id).toBe(p1.id);
});
it("reverse ganda kembali reversal yang sama", async () => {
  const r1 = await reverse(postedId);
  const r2 = await reverse(postedId);
  expect(r2.id).toBe(r1.id);
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: FAIL (unique violation mentah / reversal kedua error).

- [ ] **Step 3: Implementasi**

Bungkus insert jurnal: tangkap pelanggaran `je_org_idem_uq` → SELECT existing dan return. `reverseEntryAction`: SELECT reversal existing by `reversal_of_id` dulu. Semua action tulis generate `randomUUID()` per submit di client (`crypto.randomUUID()` ke hidden field, preceden `kasir-shell.tsx:139`).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/journals.repo.ts src/server/actions/ tests/integration/posting-foundation.test.ts
git commit -m "fix(posting): idempotency ujung-ke-ujung + reverse idempoten"
```

### Task A7: Reversal warisi source + mirror links

**Files:**
- Modify: `src/core/journals/validate.ts:84-97`
- Modify: `src/server/db/repos/journals.repo.ts:277-284,342-353,382-389`
- Modify: `src/server/actions/journal.actions.ts:28-38,83-114`
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: kontrak idempotency (Task A6).
- Produces: `makeReversal(original)` → `{ source: original.source, lines terbalik, links mirror }`.

- [ ] **Step 1: Tulis failing test**

```ts
it("reversal faktur DOCUMENT lolos guard kontrol", async () => {
  const inv = await postInvoiceWithStock(); // Dr 1200+link / Cr pendapatan / Dr HPP / Cr persediaan+link
  const rev = await reverseEntry(inv.journalEntryId);
  expect(rev.status).toBe("POSTED");
  expect(rev.source).toBe("DOCUMENT");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: FAIL (`AKUN_KONTROL_WAJIB_VIA_MODUL`).

- [ ] **Step 3: Implementasi**

`makeReversal` terima `source` + `links` dari entri asal; mirror tiap link ke baris pasangan (refId dan amountMinor sama). Error guard modul selalu `PostingError` (bukan `Error`).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/journals/validate.ts src/server/db/repos/journals.repo.ts src/server/actions/journal.actions.ts tests/integration/posting-foundation.test.ts
git commit -m "fix(posting): reversal warisi source + mirror links"
```

### Task A8: Unifikasi Money + batas atas

**Files:**
- Modify: `src/server/db/repos/reconciliation.repo.ts:59-60,279-280`
- Modify: `src/server/db/repos/periods-closing.repo.ts:97-98,183-190`
- Modify: `src/components/invoicing/record-payment-dialog.tsx:54,73,88`
- Modify: `src/app/(app)/faktur/baru/faktur-baru-client.tsx:89-91`
- Modify: `src/components/journal/nara-hitl-approval-card.tsx:313,321`
- Modify: `src/core/journals/validate.ts:20-47`
- Test: `tests/unit/money-unified.test.ts`, tambah kasus di `posting-foundation.test.ts`

**Interfaces:**
- Consumes: `toMinor`, `Money.parseIdr/formatIdr`, `Money.fromMinor`.
- Produces: nol kemunculan `parseFloat(` pada jalur nominal; `validateEntry` menolak `MELEBIHI_BATAS`.

- [ ] **Step 1: Tulis failing tests**

```ts
it("rekonsiliasi eksak pada nominal sen", async () => {
  // posting garis 10.000,55 dan 0,05 ke akun bank; ledgerBalance == 10.000,60 persis
  expect(balance).toBe(1_000_060n);
});
it("nominal melebihi numeric(18,2) ditolak validate", async () => {
  await expect(postHuge()).rejects.toThrow("MELEBIHI_BATAS");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts tests/unit/money-unified.test.ts`
Expected: FAIL (drift 1 sen / PG overflow mentah).

- [ ] **Step 3: Implementasi**

Ganti semua `BigInt(Math.round(parseFloat(x)*100))` → `toMinor`; prefill sisa dialog pakai minor eksak (`remainingMinor` tanpa `Number()/100`); HITL card → `Money.fromMinor(total).formatIdr()`; `validateEntry` tolak `abs > 99_999_999_999_999_99n` minor... tepatnya `9_999_999_999_999_999_99n` (= 9.999.999.999.999.999,99).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts tests/unit/money-unified.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/reconciliation.repo.ts src/server/db/repos/periods-closing.repo.ts src/components/invoicing/record-payment-dialog.tsx "src/app/(app)/faktur/baru/faktur-baru-client.tsx" src/components/journal/nara-hitl-approval-card.tsx src/core/journals/validate.ts tests/unit/money-unified.test.ts tests/integration/posting-foundation.test.ts
git commit -m "fix(money): unifikasi toMinor + batas atas nominal"
```

### Task A9: Sweep withOrg + runbook app_user

**Files:**
- Modify: `src/server/actions/invoice.actions.ts:29,44,50,70,91,95`
- Modify: `src/server/actions/assets.actions.ts:62,127,209,252`
- Modify: halaman `laporan/*`, `dasbor/page.tsx` (ganti `db.transaction` → `withOrg`)
- Create: `docs/runbook-app-user.md`
- Test: `tests/integration/posting-foundation.test.ts`

**Interfaces:**
- Consumes: `withOrg` existing.
- Produces: semua jalur tulis/baca tenant lewat `withOrg`; runbook pembuatan peran.

- [ ] **Step 1: Tulis failing test konteks org**

```ts
it("withOrg menetapkan app.current_org dalam tx", async () => {
  const { orgId } = await makeOrg("Ctx Co");
  const seen = await withOrg(db as never, orgId, async (tx) => {
    const r = await (tx as never).execute(`SELECT current_setting('app.current_org') AS v`);
    return r.rows[0].v as string;
  });
  expect(seen).toBe(orgId);
});
```

- [ ] **Step 2: Run, verifikasi PASS awal (kontrak helper), lalu sweep**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts`
Expected: PASS (helper sudah benar; task ini mengunci + menyapu pemanggil).

- [ ] **Step 3: Implementasi sweep + runbook**

Ganti `db.transaction` → `withOrg(db, ctx.orgId, ...)` di file di atas. Tulis `docs/runbook-app-user.md`: buat role via Neon Console (password kuat — control plane menolak `app_pw`), `GRANT CONNECT/USAGE/SELECT,INSERT,UPDATE,DELETE` per skema RLS (tanpa BYPASSRLS), isi `TEST_APP_DATABASE_URL`.

- [ ] **Step 4: Verifikasi tsc + suite fondasi**

Run: `bunx tsc --noEmit; if ($?) { bunx vitest run tests/integration/posting-foundation.test.ts }`
Expected: keduanya PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/invoice.actions.ts src/server/actions/assets.actions.ts "src/app/(app)" tests/integration/posting-foundation.test.ts docs/runbook-app-user.md
git commit -m "fix(rls): withOrg di semua jalur + runbook app_user"
```

### Task A10: Gate Plan A

- [ ] **Step 1: tsc**

Run: `bunx tsc --noEmit`
Expected: PASS (tanpa error).

- [ ] **Step 2: build**

Run: `bun run build`
Expected: PASS (must stay green).

- [ ] **Step 3: suite terkait**

Run: `bunx vitest run tests/integration/posting-foundation.test.ts tests/integration/ledger.test.ts tests/integration/pos-lite.test.ts`
Expected: PASS (kecuali 9 baseline yang ditangani Plan E).
