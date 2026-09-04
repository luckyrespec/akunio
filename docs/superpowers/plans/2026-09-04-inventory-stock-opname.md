# Persediaan, Stok Opname, & Jurnal Penyesuaian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun modul Persediaan (Inventory), Stok Opname fisik, dan Jurnal Penyesuaian (Stock Adjustment) otomatis berbasis double-entry imutabel dengan dukungan Weighted Average Cost & FIFO serta sistem Perpetual & Periodik.

**Architecture:** Database Drizzle ORM + RLS PostgreSQL per tenant (`org_id`), BigInt minor currency handling (`Money`), mesin valuasi persediaan terisolasi (FIFO queue & Moving Average), generator draf jurnal penyesuaian otomatis (`source: "STOCK_OPNAME"`), dan antarmuka *Paper & Ink Matte* (`/persediaan`, `/persediaan/opname`).

**Tech Stack:** Next.js 16.3 (App Router), React 19, TypeScript, Drizzle ORM, PostgreSQL (Neon / local PG), Tailwind CSS 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-inventory-stock-opname-design.md`

## Global Constraints

- Mata uang wajib disimpan dalam bentuk minor `BigInt` (Rupiah integer murni) via kelas `Money` (`src/core/money/money.ts`).
- Kuantitas barang mendukung bilangan desimal (presisi 12, skala 4) untuk satuan metrik/pecahan.
- Semua transaksi database tenant-scoped wajib dibungkus `withOrg` (`src/server/db/repos/with-org.ts`) untuk RLS PostgreSQL.
- Jurnal penyesuaian selalu diawali status `DRAFT` sebelum diposting (`POSTED`) dan terkunci imutabel.
- Seluruh teks UI menggunakan Bahasa Indonesia dan mematuhi palet warna *Paper & Ink Matte* (`DESIGN.md`).

---

### Task 1: Skema Database Persediaan & RLS Policy

**Files:**
- Create: `src/server/db/schema/inventory.ts`
- Modify: `src/server/db/schema/index.ts`
- Modify: `src/server/db/rls.sql`
- Test: `tests/integration/inventory-schema.test.ts`

**Interfaces:**
- Consumes: `organizations` dan `accounts` dari `src/server/db/schema/org.ts`, `journalEntries` dari `src/server/db/schema/journal.ts`.
- Produces: `inventorySettings`, `inventoryItems`, `inventoryLayers`, `inventoryTransactions`, `stockOpnames`, `stockOpnameItems`.

- [ ] **Step 1: Tulis integration test skema dan RLS**
Tulis test di `tests/integration/inventory-schema.test.ts` untuk memastikan tabel persediaan dapat di-*insert* dan membaca data sesuai isolasi `org_id`.

- [ ] **Step 2: Jalankan test untuk memverifikasi kegagalan**
Run: `bunx vitest run tests/integration/inventory-schema.test.ts`
Expected: FAIL (tabel/skema belum ada).

- [ ] **Step 3: Implementasikan skema `src/server/db/schema/inventory.ts` & update export di `index.ts`**
Definisikan tabel `inventorySettings`, `inventoryItems`, `inventoryLayers`, `inventoryTransactions`, `stockOpnames`, dan `stockOpnameItems` sesuai spesifikasi desain. Tambahkan RLS di `src/server/db/rls.sql`.

- [ ] **Step 4: Jalankan test kembali untuk memverifikasi kelulusan**
Run: `bunx vitest run tests/integration/inventory-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit perubahan skema**
```bash
git add src/server/db/schema/inventory.ts src/server/db/schema/index.ts src/server/db/rls.sql tests/integration/inventory-schema.test.ts
git commit -m "feat(inventory): add database schema and RLS policies for inventory & opname"
```

---

### Task 2: Core Valuation Engine (Weighted Average & FIFO Layering)

**Files:**
- Create: `src/core/inventory/valuation.ts`
- Create: `src/core/inventory/types.ts`
- Test: `tests/unit/inventory/valuation.test.ts`

**Interfaces:**
- Consumes: `Money` dari `src/core/money/money.ts`.
- Produces:
  - `calculateWeightedAverage(currentQty, currentTotalCostMinor, incomingQty, incomingUnitCostMinor): { newTotalCostMinor: bigint, newAverageCostMinor: bigint }`
  - `consumeFifoLayers(layers: FifoLayer[], qtyToDeduct: number): { consumedCostMinor: bigint, remainingLayers: FifoLayer[], consumedBreakdown: LayerConsumption[] }`
  - `calculateStockDifference(systemQty: number, physicalQty: number, unitCostMinor: bigint): { differenceQty: number, differenceValueMinor: bigint, isDeficit: boolean }`

