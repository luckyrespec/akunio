# Plan C — Persediaan + Aset/Dimuka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Penilaian persediaan benar per metode (FIFO per-layer, average WAC), tanpa jalur tanpa-jurnal yang bocor; penyusutan/amortisasi/pelepasan aset terjurnal penuh dan anti-race.

**Architecture:** Logika valuasi tetap di `src/core/inventory/valuation.ts` (`consumeFifoLayers`, `calculateWeightedAverage`); opname memakai primitif yang sama dengan penjualan (bukan rumus sendiri). Aset menumpang kontrak Plan A (counter, lock, `withOrg`, source MANUAL).

**Tech Stack:** Next 16 / Drizzle 0.45 + pg 8 / Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-13-audit-remediation-design.md` (Section 3).

## Global Constraints

- `bunx tsc --noEmit` strict, tanpa `any`.
- Minor BigInt eksak; larangan `parseFloat(x)*100`.
- Tx tenant baru wajib `withOrg`; tabel baru → TRUNCATE helpers.
- PowerShell tanpa `&&`; `bunx vitest run <file>` per file; UI Bahasa Indonesia.

## File Structure

- Modify: `src/server/db/repos/inventory.repo.ts:499-520,718-811,819-935,1012-1089,1097-1141` (+ `listItemCostHistory:265`, `setItemActive:299-350`).
- Modify: `src/server/actions/inventory.actions.ts:46` (overview arsip).
- Modify: `src/app/(app)/persediaan/opname/[id]/opname-cost-cell.tsx:12`, `opname-journal-panel.tsx:128-138`.
- Modify: `src/server/db/repos/assets.repo.ts:34-51,195-321,323-433`, `src/server/actions/assets.actions.ts`, `src/core/assets/disposal.ts:47-54`, `src/server/ai/assets-closing.tools.ts:211-240,359-373`, `src/app/(app)/aset/disposal-dialog.tsx`, komponen `run-depreciation-dialog.tsx`.
- Create: `tests/integration/inventory-valuation.test.ts`, `tests/integration/asset-lifecycle.test.ts`.

---

### Task C1: Opname FIFO per-layer

**Files:**
- Modify: `src/server/db/repos/inventory.repo.ts:499-520,718-811,953-1002`
- Test: `tests/integration/inventory-valuation.test.ts`

**Interfaces:**
- Consumes: `consumeFifoLayers`, `calculateWeightedAverage` dari `core/inventory/valuation.ts`.
- Produces: `calculateStockDifference` menilai defisit via konsumsi layer (FIFO) / WAC (average); jurnal == nilai layer.

- [ ] **Step 1: Tulis failing test**

```ts
it("opname FIFO defisit ikuti layer tertua", async () => {
  // beli 10x1000 (layer1) lalu 10x3000 (layer2, average 2000); opname fisik 15
  // defisit 5 harus @1000 = 5000, bukan @2000 = 10000
  const draft = await generateAdjustmentJournalDraft(orgId, opnameId);
  expect(draft.totalMinor).toBe(5_000n);
  const layers = await remainingLayers(itemId);
  expect(layers[0].remainingQty).toBe(5); // layer1 sisa 5
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/inventory-valuation.test.ts`
Expected: FAIL (10_000n, layer salah).

- [ ] **Step 3: Implementasi**

`calculateStockDifference`: bila `valuationMethod==='FIFO'`, tiru loop `consumeFifoLayers` di atas snapshot (tanpa tulis) untuk nilai defisit; kurangi layer FIFO best-effort yang sudah ada (`:786-807`) dijadikan sumber kebenaran (tulis juga). Surplus: layer baru di `line.unitCost` (dipertahankan). Org average: jalur lama.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/inventory-valuation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/inventory.repo.ts tests/integration/inventory-valuation.test.ts
git commit -m "fix(persediaan): opname FIFO per-layer"
```

### Task C2: Jalur Rp0 wajib OPEN + lock

**Files:**
- Modify: `src/server/db/repos/inventory.repo.ts:896-935,1012-1088`
- Test: `tests/integration/inventory-opname-zerocost.test.ts`

**Interfaces:**
- Consumes: `findPeriodByDate`, `lockInventoryPolicy`.
- Produces: cabang Rp0 cek periode OPEN + lock; perilaku migrasi (COMPLETED tanpa jurnal + notes) dipertahankan.

- [ ] **Step 1: Tulis failing test**

```ts
it("opname Rp0 di periode CLOSED ditolak", async () => {
  await closePeriod(orgId, periodId);
  await expect(applyZeroCostOpname()).rejects.toThrow("PERIODE_TUTUP");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/inventory-opname-zerocost.test.ts`
Expected: FAIL (lolos).

- [ ] **Step 3: Implementasi**

Pindah cek `findPeriodByDate OPEN` + `lockInventoryPolicy` ke sebelum cabang `diffValue==0`.

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/inventory-opname-zerocost.test.ts tests/integration/inventory-valuation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/inventory.repo.ts tests/integration/inventory-opname-zerocost.test.ts
git commit -m "fix(persediaan): jalur Rp0 wajib periode OPEN + lock"
```

### Task C3: Stale-cost abort + arsip + cost-cell + S3 + riwayat

**Files:**
- Modify: `src/server/db/repos/inventory.repo.ts:507,738,819-862,1097-1141,265,322-324`
- Modify: `src/server/actions/inventory.actions.ts:46`, `opname-cost-cell.tsx:12`
- Test: `tests/integration/inventory-valuation.test.ts`, `tests/integration/inventory-archive.test.ts`, `tests/integration/inventory-opname-cancel.test.ts`

**Interfaces:**
- Consumes: guard `STOK_BERUBAH_SEJAK_OPNAME` existing.
- Produces: abort bila `averageCost` berubah; arsip syarat ganda; string kosong = pertahankan; cancel bersih S3; riwayat penuh.

- [ ] **Step 1: Tulis failing tests**

```ts
it("pembelian antara create-post abort opname basi", async () => {
  const op = await createStockOpname(itemId); // snapshot avg 2000
  await purchaseMore(itemId, 10, 5000); // avg berubah
  await expect(postOpnameAdjustment(op.id)).rejects.toThrow("STOK_BERUBAH");
});
it("arsip tolak sisa nilai pembulatan", async () => {
  await setQtyZeroWithDust(itemId); // qty 0, total 1
  await expect(setItemActive(itemId, false)).rejects.toThrow("NILAI_MASIH_ADA");
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/inventory-valuation.test.ts tests/integration/inventory-archive.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Post: bandingkan `item.averageCostMinor` kini vs snapshot opname (dalam lock `opname-post`), beda → abort. Arsip: tambah cek `totalCostMinor==0` (kode error baru, pesan ID). Cost-cell: string kosong → kirim `undefined` (server pertahankan). Cancel: hapus objek S3 ter-link draf (best-effort, try/catch, preceden enqueue best-effort jurnal). Riwayat: sertakan `OUT`/`ADJUSTMENT` (tandai arah).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/inventory-valuation.test.ts tests/integration/inventory-archive.test.ts tests/integration/inventory-opname-cancel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/inventory.repo.ts src/server/actions/inventory.actions.ts "src/app/(app)/persediaan/opname" tests/integration/inventory-valuation.test.ts tests/integration/inventory-archive.test.ts tests/integration/inventory-opname-cancel.test.ts
git commit -m "fix(persediaan): stale-cost, arsip nilai, cancel bersih"
```

### Task C4: Aset — counter, lock susut, source, disposal, AI journal

**Files:**
- Modify: `src/server/db/repos/assets.repo.ts:34-51,195-321,323-433`
- Modify: `src/core/assets/disposal.ts:47-54`, `src/server/actions/assets.actions.ts`, `disposal-dialog.tsx`, `src/server/ai/assets-closing.tools.ts:211-240,359-373`
- Test: `tests/integration/asset-lifecycle.test.ts`

**Interfaces:**
- Consumes: `ast_seq_counters` + lock (Plan A), kontrak idempotency, `withOrg`.
- Produces: kode AST tahunan anti-race; susut 1 jurnal + lock + source MANUAL; disposal tervalidasi; AI asset terjurnal.

- [ ] **Step 1: Tulis failing tests**

```ts
it("susut konkuren ganda satu jurnal", async () => {
  const [a, b] = await Promise.all([runDep(period), runDep(period)]);
  expect(a.journalEntryId).toBe(b.journalEntryId);
  expect(sourceOf(a.journalEntryId)).toBe("MANUAL");
});
it("disposal SALE tanpa kas ditolak", async () => {
  await expect(dispose(assetId, { type: "SALE", proceedsMinor: 1_000_000n })).rejects.toThrow("KAS_PENJUALAN_WAJIB");
});
it("disposal ditolak bila susut terjadwal sebelum tanggal", async () => {
  await expect(dispose(assetId, { disposalDate: endOfMonth })).rejects.toThrow("SUSUT_BELUM_POSTING");
});
it("AI register asset ikut jurnal perolehan", async () => {
  const out = await executeNaraTool("register_fixed_asset", {...});
  expect(out.journalEntryId).not.toBeNull();
});
```

- [ ] **Step 2: Run, verifikasi FAIL**

Run: `bunx vitest run tests/integration/asset-lifecycle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Numbering via `ast_seq_counters`+lock (Plan A). `postMonthlyDepreciation`: `pg_advisory_xact_lock(hashtext('dep:{org}:{period}'))`, `source:"MANUAL"`, memo `Penyusutan {period}`. Disposal: validasi server+UI; cek `SCHEDULED` dengan `depDate <= disposalDate`. AI tool: param `postAcquisition` default true → jalur atomik `createAssetWithAcquisitionAction`; bila false → status kartu `BELUM_DIJURNAL` eksplisit (tambah kolom `acquisition_posted boolean default false`, tampilkan badge).

- [ ] **Step 4: Run, verifikasi PASS**

Run: `bunx vitest run tests/integration/asset-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/assets.repo.ts src/core/assets/disposal.ts src/server/actions/assets.actions.ts src/server/ai/assets-closing.tools.ts tests/integration/asset-lifecycle.test.ts
git commit -m "fix(aset): lock susut, source MANUAL, guard disposal, AI journal"
```

### Task C5: Catatan PERIODIC + gate Plan C

**Files:**
- Modify: UI penjualan/persediaan (catatan laba kotor PERIODIC), `docs/` bila ada halaman kebijakan.

- [ ] **Step 1: Tambah catatan UI + verifikasi tsc**

Tambah di bawah total penjualan (kasir + faktur) bila `recordingMethod==='PERIODIC'`:
> "Metode PERIODIC: HPP dihitung saat penyesuaian akhir tahun, sehingga laba kotor di sini belum final."
Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Suite persediaan-aset penuh**

Run: `bunx vitest run tests/integration/inventory-valuation.test.ts tests/integration/inventory-opname-zerocost.test.ts tests/integration/inventory-archive.test.ts tests/integration/inventory-opname-cancel.test.ts tests/integration/inventory-item-update.test.ts tests/integration/asset-lifecycle.test.ts tests/integration/posting-foundation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)" docs
git commit -m "docs: catatan PERIODIC + gate Plan C hijau"
```
