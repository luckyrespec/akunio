# Plan D — Laporan SAK EMKM + Tutup Buku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Angka laporan benar (kontra, POSTED-only, kumulatif vs periode), arus kas berkategori tanpa plug, tutup tahun menutup semua akun temporer termasuk prive.

**Architecture:** Perbaikan read-time di `core/reports` + filter query di `server/reports`/`repos`; taksonomi 12 source tak berubah. Tutup tahun tetap satu-tahap (langsung ke Laba Ditahan, didokumentasikan).

**Tech Stack:** Next 16 / Drizzle 0.45 + pg 8 / Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-13-audit-remediation-design.md` (Section 4).

## Global Constraints

- `bunx tsc --noEmit` strict, tanpa `any`.
- Minor BigInt; larangan `parseFloat(x)*100`.
- Tx baca laporan wajib `withOrg` (warisan Plan A Task A9).
- PowerShell tanpa `&&`; `bunx vitest run <file>`; copy UI Bahasa Indonesia.

## File Structure

- Modify: `src/core/reports/aggregates.ts:42-47`.
- Modify: `src/server/db/repos/reconciliation.repo.ts:41-64,236-282`.
- Modify: `src/app/(app)/laporan/page.tsx:49-62`, `src/server/reports/drilldown.ts:82-145`, `src/app/(app)/dasbor/page.tsx:55-91`.
- Modify: `src/app/(app)/laporan/arus-kas/page.tsx:35-65`.
- Modify: `src/server/db/repos/periods-closing.repo.ts:16-232`, `src/core/periods/closing-journal.ts:15-80`, `src/server/actions/periods.actions.ts:65-109,229-278`, `tutup-buku-client.tsx`.
- Modify: `src/core/reports/sak-emkm.ts:106`, `src/app/(app)/buku-pembantu/laba-rugi/[id]/page.tsx:33-41`, `src/server/db/repos/accounts.repo.ts` (fallback bucket), `src/server/db/repos/ledger.repo.ts:38-84`, `src/server/reports/build.ts:8-34`.
- Modify: `src/server/doctor/scan.ts` (flag residu arus kas + cek kontrol↔pembantu).
- Create: `tests/integration/reports-sak.test.ts`.

---

### Task D1: Contra di signed()

**Files:**
- Modify: `src/core/reports/aggregates.ts:42-47`
- Test: `tests/integration/reports-sak.test.ts`

**Interfaces:**
- Consumes: `ReportAccountMeta.contra` (sudah ada, diisi `accounts.repo.ts:164`).
- Produces: `signed()` negasi bila `contra===true`.

- [ ] **Step 1: Tulis failing test**

```ts
it("retur, akumulasi, prive mengurangi (bukan menambah)", async () => {
  // seedOrgData; posting: jual 1jt (4110), retur 200rb (4120, normal D),
  // beli aset 5jt (1500) + susut 500rb (1590, normal K), prive 100rb (3300, normal D)
  const stm = await buildStatements(orgId, period);
  expect(revenueNet).toBe(800_000n);   // bukan 1_200_000n
  expect(totalAssets).toBe(4_500_000n); // bukan 5_500_000n
  expect(equityBeforeIncome).toBe(-100_000n);
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: FAIL (1_200_000n / 5_500_000n).

- [ ] **Step 3: Implementasi**

```ts
export function signed(meta, a) {
  const net = meta.normal === "D" ? a.debitMinor - a.creditMinor : a.creditMinor - a.debitMinor;
  return meta.contra ? -net : net;
}
```

- [ ] **Step 4: Run, verifikasi PASS (+ suite lama tak pecah)**

Run: `bunx vitest run tests/integration/reports-sak.test.ts tests/integration/ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/reports/aggregates.ts tests/integration/reports-sak.test.ts
git commit -m "fix(laporan): signed hormati akun kontra"
```

### Task D2: Rekonsiliasi POSTED-only

**Files:**
- Modify: `src/server/db/repos/reconciliation.repo.ts:41-64,236-282`
- Test: `tests/integration/reports-sak.test.ts`

**Interfaces:**
- Consumes: `toMinor` (Plan A).
- Produces: saldo buku + kandidat match hanya `status='POSTED'`.

- [ ] **Step 1: Tulis failing test**

```ts
it("draf kas diabaikan rekonsiliasi", async () => {
  await postCash({ amountMinor: 100_000n });            // POSTED
  await draftCash({ amountMinor: 999_000n });            // DRAFT
  const rec = await createReconciliation({ bankAccountId: kas, statementDate });
  expect(rec.ledgerBalanceMinor).toBe(100_000n);
  expect(await unmatchedLines(rec.id)).not.toContainDraft();
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: FAIL (1_099_000n).

- [ ] **Step 3: Implementasi**

Tambah `eq(journalEntries.status, "POSTED")` di kedua query (saldo + unmatched).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/reconciliation.repo.ts tests/integration/reports-sak.test.ts
git commit -m "fix(rekonsiliasi): POSTED-only"
```

### Task D3: Kartu index + drilldown neto + dasbor

**Files:**
- Modify: `src/app/(app)/laporan/page.tsx:49-62`
- Modify: `src/server/reports/drilldown.ts:89-145`
- Modify: `src/app/(app)/dasbor/page.tsx:55-91`
- Test: `tests/integration/reports-sak.test.ts`

**Interfaces:**
- Consumes: `postedLinesThrough`, `signed()` (Task D1).
- Produces: kartu index == halaman detail; drilldown == angka statement; kas dasbor = posisi hari ini POSTED.

- [ ] **Step 1: Tulis failing test (level repo + logika)**

```ts
it("neraca index kumulatif samakan halaman neraca", async () => {
  // posting tahun lalu 2jt ke kas, tahun berjalan 500rb
  expect(indexCards.totalAssets).toBe(2_500_000n); // bukan 500_000n
});
it("drilldown beban == total beban L/R", async () => {
  // akun beban dengan koreksi D dan K
  expect(drillTotal(accountId)).toBe(statementTotal(accountId));
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Index: neraca/ekuitas/kas dari `postedLinesThrough(endsOn)`; L/R tetap `Between` YTD. Drilldown: `net = signed(meta, agg)` (heuristik memo dipertahankan untuk label, bukan total). Dasbor: `Through(todayISO)` + aktivitas filter POSTED.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/laporan/page.tsx" src/server/reports/drilldown.ts "src/app/(app)/dasbor/page.tsx" tests/integration/reports-sak.test.ts
git commit -m "fix(laporan): kartu kumulatif, drilldown neto, dasbor today"
```

### Task D4: Arus kas berkategori

**Files:**
- Modify: `src/app/(app)/laporan/arus-kas/page.tsx:35-65`
- Modify: `src/server/doctor/scan.ts`
- Test: `tests/integration/reports-sak.test.ts`

**Interfaces:**
- Consumes: `movementByPrefix`, `cashFlowIndirect` existing.
- Produces: kategori utang-pendek/pajak/dimuka eksplisit; residu hanya unmapped + temuan Doctor bila material (>1% delta kas).

- [ ] **Step 1: Tulis failing test**

```ts
it("arus kas tanpa plug pada fixture lengkap", async () => {
  // operasi + investasi + bayar utang pendek + bayar pajak + amortisasi dimuka
  const cf = await buildCashFlow(orgId, period);
  expect(cf.residualMinor).toBe(0n);
  expect(cf.pajakMinor).toBe(-pajakDibayar);
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: FAIL (residual ≠ 0).

- [ ] **Step 3: Implementasi**

Tambah pemetaan prefix untuk `21xx` pendek, `23xx`/`57xx` pajak, `16xx` dimuka (koordinasi dengan rentang `sak-emkm.ts:60-97,161-191`; jangan duplikasi logika — ekstrak helper `cashFlowBuckets` bila perlu, dipakai page + test). Residu dipertahankan sebagai baris "Mutasi kas lainnya (unmapped)" + `enqueueDoctorScan` bila material.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/reports-sak.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/laporan/arus-kas/page.tsx" src/server/doctor/scan.ts tests/integration/reports-sak.test.ts
git commit -m "fix(arus-kas): kategori lengkap, residu unmapped saja"
```

### Task D5: Tutup tahun overhaul

**Files:**
- Modify: `src/server/db/repos/periods-closing.repo.ts:16-232`
- Modify: `src/core/periods/closing-journal.ts:15-80`
- Modify: `src/server/actions/periods.actions.ts:65-109,229-278`, `tutup-buku-client.tsx`
- Test: `tests/integration/closing.test.ts` (baru)

**Interfaces:**
- Consumes: `postJournalEntry` idempoten, `evaluatePeriodReadiness`.
- Produces: temp nol semua (termasuk abnormal + prive), agregat per-periode, guard server, reopen terkunci.

- [ ] **Step 1: Tulis failing tests**

```ts
it("tutup menolkan beban bersaldo abnormal + prive", async () => {
  // beban 6200 bersaldo kredit 50rb (abnormal), prive 3300 debit 100rb
  await closeYear(orgId, year);
  expect(tempBalance("6200")).toBe(0n);
  expect(tempBalance("3300")).toBe(0n);
  expect(retainedDelta()).toBe(netIncome - privePaid);
});
it("closePeriod tanpa isReady ditolak server", async () => {
  await expect(executePeriodCloseAction({ periodId: unready })).rejects.toThrow("BELUM_SIAP");
});
it("reopen Desember terkunci sampai closing direversal", async () => {
  await closeYear(orgId, year);
  await expect(reopenPeriodAction(decPeriod)).rejects.toThrow("TUTUP_BUKU_BELUM_REVERSAL");
  await reverse(closingEntryId);
  await reopenPeriodAction(decPeriod); // lolos
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/closing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`closing-journal.ts`: hapus filter `>0n` (tutup saldo bertanda), sertakan `33xx`, hapus param `incomeSummaryAccountId` (update semua pemanggil). `closePeriod`: agregat via tabel `fiscal_periods` tahun itu (bukan `LIKE`), verifikasi `evaluatePeriodReadiness(...).isReady` atau throw `BELUM_SIAP` (+ daftar item), guard `fiscalYearStartMonth!==1` → `FISKAL_NON_KALENDER_BELUM_DIDUKUNG`. `reopenPeriodAction`: bila periode Desember punya closing JE aktif → tolak. UI: catatan "L/R Desember ≈ nol pasca tutup — lihat Laba Ditahan".

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/closing.test.ts tests/integration/reports-sak.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/periods-closing.repo.ts src/core/periods/closing-journal.ts src/server/actions/periods.actions.ts tests/integration/closing.test.ts
git commit -m "fix(tutup-buku): saldo bertanda, guard server, reopen terkunci"
```

### Task D6: Rapian laporan + gate Plan D

**Files:**
- Modify: `src/core/reports/sak-emkm.ts:106`, `src/app/(app)/buku-pembantu/laba-rugi/[id]/page.tsx:33-41`, repo akun (fallback bucket), `src/server/db/repos/ledger.repo.ts:38-84`, `src/server/reports/build.ts`, `src/server/actions/periods.actions.ts:178-183`

- [ ] **Step 1: Implementasi rapian**

Label tunggal `Periode Berjalan`. Catch kartu dipersempit (404 hanya bila akun tak ada). Fallback bucket untuk kode non-numerik (jangan `!`). Filter `from` di SQL + `openingMinor` tetap. Filter `org_id` dua sisi (`entries` + `lines`); `deletePeriodAction` wajib `orgId`.

- [ ] **Step 2: Gate Plan D**

Run: `bunx tsc --noEmit; if ($?) { bunx vitest run tests/integration/reports-sak.test.ts tests/integration/closing.test.ts tests/integration/ledger.test.ts tests/integration/ledger-range.test.ts tests/integration/posting-foundation.test.ts }`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/reports/sak-emkm.ts "src/app/(app)/buku-pembantu" src/server/db/repos/ledger.repo.ts src/server/reports/build.ts src/server/actions/periods.actions.ts
git commit -m "fix(laporan): rapian label, filter, org-check + gate D hijau"
```