- [ ] **Step 1: Tulis unit test untuk kalkulasi Average & FIFO**
Buat unit test di `tests/unit/inventory/valuation.test.ts` yang menguji:
1. Penambahan stok dengan berbagai harga beli menghasilkan average cost yang presisi.
2. Pengeluaran stok FIFO mengonsumsi antrean layer secara berurutan dan menghitung sisa modal dengan akurat.
3. Selisih opname (defisit vs surplus) menghasilkan valuasi nominal yang tepat.

- [ ] **Step 2: Jalankan unit test untuk memastikan kegagalan**
Run: `bunx vitest run tests/unit/inventory/valuation.test.ts`
Expected: FAIL (fungsi belum diimplementasikan).

- [ ] **Step 3: Buat implementasi engine di `src/core/inventory/valuation.ts` & `types.ts`**
Implementasikan fungsi murni matematis bebas I/O untuk penentuan nilai buku persediaan.

- [ ] **Step 4: Jalankan unit test sampai lulus**
Run: `bunx vitest run tests/unit/inventory/valuation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit perubahan Core Engine**
```bash
git add src/core/inventory/ tests/unit/inventory/valuation.test.ts
git commit -m "feat(inventory): implement weighted average and FIFO valuation engine"
```

---

### Task 3: Inventory Repository & Stock Adjustment Journal Generator

**Files:**
- Create: `src/server/db/repos/inventory.repo.ts`
- Create: `src/server/actions/inventory.actions.ts`
- Test: `tests/integration/inventory-opname-journal.test.ts`

**Interfaces:**
- Consumes: `withOrg` (`src/server/db/repos/with-org.ts`), `journalsRepo` (`src/server/db/repos/journals.repo.ts`), `calculateStockDifference` (`src/core/inventory/valuation.ts`).
- Produces:
  - `createStockOpnameSession(orgId, data): Promise<StockOpname>`
  - `recordPhysicalCounts(orgId, opnameId, counts: ItemCount[]): Promise<StockOpnameWithItems>`
  - `generateAdjustmentJournalDraft(orgId, opnameId): Promise<{ opname: StockOpname, journalEntryId: string }>`

- [ ] **Step 1: Tulis integration test alur Opname -> Draf Jurnal Penyesuaian**
Tulis skenario di `tests/integration/inventory-opname-journal.test.ts`:
1. Buat master barang dengan saldo awal.
2. Buat sesi opname dan masukkan stok fisik yang berselisih (misal fisik kurang 2 unit).
3. Panggil generator draf jurnal penyesuaian.
4. Verifikasi bahwa jurnal `DRAFT` terbentuk seimbang (`Debit == Credit`) dengan akun lawan Beban Selisih vs Persediaan Barang.

- [ ] **Step 2: Jalankan test untuk memverifikasi kegagalan**
Run: `bunx vitest run tests/integration/inventory-opname-journal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasikan `inventory.repo.ts` dan server action `inventory.actions.ts`**
Buat fungsi database transaksi untuk menyimpan sesi opname, kalkulasi selisih, dan menyusun baris jurnal penyesuaian ke `journal_entries` dan `journal_lines` dengan nomor `JE-YYYY-NNNN`.

