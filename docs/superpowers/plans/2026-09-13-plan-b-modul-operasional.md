# Plan B — Modul Operasional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setiap aksi operasional (kas, faktur, POS/shift, pajak, AI) posting tepat satu jurnal valid, anti-klik-ganda, dengan guard akun kontrol.

**Architecture:** Menumpang kontrak Plan A (counter, idempotency, `withOrg`, Money). Perubahan per-modul independen; pola acuan tunggal adalah checkout POS (satu JE + baris log + lock + key).

**Tech Stack:** Next 16 / Drizzle 0.45 + pg 8 / Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-13-audit-remediation-design.md` (Section 2).

## Global Constraints

- `bunx tsc --noEmit` strict, tanpa `any`.
- `Money.parseIdr` rupiah utuh sekali di server; minor digit-only; larangan `parseFloat(x)*100`.
- Dilarang hardcode `4100`/`5100`; resolver + postable.
- Tx tenant baru wajib `withOrg`; tabel baru → TRUNCATE `tests/integration/helpers.ts`.
- PowerShell tanpa `&&`; `bunx vitest run <file>` per file.

## File Structure

- Modify: `src/server/db/repos/cash-bank.repo.ts`, `src/server/actions/cash-bank.actions.ts`, form kas-bank.
- Modify: `src/server/db/repos/invoices.repo.ts:206-255`, `src/server/invoicing/posting.ts:629-724`, `src/components/invoicing/record-payment-dialog.tsx`, `src/server/invoicing/tools.ts:205-263`.
- Modify: `src/server/actions/invoice.actions.ts` (kembalikan revalidate jasa).
- Modify: `src/server/db/repos/pos.repo.ts:92-102,244-294,407-479`, `src/server/actions/pos.actions.ts`, `src/app/(app)/kasir/_components/kasir-shell.tsx`.
- Modify: `src/server/ai/journal-chat.ts`, `src/app/(app)/jurnal/ai/journal-chat-client.tsx`, `src/server/ai/models.ts` + 4 pemanggil, `src/server/ai/prompt.ts:32`, `src/core/ai/map-accounts.ts:31-32`, `src/app/(app)/jurnal/ai/[id]/review-client.tsx`.
- Create: `tests/integration/modul-operasional.test.ts`.

---

### Task B1: Idempotency kas-bank + unifikasi pesan

**Files:**
- Modify: `src/server/actions/cash-bank.actions.ts:51-67`, form kas-bank (`cash-entry-form.tsx`)
- Test: `tests/integration/modul-operasional.test.ts`

**Interfaces:**
- Consumes: kontrak return-existing Plan A (Task A6).
- Produces: double-submit kas-bank → 1 jurnal + 1 baris kas.

- [ ] **Step 1: Tulis failing test**

```ts
it("double-submit kas TERIMA satu jurnal satu baris", async () => {
  const key = "kas-t1";
  const r1 = await createCashEntryWithKey(orgId, { kind: "TERIMA", amountMinor: 75_000n, idempotencyKey: key });
  const r2 = await createCashEntryWithKey(orgId, { kind: "TERIMA", amountMinor: 75_000n, idempotencyKey: key });
  expect(r2.journalEntryId).toBe(r1.journalEntryId);
  const n = await admin.query(`SELECT count(*)::int n FROM kas_bank_entries WHERE org_id=$1`, [orgId]);
  expect(n.rows[0].n).toBe(1);
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: FAIL (2 baris).

- [ ] **Step 3: Implementasi**

Form kirim `idempotencyKey: crypto.randomUUID()` per submit (bukan per klik-ulang: kunci dibuat saat dialog dibuka); action teruskan ke `createCashEntryRepo` → `postJournalEntry`.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/cash-bank.actions.ts src/components/kas-bank/cash-entry-form.tsx tests/integration/modul-operasional.test.ts
git commit -m "fix(kas-bank): idempotency per submit"
```

### Task B2: Guard pelunasan + baris log kas

**Files:**
- Modify: `src/server/db/repos/invoices.repo.ts:206-255`
- Modify: `src/server/invoicing/posting.ts:629-724`
- Modify: `src/components/invoicing/record-payment-dialog.tsx`
- Test: `tests/integration/modul-operasional.test.ts`

**Interfaces:**
- Consumes: kontrak return-existing (Plan A).
- Produces: `recordInvoicePaymentRepo` menolak `<=0`/tanpa akun kas/overpayment; tiap pelunasan terposting punya 1 baris `kas_bank_entries` ke JE yang sama.

- [ ] **Step 1: Tulis failing tests**

```ts
it("pelunasan nol dan overpayment ditolak", async () => {
  await expect(pay(invId, 0n)).rejects.toThrow();
  await expect(pay(invId, remaining + 1n)).rejects.toThrow("MELEBIHI_SISA");
});
it("pelunasan tampil di daftar kas", async () => {
  const p = await payAndPost(invId, 50_000n, kasId);
  const r = await admin.query(`SELECT journal_entry_id FROM kas_bank_entries WHERE org_id=$1`, [orgId]);
  expect(r.rows.map((x) => x.journal_entry_id)).toContain(p.journalEntryId);
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Validasi di repo (bukan hanya UI): `amountMinor>0`, `cashAccountId` wajib + `isCash/isBank`, `paidTotal + amount <= invoiceTotal` (toleransi 0). Setelah `postInvoicePaymentToLedger`, insert `kas_bank_entries{kind: TERIMA/BAYAR, status POSTED, journalEntryId, number: <nomor payment>, contactId}` langsung (tanpa `createCashEntryRepo` — preceden POS). Nomor payment: `PMB-YYYY-NNNN` via counter kas (`kas_bank_seq_counters`, kind baru `PAYMENT`, prefix di `kas-bank.ts:19-23`).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/invoices.repo.ts src/server/invoicing/posting.ts src/components/invoicing/record-payment-dialog.tsx src/core/kas-bank/kas-bank.ts tests/integration/modul-operasional.test.ts
git commit -m "fix(faktur): guard pelunasan + log kas"
```

### Task B3: AI payment ikut posting

**Files:**
- Modify: `src/server/invoicing/tools.ts:205-263`
- Test: `tests/integration/modul-operasional.test.ts`

**Interfaces:**
- Consumes: `postInvoicePaymentToLedger` existing.
- Produces: tool payment → `journalEntryId` terisi (tanpa aksi manual).

- [ ] **Step 1: Tulis failing test**

```ts
it("AI record_invoice_payment menghasilkan jurnal", async () => {
  const out = await executeNaraTool("record_invoice_payment", { invoiceId: invId, amountMinor: "50000", cashAccountId: kas });
  const row = await admin.query(`SELECT journal_entry_id FROM invoice_payments WHERE id=$1`, [out.paymentId]);
  expect(row.rows[0].journal_entry_id).not.toBeNull();
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: FAIL (null).

- [ ] **Step 3: Implementasi**

Panggil `postInvoicePaymentToLedger` setelah `recordInvoicePaymentRepo` (dalam `withOrg` yang sama); gagal posting → kembalikan `postWarning` (preceden faktur).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoicing/tools.ts tests/integration/modul-operasional.test.ts
git commit -m "fix(ai): record_invoice_payment ikut posting"
```

### Task B4: Faktur counter + revalidate jasa

**Files:**
- Modify: `src/server/db/repos/invoices.repo.ts:88-96`
- Modify: `src/server/actions/invoice.actions.ts`
- Test: `tests/integration/modul-operasional.test.ts`

**Interfaces:**
- Consumes: `invoice_seq_counters` (Plan A Task A2-A3).
- Produces: nomor faktur dari counter dalam tx; mutasi faktur me-refresh halaman jasa.

- [ ] **Step 1: Pindah counter ke dalam transaksi + kembalikan revalidate**

```ts
// invoices.repo.ts — di dalam db.transaction, ganti:
//   const number = await getNextInvoiceNumberRepo(db, orgId, type);
// menjadi:
const number = await getNextInvoiceNumberRepo(tx, orgId, type, new Date().getFullYear());
```
```ts
// invoice.actions.ts — tambah kembali di dua aksi tulis:
revalidatePath("/persediaan/jasa");
```

- [ ] **Step 2: Verifikasi via suite + tsc**

Run: `bunx tsc --noEmit; if ($?) { bunx vitest run tests/integration/modul-operasional.test.ts tests/integration/inventory-item-update.test.ts }`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/repos/invoices.repo.ts src/server/actions/invoice.actions.ts
git commit -m "fix(faktur): counter dalam tx + revalidate jasa"
```

### Task B5: Perbaikan POS/kasir

**Files:**
- Modify: `src/server/db/repos/pos.repo.ts:92-102,281-294,434-479`
- Modify: `src/server/actions/pos.actions.ts:285-298`
- Test: `tests/integration/pos-lite.test.ts`, `tests/integration/modul-operasional.test.ts`

**Interfaces:**
- Consumes: kontrak idempotency (Plan A).
- Produces: dupe kembalikan nomor asli; biaya per baris tepat; tutup konkuren satu draf; akun kontrol tak bisa dipilih; laci = tunai saja.

- [ ] **Step 1: Tulis failing tests**

```ts
it("dupe checkout kembalikan nomor jurnal asli", async () => {
  const f = await checkout(input("dup-pos"));
  const s = await checkout(input("dup-pos"));
  expect(s.journalNumber).toBe(f.journalNumber);
  expect(s.journalNumber).not.toBe("");
});
it("dua baris item sama atribusikan biaya per baris", async () => {
  // 2 baris item sama qty 1 + qty 3 → hppLinks per baris proporsional, total tetap
});
it("akun kontrol ditolak sebagai akun selisih", async () => {
  await expect(closeShiftWithVarianceAccount(piutangCtlId)).rejects.toThrow();
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts`
Expected: FAIL (`""`, atribusi baris kedua salah, kontrol lolos).

- [ ] **Step 3: Implementasi**

Jalur idempoten sale-level JOIN jurnal untuk `journalNumber`. `hppLinks` by-index (cocokkan urutan loop `197-215`, bukan `find` refId). `closeShift`: `pg_advisory_xact_lock(hashtext('shift:{shiftId}'))`. Picker: filter `!isCash && !isControl` (butuh flag kontrol di daftar akun — tambah dari `subledger_controls`/`postingMetaMap`). `getShiftSummary`: `expectedCashMinor = opening + tunaiMinor` (keluarkan `transferMinor`).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts tests/integration/pos-lite.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/pos.repo.ts src/server/actions/pos.actions.ts tests/integration/modul-operasional.test.ts
git commit -m "fix(pos): nomor dupe, biaya per baris, lock shift, filter kontrol"
```

### Task B6: AI journal-chat + prompt + resolver

**Files:**
- Modify: `src/server/ai/journal-chat.ts:112`, `src/server/actions/journal-ai.actions.ts:72-78`, `src/app/(app)/jurnal/ai/journal-chat-client.tsx:44`
- Modify: `src/server/ai/models.ts`, `adapter.ts:6`, `journal-chat.ts:6`, `nara.ts:30`, `advisor.ts:107`
- Modify: `src/server/ai/prompt.ts:32`, `src/core/ai/map-accounts.ts:31-32`, `src/app/(app)/jurnal/ai/[id]/review-client.tsx:263-274`
- Test: `tests/unit/ai-threading.test.ts`

**Interfaces:**
- Consumes: `getGeminiModel()` dari `models.ts`.
- Produces: threading tersimpan; jendela 12; contoh prompt leaf; GROUP ditandai dini.

- [ ] **Step 1: Tulis failing tests**

```ts
it("action teruskan previousInteractionId yang tersimpan", async () => {
  // simulasikan thread dengan id tersimpan → journalChat menerima id itu (spy argumen)
});
it("draft GROUP ditandai unresolved", () => {
  expect(resolveDraftAccounts([{ code: "4100" }], leafAccounts).unresolved).toContain("4100");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/unit/ai-threading.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Simpan/muat interaction id per thread (kolom `chat_threads.gemini_interaction_id` sudah ada — pakai, preceden `nara.ts`). Client `slice(-12)`. Helper model dipakai di 4 file. Prompt: ganti contoh ke kode leaf base (`4110`/`5900` — verifikasi leaf di `coa-template.ts`). Resolver cek `isPostableAccount`. `resetToAi` reset `rows` dari `initialRows` yang diperbarui.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/unit/ai-threading.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai src/server/actions/journal-ai.actions.ts "src/app/(app)/jurnal/ai" src/core/ai/map-accounts.ts tests/unit/ai-threading.test.ts
git commit -m "fix(ai): threading, jendela 12, prompt leaf, resolver postable"
```

### Task B7: Gate Plan B

- [ ] **Step 1: tsc**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: suite modul + regresi fondasi**

Run: `bunx vitest run tests/integration/modul-operasional.test.ts tests/integration/pos-lite.test.ts tests/integration/posting-foundation.test.ts`
Expected: PASS.