- [ ] **Step 4: Jalankan test kembali sampai lulus**
Run: `bunx vitest run tests/integration/inventory-opname-journal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit repository & generator jurnal**
```bash
git add src/server/db/repos/inventory.repo.ts src/server/actions/inventory.actions.ts tests/integration/inventory-opname-journal.test.ts
git commit -m "feat(inventory): add opname repository and stock adjustment journal generator"
```

---

### Task 4: Antarmuka UI Master Persediaan & Kartu Stok (`/persediaan`)

**Files:**
- Create: `src/app/(app)/persediaan/page.tsx`
- Create: `src/app/(app)/persediaan/persediaan-client.tsx`
- Create: `src/app/(app)/persediaan/_components/item-dialog.tsx`
- Create: `src/app/(app)/persediaan/[id]/page.tsx` (Kartu Stok / Mutasi)
- Modify: `src/components/sidebar-nav.tsx` (Tambahkan menu Persediaan & Stok)

**Interfaces:**
- Consumes: `inventory.actions.ts`, styling `Paper & Ink Matte` dari `DESIGN.md`.
- Produces: UI interaktif untuk melihat daftar barang, menambah SKU barang baru, dan melihat kartu stok per item.

- [ ] **Step 1: Tambahkan rute navigasi di `sidebar-nav.tsx`**
Tambahkan link menu *"Persediaan"* dengan ikon representatif (misal `Boxes` / `Package`) di grup Operasional.

- [ ] **Step 2: Buat komponen halaman katalog barang di `src/app/(app)/persediaan/`**
Implementasikan kartu KPI (Total Nilai Persediaan, Total SKU, Stok Menipis) dan tabel barang yang dilengkapi pencarian & badge status.

- [ ] **Step 3: Buat dialog tambah/edit barang `item-dialog.tsx`**
Form input: Kode/SKU, Nama, Satuan, Kategori, Harga Beli Awal, Harga Jual, dan batas stok minimum.

- [ ] **Step 4: Buat halaman detail kartu stok di `src/app/(app)/persediaan/[id]/page.tsx`**
Menampilkan riwayat mutasi masuk/keluar/penyesuaian barang dan sisa saldo berjalan.

- [ ] **Step 5: Jalankan typecheck & verifikasi build visual**
Run: `bunx tsc --noEmit`
Expected: Tidak ada error baru pada modul persediaan.

- [ ] **Step 6: Commit UI Master Persediaan**
```bash
git add src/app/\(app\)/persediaan/ src/components/sidebar-nav.tsx
git commit -m "feat(inventory): add inventory master list, item dialog, and stock ledger UI"
```

---

### Task 5: Antarmuka UI Stok Opname & Review Draf Jurnal (`/persediaan/opname`)

**Files:**
- Create: `src/app/(app)/persediaan/opname/page.tsx`
- Create: `src/app/(app)/persediaan/opname/baru/page.tsx`
- Create: `src/app/(app)/persediaan/opname/baru/opname-form-client.tsx`
- Create: `src/app/(app)/persediaan/opname/[id]/page.tsx`
- Create: `src/app/(app)/persediaan/opname/[id]/opname-detail-client.tsx`

**Interfaces:**
- Consumes: Server actions opname, integrasi link ke `/jurnal/` untuk posting draf jurnal.
- Produces: Workflow lengkap opname: Buat sesi -> Input hitungan fisik -> Preview selisih -> Buat Draf Jurnal Penyesuaian -> Navigasi ke Review Jurnal.

- [ ] **Step 1: Buat halaman daftar sesi opname `src/app/(app)/persediaan/opname/page.tsx`**
Tabel riwayat opname dengan status badge (`DRAFT`, `REVIEW_DRAFT_JOURNAL`, `COMPLETED`).

- [ ] **Step 2: Buat lembar input hitung fisik `opname-form-client.tsx`**
Tabel interaktif: kolom Stok Sistem (readonly), input Stok Fisik, selisih kuantitas, estimasi selisih rupiah, dan input keterangan alasan (misal: "Barang rusak kena air", "Salah hitung").

- [ ] **Step 3: Buat halaman detail & tombol *"Buat Draf Jurnal Penyesuaian"***
Pada `opname-detail-client.tsx`, tampilkan rekapitulasi selisih dan tombol aksi Opsi A. Saat ditekan, server action akan membuat draf jurnal penyesuaian dan menampilkan kartu preview jurnal dengan tombol *"Buka Draf Jurnal untuk Posting"*.

- [ ] **Step 4: Verifikasi end-to-end flow opname secara lokal**
Lakukan pengujian form dan pastikan perpindahan status dari input opname sampai terciptanya draf jurnal berjalan mulus.

- [ ] **Step 5: Commit antarmuka UI Stok Opname**
```bash
git add src/app/\(app\)/persediaan/opname/
git commit -m "feat(inventory): implement physical stock opname sheet and journal draft flow UI"
```

---

### Task 6: Integrasi AI Nara Onboarding & Guardrail Kebijakan

**Files:**
- Modify: `src/server/onboarding/engine.ts`
- Modify: `src/server/onboarding/parse.ts`
- Modify: `src/app/onboarding/onboarding-chat-client.tsx`
- Test: `tests/integration/inventory-policy-lock.test.ts`

**Interfaces:**
- Consumes: `inventorySettings`, `chat_threads`.
- Produces: Rekomendasi metode persediaan otomatis oleh AI Nara saat onboarding dan kunci integritas kebijakan akuntansi.

- [ ] **Step 1: Tambahkan parsing pilihan persediaan pada onboarding**
Perbarui parser onboarding agar mendeteksi preferensi metode (Average vs FIFO, Perpetual vs Periodik) dari percakapan Nara.

- [ ] **Step 2: Tulis test guardrail lock policy di `inventory-policy-lock.test.ts`**
Memastikan bahwa perubahan metode penilaian ditolak jika ada jurnal persediaan `POSTED` di tahun berjalan.

- [ ] **Step 3: Jalankan verifikasi test policy lock**
Run: `bunx vitest run tests/integration/inventory-policy-lock.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit integrasi onboarding & guardrail**
```bash
git add src/server/onboarding/ src/app/onboarding/ tests/integration/inventory-policy-lock.test.ts
git commit -m "feat(inventory): integrate Nara AI onboarding recommendation and policy lock guardrail"
```
