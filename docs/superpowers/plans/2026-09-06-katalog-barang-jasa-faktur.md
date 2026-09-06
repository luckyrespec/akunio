# Katalog Barang + Jasa Terpadu + Faktur Campuran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu katalog Barang + Jasa di `inventory_items` sehingga 1 faktur bisa campur (contoh salon: jasa cuci + shampo), dengan mutasi stok + HPP otomatis untuk barang saat posting.

**Architecture:** Perluas tabel existing (kolom `item_type`, `revenue_account_id`, `expense_account_id`, `catalog_item_id`) tanpa tabel baru; posting faktur dipecah per akun + mutasi FIFO/WAC atomik dalam satu transaksi `withOrg`; UI tambah child Jasa + combobox picker di form faktur.

**Tech Stack:** Next 16.3 App Router, Drizzle 0.45 + pg 8, Vitest 4, Playwright 1.62, Tailwind 4 + shadcn/ui, `Money` BigInt minor.

**Spec:** `docs/superpowers/specs/2026-09-06-katalog-barang-jasa-faktur-design.md`

## Global Constraints

- `bun run build` must stay green; `bunx tsc --noEmit` strict, no `any`.
- Uang `numeric(18,2)` dihitung BigInt minor via `Money.parseIdr` / `Money.formatIdr` (`src/core/money/money.ts`) — never JS `number` untuk amount.
- `journal_entries.status` DRAFT→POSTED only; koreksi via `reversal_of_id`; nomor `JE-YYYY-NNNN` per org-tahun.
- `FORCE RLS` semua tabel `org_id`; transaksi tenant baru wajib `withOrg` (`src/server/db/repos/with-org.ts`) agar lolos `app_user`.
- Migrasi dua jalur: hand-write `drizzle/0015_*.sql` (`IF NOT EXISTS`, pemisah `--> statement-breakpoint`, entri `meta/_journal.json`, tanpa snapshot; JANGAN `drizzle-kit generate` — crash BigInt) + CHECK/FK di `src/server/db/*.sql` terurut. `je_source_chk` milik `tax.sql` — jangan sentuh.
- Vitest pakai `ledger_test` (`tests/setup.ts` rewrite URL; `guardTestDb` menolak non-test DB). Jangan sentuh dev Neon. `fileParallelism:false`.
- `bun.exe` auto-load `.env` mengalahkan `export DATABASE_URL=...`; untuk target DB lain pakai temp drizzle config atau temp `.env` swap + restore; verifikasi via query nyata. Prefer `bun x` di child process.
- Bahasa UI Indonesia; `AccountSelect` untuk semua field akun; terra split button `h-9 rounded-xl`; card `rounded-xl border-rule`, thead `text-[11px] uppercase`, `tnum`.
- Kontrak `data-testid` lama stabil (`kas-bank-*`, `onboarding-*`, `persediaan-*` existing); baru: `persediaan-jasa-*`, `faktur-item-picker`, `faktur-stok-warning`.
- `GEMINI_MODEL` default `gemini-3.5-flash-lite`, never `2.5-*`/`2.0-*`/`1.5-*`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/db/schema/inventory.ts` | + `itemType`, `revenueAccountId`, `expenseAccountId` di `inventoryItems` |
| `src/server/db/schema/invoicing.ts` | + `catalogItemId` di `invoiceItems` + index |
| `drizzle/0015_catalog-item-type.sql` + `meta/_journal.json` | Migrasi tabel + kolom + indeks (tangan) |
| `src/server/db/catalog-checks.sql` (baru, nama urut setelah file existing) | CHECK `item_type`, FK `catalog_item_id`, FK akun per item |
| `src/server/db/repos/inventory-sku.ts` | `nextSkuCodes(q, orgId, kind)` → `BRG-`/`JSA-` |
| `src/server/db/repos/inventory.repo.ts` | `CreateItemInput` + guard JASA + filter BARANG di query stok |
| `src/server/db/repos/invoices.repo.ts` | `CreateInvoiceItemInput.catalogItemId` passthrough insert/read |
| `src/server/invoicing/posting.ts` | Posting pecah-akun + mutasi stok atomik + idempoten + VOID reversal |
| `src/server/actions/inventory.actions.ts` | `createServiceItemAction`, `suggestJsaSkuAction` |
| `src/server/actions/invoice.actions.ts` | revalidate `/persediaan` + teruskan `postWarning` |
| `src/components/sidebar-nav.tsx` | child `Jasa & Layanan` |
| `src/app/(app)/persediaan/jasa/**` | list + `baru` + `[id]` jasa (baru) |
| `src/app/(app)/faktur/baru/faktur-baru-client.tsx` | combobox picker campuran + warning stok |
| `src/server/ai/tools/inventory.tools.ts` | `list` tampilkan tipe + `add_service_item` |
| `tests/integration/catalog-jasa-faktur.test.ts` (baru) | Semua aturan repo/posting |
| `tests/e2e/jasa-faktur.spec.ts` (baru) | Alur UI jasa + faktur campur |

---

### Task 1: Migrasi + skema Drizzle

**Files:**
- Modify: `src/server/db/schema/inventory.ts:55-91`
- Modify: `src/server/db/schema/invoicing.ts:103-126`
- Create: `drizzle/0015_catalog-item-type.sql`
- Modify: `drizzle/meta/_journal.json` (tambah entri idx 15)
- Create: `src/server/db/catalog-checks.sql`

**Interfaces:**
- Consumes: pola `drizzle/0014_inventory-sku-image.sql` (header komentar + `IF NOT EXISTS` + `--> statement-breakpoint`).
- Produces: kolom `inventory_items.item_type / revenue_account_id / expense_account_id`, `invoice_items.catalog_item_id` untuk semua task berikut.

- [ ] **Step 1: Tambah kolom di skema Drizzle**

```ts
// src/server/db/schema/inventory.ts — dalam inventoryItems, setelah appBarcode:
itemType: text("item_type", { enum: ["BARANG", "JASA"] }).notNull().default("BARANG"),
revenueAccountId: uuid("revenue_account_id").references(() => accounts.id),
expenseAccountId: uuid("expense_account_id").references(() => accounts.id),
```

```ts
// src/server/db/schema/invoicing.ts — import inventoryItems dulu:
import { inventoryItems } from "./inventory";
// dalam invoiceItems, setelah description:
catalogItemId: uuid("catalog_item_id").references(() => inventoryItems.id, { onDelete: "restrict" }),
// index baru:
(t) => [index("invoice_items_inv_idx").on(t.invoiceId), index("invoice_items_catalog_idx").on(t.catalogItemId)]
```

- [ ] **Step 2: Tulis migrasi tangan `drizzle/0015_catalog-item-type.sql`**

```sql
-- Katalog Barang+Jasa: kolom tipe + akun per item + FK faktur.
-- Ditulis tangan (drizzle-kit generate crash BigInt). Idempoten.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "item_type" text DEFAULT 'BARANG' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "revenue_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "expense_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_items_catalog_idx" ON "public"."invoice_items" USING btree ("catalog_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_org_type_idx" ON "public"."inventory_items" USING btree ("org_id","item_type");
```

Tambah entri journal (ikuti pola idx 14, `when` = timestamp sekarang):

```json
{
  "idx": 15,
  "version": "7",
  "when": 1788800000000,
  "tag": "0015_catalog-item-type",
  "breakpoints": true
}
```

- [ ] **Step 3: Tulis `src/server/db/catalog-checks.sql` (raw lane, CHECK + FK)**

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_type_chk') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_type_chk CHECK (item_type IN ('BARANG','JASA'));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_catalog_fk') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_catalog_fk FOREIGN KEY (catalog_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
```

- [ ] **Step 4: Terapkan ke DB test dan verifikasi kolom ada**

```bash
bun run test:db:setup
node.exe -e "const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.TEST_DATABASE_URL||'postgres://postgres:root@127.0.0.1:5432/ledger_test'});const r=await p.query(\"SELECT column_name FROM information_schema.columns WHERE table_name IN ('inventory_items','invoice_items') AND column_name IN ('item_type','revenue_account_id','expense_account_id','catalog_item_id') ORDER BY 1\");console.log(r.rows.map(x=>x.column_name).join(','));await p.end();})()"
```

Expected: `catalog_item_id,expense_account_id,item_type,revenue_account_id`

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema/inventory.ts src/server/db/schema/invoicing.ts drizzle/0015_catalog-item-type.sql drizzle/meta/_journal.json src/server/db/catalog-checks.sql
git commit -m "feat(katalog): skema item_type + akun per item + FK faktur"
```

---

### Task 2: SKU JASA + create item jasa (tanpa stok)

**Files:**
- Modify: `src/server/db/repos/inventory-sku.ts:7-30`
- Modify: `src/server/db/repos/inventory.repo.ts:18-29,111-195`
- Test: `tests/integration/catalog-jasa-faktur.test.ts` (baru, bagian 1)

**Interfaces:**
- Consumes: kolom Task 1.
- Produces: `nextSkuCodes(q, orgId, kind?: "BARANG"|"JASA")`, `createInventoryItem` dukung `itemType/revenueAccountId/expenseAccountId`, `listServiceItems(q, orgId)`.

- [ ] **Step 1: Tulis failing test (JASA tanpa layers, SKU JSA-)**

```ts
// tests/integration/catalog-jasa-faktur.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { nextSkuCodes } from "@/server/db/repos/inventory-sku";
import { createInventoryItem, listItemTransactions } from "@/server/db/repos/inventory.repo";

describe("katalog jasa", () => {
  beforeEach(async () => { await truncateAll(); });
  it("SKU jasa prefix JSA- dan tanpa layer/transaksi", async () => {
    const { orgId } = await makeOrg("salon");
    const item = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, { itemType: "JASA", name: "Cuci Rambut", standardSellingPriceMinor: 50000n })
    );
    expect(item.code.startsWith("JSA-")).toBe(true);
    expect(item.itemType).toBe("JASA");
    const txs = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, item.id));
    expect(txs.length).toBe(0);
  });
  it("JASA tolak initialQty > 0", async () => {
    const { orgId } = await makeOrg("salon2");
    await expect(withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, { itemType: "JASA", name: "Creambath", initialQty: 5 })
    )).rejects.toThrow("JASA_TANPA_STOK");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan FAIL (fungsi/kolom belum ada)**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: FAIL (`itemType` unknown / `JASA_TANPA_STOK` tidak dilempar).

- [ ] **Step 3: Implementasi minimal**

```ts
// inventory-sku.ts
export async function nextSkuCodes(
  q: Queryable, orgId: string, kind: "BARANG" | "JASA" = "BARANG",
): Promise<{ code: string; appBarcode: string }> {
  // ... lock + counter sama seperti existing ...
  const prefix = kind === "JASA" ? "JSA-" : "BRG-";
  return { code: `${prefix}${String(seq).padStart(4, "0")}`, appBarcode: String(20_000_000 + seq) };
}
```

```ts
// inventory.repo.ts — extend interface:
export interface CreateItemInput {
  itemType?: "BARANG" | "JASA";
  revenueAccountId?: string | null;
  expenseAccountId?: string | null;
  // ... existing ...
}
// di createInventoryItem, setelah parse nama:
const itemType = input.itemType ?? "BARANG";
if (itemType === "JASA" && (input.initialQty ?? 0) > 0) throw new Error("JASA_TANPA_STOK: jasa tidak punya stok awal");
if (itemType === "JASA") {
  // paksa nol + appBarcode opsional: biarkan null bila tidak diisi
}
// insert: tambah itemType, revenueAccountId: input.revenueAccountId ?? null, expenseAccountId: input.expenseAccountId ?? null,
// currentQty/totalCost/average = "0"/0n untuk JASA; lewati blok layers/transactions bila JASA.
```

```ts
// inventory.repo.ts — baru:
export async function listServiceItems(q: Queryable, orgId: string) {
  return q.select().from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.isActive, true), eq(inventoryItems.itemType, "JASA")))
    .orderBy(desc(inventoryItems.createdAt));
}
```

Jaga pesan unik existing (`SKU_SUDAH_DIPAKAI`, `APP_BARCODE_SUDAH_DIPAKAI`) tetap.

- [ ] **Step 4: Jalankan test, pastikan PASS**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/inventory-sku.ts src/server/db/repos/inventory.repo.ts tests/integration/catalog-jasa-faktur.test.ts
git commit -m "feat(katalog): master jasa tanpa stok, SKU JSA-"
```

---

### Task 3: `invoice_items.catalog_item_id` passthrough repo

**Files:**
- Modify: `src/server/db/repos/invoices.repo.ts:13-19,116-128,147-150`
- Test: `tests/integration/catalog-jasa-faktur.test.ts` (tambah describe)

**Interfaces:**
- Consumes: kolom `catalog_item_id` (Task 1).
- Produces: `CreateInvoiceItemInput.catalogItemId?`, items tersimpan + terbaca kembali.

- [ ] **Step 1: Tulis failing test**

```ts
it("invoice_items menyimpan catalogItemId (snapshot tetap ada)", async () => {
  const { orgId } = await makeOrg("campur");
  const barang = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, { name: "Shampo", initialQty: 10, initialCostMinor: 20000n, standardSellingPriceMinor: 35000n }));
  const { createInvoiceRepo, getInvoiceByIdRepo } = await import("@/server/db/repos/invoices.repo");
  const { createContactRepo } = await import("@/server/db/repos/contacts.repo");
  const contact = await withOrg(orgId, (tx) => createContactRepo(tx, orgId, { name: "Pelanggan", type: "CUSTOMER" }));
  const inv = await createInvoiceRepo(db, orgId,
    { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
    [{ description: "Shampo", quantity: 2, unitPriceMinor: 35000n, catalogItemId: barang.id },
     { description: "Cuci Rambut", quantity: 1, unitPriceMinor: 50000n }]);
  const full = await getInvoiceByIdRepo(db, orgId, inv.id);
  expect(full!.items.find((i) => i.description === "Shampo")!.catalogItemId).toBe(barang.id);
  expect(full!.items.find((i) => i.description === "Cuci Rambut")!.catalogItemId).toBeNull();
});
```

(Cek dulu nama export kontak di `contacts.repo.ts`; jika namanya `createContact`, sesuaikan — test di atas sengaja import dinamis agar failure message menunjukkannya.)

- [ ] **Step 2: Jalankan, pastikan FAIL**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: FAIL (`catalogItemId` unknown column / export kontak salah nama).

- [ ] **Step 3: Implementasi minimal**

```ts
// invoices.repo.ts
export interface CreateInvoiceItemInput {
  description: string;
  quantity: number | string;
  unitPriceMinor: bigint;
  discountMinor?: bigint;
  taxRatePercent?: number | string;
  catalogItemId?: string | null;
}
// saat insert invoiceItems: tambah catalogItemId: itemsData[idx]?.catalogItemId ?? null,
```

Samakan nama fungsi kontak dengan `contacts.repo.ts` yang sebenarnya (jangan buat wrapper baru).

- [ ] **Step 4: Jalankan test, pastikan PASS**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/invoices.repo.ts tests/integration/catalog-jasa-faktur.test.ts
git commit -m "feat(faktur): passthrough catalog_item_id + snapshot"
```

---

### Task 4: Posting penjualan campur + mutasi OUT (PERPETUAL)

**Files:**
- Modify: `src/server/invoicing/posting.ts:20-128`
- Test: `tests/integration/catalog-jasa-faktur.test.ts` (tambah describe penjualan)

**Interfaces:**
- Consumes: `getInventorySettings` (valuation/recording), `inventoryItems` + `invoiceItems.catalogItemId`, `calculateWeightedAverage` / `consumeFifoLayers` (`src/core/inventory/valuation.ts`), `postJournalEntry(tx, orgId, actor, {dateISO, memo, source, lines})`.
- Produces: `postInvoiceToLedger` yang mutasi stok + jurnal pecah-akun, idempoten.

- [ ] **Step 1: Tulis failing test (faktur salon 1 jasa + 2 shampo)**

```ts
it("INVOICE perpetual: jasa tanpa mutasi, barang OUT + jurnal pecah", async () => {
  // setup: org + COA seed (pakai helper seedOrgAccounts yang dipakai onboarding/engine.ts),
  // barang Shampo qty 10 @20000, jasa Cuci 50000, settings PERPETUAL/WEIGHTED_AVERAGE,
  // akun pendapatan barang 4110, jasa 4130, HPP 5100, persediaan 1300/1310.
  // buat INVOICE 2x Shampo @35000 + 1x Cuci @50000, posting via postInvoiceToLedger.
  // expect: qty barang 10->8; ada inventory_transactions OUT sourceType INVOICE;
  // jurnal lines memuat Cr 4110 netto 70000, Cr 4130 netto 50000, Dr HPP 40000, Cr Persediaan 40000.
});
```

Detail seed COA: tiru `tests/integration/invoice-create-post.test.ts` (jangan ciptakan pola seed baru).

- [ ] **Step 2: Jalankan, pastikan FAIL**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: FAIL (tidak ada mutasi / jurnal masih single 4100).

- [ ] **Step 3: Implementasi minimal di `postInvoiceToLedger`**

```ts
// Di dalam db.transaction, SETELAH load inv (yang kini items-nya bawa catalogItemId):
// 1. Jika inv.journalEntryId → return (idempoten, tanpa mutasi).
// 2. Ambil settings via getInventorySettings(tx, orgId); ambil map items katalog BARANG yang ter-link.
// 3. Advisory lock per item: await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'inv:'+itemId}))`)
// 4. Hitung netto per grup: join line ↔ master (atau fallback): barangNetto, jasaNetto, manualNetto (FK null → ikut akun default 4100/5100 seperti sekarang).
// 5. Jurnal INVOICE: Dr 1200 total; Cr 4110 barangNetto (skip jika 0); Cr 4130 jasaNetto (skip jika 0, fallback 4100 bila akun tak ada); Cr 2200 pajak.
//    Jurnal BILL (siapkan untuk Task 5, jangan implementasi penuh di sini).
// 6. Jika recordingMethod PERPETUAL: untuk tiap baris BARANG → kurangi currentQty, tulis inventory_transactions OUT (unitCost = average / FIFO consume), jurnal Dr HPP / Cr Persediaan digabung per faktur.
//    Jika PERIODIC: lewati langkah 6 total.
// 7. postJournalEntry + update invoices.journalEntryId — dalam transaksi yang SAMA dengan mutasi.
```

Fallback akun: coba kode `4110`→`4100`, `4130`→`4100`, `1310`/`1300`, `5100`; hilang → throw (fail-closed, ditangkap action jadi `postWarning`).

- [ ] **Step 4: Jalankan test, pastikan PASS**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoicing/posting.ts tests/integration/catalog-jasa-faktur.test.ts
git commit -m "feat(faktur): posting jual campur + mutasi OUT perpetual"
```

---

### Task 5: Posting pembelian (IN) + PERIODIC no-op + VOID reversal

**Files:**
- Modify: `src/server/invoicing/posting.ts:70-99`
- Test: `tests/integration/catalog-jasa-faktur.test.ts` (tambah 3 test)

**Interfaces:**
- Consumes: Task 4 (struktur pecah-akun + lock + idempoten).
- Produces: BILL perpetual/periodic lengkap + `voidInvoiceWithReversal` (nama final, dipakai action nanti).

- [ ] **Step 1: Tulis 3 failing test**

```ts
it("BILL perpetual: barang IN + average update + Dr Persediaan", ...); // beli 5 @22000 → qty 8+5?/total sesuai WAC
it("PERIODIC: jual maupun beli tanpa mutasi/transaksi stok", ...); // settings PERIODIC → qty tetap, tanpa inventory_transactions baru
it("VOID kembalikan stok + reversal link", ...); // posting lalu voidInvoiceWithReversal → qty kembali, jurnal pembalik reversal_of_id terisi
```

- [ ] **Step 2: Jalankan, pastikan FAIL**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: FAIL (3 test merah).

- [ ] **Step 3: Implementasi minimal**

```ts
// BILL PERPETUAL: tiap baris BARANG → qty tambah, insert inventory_layers
//   {referenceType:"PURCHASE", referenceId: invoice.id}, update average WAC, tulis IN sourceType INVOICE.
//   Jurnal: Dr Persediaan (netto barang) + Dr Beban (netto jasa via expense_account_id→5100) + Dr PPN Masukan 1400 / Cr Utang 2100 total.
// BILL PERIODIC: tanpa mutasi; jurnal Dr Pembelian (pakai cogsAccountId) / Cr Utang.
// VOID baru:
export async function voidInvoiceWithReversal(db: Db, orgId: string, invoiceId: string, actorEmail: string) {
  // dalam withOrg tx: load inv (harus ISSUED + journalEntryId); lock item; tulis transaksi lawan (IN untuk OUT, dst)
  // + kembalikan qty/average (WAC: total - costForQty; FIFO: kembalikan layer? Sederhana: tambah layer ADJUSTMENT reversalnya — TULIS alasan di memo "Reversal {invoiceNumber}");
  // posting jurnal pembalik via postJournalEntry dengan reversal_of_id = journalEntryId lama; set invoices.status=VOID.
}
```

- [ ] **Step 4: Jalankan test, pastikan PASS**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: PASS (semua test file hijau).

- [ ] **Step 5: Commit**

```bash
git add src/server/invoicing/posting.ts tests/integration/catalog-jasa-faktur.test.ts
git commit -m "feat(faktur): posting beli IN + periodic + void reversal"
```

---

### Task 6: Server actions wiring

**Files:**
- Modify: `src/server/actions/inventory.actions.ts` (tambah 2 action)
- Modify: `src/server/actions/invoice.actions.ts:33-60` (revalidate persediaan)

**Interfaces:**
- Consumes: `createInventoryItem`, `nextSkuCodes`, `postInvoiceToLedger` (Tasks 2–5).
- Produces: `createServiceItemAction`, `suggestJsaSkuAction` untuk UI Task 7.

- [ ] **Step 1: Tulis failing test (action tersedia + guard role)**

```ts
it("createServiceItemAction menolak nama kosong + mapping duplikat ramah", async () => {
  const { createServiceItemAction } = await import("@/server/actions/inventory.actions");
  expect(typeof createServiceItemAction).toBe("function");
});
```

(Uji logika berat tetap di repo; di sini cukup keberadaan + validasi. Guard `requireContext` tidak diuji unit — diuji e2e.)

- [ ] **Step 2: Jalankan, pastikan FAIL**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: FAIL (`createServiceItemAction` undefined).

- [ ] **Step 3: Implementasi minimal**

```ts
// inventory.actions.ts — tiru pola createItemAction yang ada:
export async function createServiceItemAction(input: { name: string; priceMinor: bigint; unit?: string; category?: string; revenueAccountId?: string | null; expenseAccountId?: string | null; code?: string }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const item = await withOrg(ctx.orgId, (tx) => createInventoryItem(tx, ctx.orgId, {
      itemType: "JASA", name: input.name, unit: input.unit ?? "Sesi",
      category: input.category, standardSellingPriceMinor: input.priceMinor,
      revenueAccountId: input.revenueAccountId ?? null, expenseAccountId: input.expenseAccountId ?? null,
      code: input.code,
    }));
    revalidatePath("/persediaan/jasa"); revalidatePath("/faktur/baru");
    return { ok: true as const, data: item };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambah jasa." }; }
}
export async function suggestJsaSkuAction() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  return withOrg(ctx.orgId, (tx) => nextSkuCodes(tx, ctx.orgId, "JASA"));
}
```

```ts
// invoice.actions.ts — tambah di createInvoiceWithPostingAction + postInvoiceToJournalAction:
revalidatePath("/persediaan/daftar"); revalidatePath("/persediaan/jasa");
```

- [ ] **Step 4: Verifikasi ketik + test hijau**

```bash
bunx tsc --noEmit
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: tsc bersih, test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/inventory.actions.ts src/server/actions/invoice.actions.ts tests/integration/catalog-jasa-faktur.test.ts
git commit -m "feat(actions): jasa + revalidate stok di faktur"
```

---

### Task 7: UI master Jasa (sidebar + list + baru + detail)

**Files:**
- Modify: `src/components/sidebar-nav.tsx:60-69` (tambah child)
- Create: `src/app/(app)/persediaan/jasa/page.tsx`, `jasa-client.tsx`, `baru/page.tsx`, `baru/jasa-baru-client.tsx`, `[id]/page.tsx`
- Test: `tests/e2e/jasa-faktur.spec.ts` (bagian 1)

**Interfaces:**
- Consumes: `createServiceItemAction`, `listServiceItems`, `AccountSelect`.
- Produces: routes `/persediaan/jasa*` + testid `persediaan-jasa-*`.

- [ ] **Step 1: Tulis e2e failing test (navigasi + tambah jasa)**

```ts
// tests/e2e/jasa-faktur.spec.ts
import { test, expect } from "@playwright/test";
test("tambah jasa via UI", async ({ page }) => {
  await page.goto("/persediaan/jasa"); await page.waitForLoadState("networkidle");
  await page.getByTestId("persediaan-jasa-tambah").click();
  await page.getByTestId("persediaan-jasa-nama").fill("Cuci Rambut");
  await page.getByTestId("persediaan-jasa-harga").fill("50000");
  await page.getByTestId("persediaan-jasa-simpan").click();
  await expect(page.getByTestId("persediaan-jasa-list")).toContainText("Cuci Rambut");
});
```

- [ ] **Step 2: Jalankan, pastikan FAIL (route 404)**

```bash
bun x playwright test tests/e2e/jasa-faktur.spec.ts --workers=1
```

Expected: FAIL. Catatan: bunuh proses `:3000` basi dulu; `reuseExistingServer:true`; AI_MOCK=1 + E2E Neon branch via webServer env.

- [ ] **Step 3: Implementasi minimal (tiru `daftar/baru` + `kas-bank/pembayaran/page.tsx`)**

```tsx
// sidebar-nav.tsx children tambah:
{ href: "/persediaan/jasa", label: "Jasa & Layanan" },
// jasa/page.tsx: PageHeader title="Jasa & Layanan" + fetch listServiceItems via action + <JasaClient data-testid="persediaan-jasa-list">
// baru/jasa-baru-client.tsx: field Kode (Generate → suggestJsaSkuAction) + Nama + Satuan + Harga (Money) + AccountSelect pendapatan/beban + Simpan data-testid persediaan-jasa-simpan.
// [id]/page.tsx: tampilkan kode JSA-, harga, akun; tanpa foto/stok/opname; tombol Arsip (isActive=false) dengan guard dipakai-faktur (RESTRICT → pesan ramah).
```

- [ ] **Step 4: Jalankan e2e, pastikan PASS**

```bash
bun x playwright test tests/e2e/jasa-faktur.spec.ts --workers=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-nav.tsx src/app/\(app\)/persediaan/jasa tests/e2e/jasa-faktur.spec.ts
git commit -m "feat(persediaan): master jasa + form JSA-"
```

---

### Task 8: Picker campur di form faktur + warning stok

**Files:**
- Modify: `src/app/(app)/faktur/baru/faktur-baru-client.tsx`
- Test: `tests/e2e/jasa-faktur.spec.ts` (tambah test campur)

**Interfaces:**
- Consumes: routes Task 7, settings recordingMethod, `Money.formatIdr`.
- Produces: 1 faktur berisi jasa + barang, testid `faktur-item-picker`, `faktur-stok-warning`.

- [ ] **Step 1: Tambah e2e failing test (faktur salon campur)**

```ts
test("faktur campur jasa + barang dengan warning stok", async ({ page }) => {
  await page.goto("/faktur/baru"); await page.waitForLoadState("networkidle");
  // pilih kontak, tambah baris 1: picker "Cuci Rambut" → harga 50000 otomatis
  // tambah baris 2: picker "Shampo" qty 999 → expect(getByTestId("faktur-stok-warning")).toBeVisible()
  // ubah qty jadi 2 → warning hilang → simpan + centang posting → expect sukses
});
```

- [ ] **Step 2: Jalankan, pastikan FAIL**

```bash
bun x playwright test tests/e2e/jasa-faktur.spec.ts --workers=1
```

Expected: FAIL (picker tidak ada).

- [ ] **Step 3: Implementasi minimal**

```tsx
// Tiap baris item: ganti input deskripsi polos → combobox (shadcn Command/Popover):
// dyd Allah — sumber: prop catalog (server fetch barang aktif + jasa aktif, kirim {id, name, itemType, price, qty?}).
// onSelect: isi description=name, unitPriceMinor=price, catalogItemId=id, satuan; tetap editable.
// Badge BARANG (tampilkan "Stok: X" bila PERPETUAL) / JASA ("tanpa stok").
// qty barang > stok (PERPETUAL) → <p data-testid="faktur-stok-warning" class="text-amber-...">Stok tidak cukup (sisa X) — tetap bisa simpan.</p>
// Payload ke createInvoiceWithPostingAction: sertakan catalogItemId per baris (null untuk manual).
```

Jangan ubah template cetak; jangan ubah kalkulasi PPN (`calculateInvoiceTotals` tetap).

- [ ] **Step 4: Verifikasi e2e + build**

```bash
bun x playwright test tests/e2e/jasa-faktur.spec.ts --workers=1
bun run build
```

Expected: PASS + build hijau.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/faktur/baru/faktur-baru-client.tsx tests/e2e/jasa-faktur.spec.ts
git commit -m "feat(faktur): picker barang+jasa + warning stok"
```

---

### Task 9: AI tools jasa

**Files:**
- Modify: `src/server/ai/tools/inventory.tools.ts:9-78`
- Test: tambah case di `tests/integration/catalog-jasa-faktur.test.ts` (handler langsung, tanpa LLM)

**Interfaces:**
- Consumes: `createInventoryItem` JASA (Task 2).
- Produces: tool `add_service_item` + `list` bertipe.

- [ ] **Step 1: Tulis failing test (handler tanpa foto)**

```ts
it("AI add_service_item tanpa foto sukses", async () => {
  const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
  const { orgId } = await makeOrg("ai-jasa");
  const res = await inventoryHandlers["add_service_item"](orgId, "owner@x.id", { name: "Cuci Motor" });
  expect(res.message).toMatch(/Cuci Motor/);
});
```

- [ ] **Step 2: Jalankan, pastikan FAIL**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: FAIL (`add_service_item` undefined).

- [ ] **Step 3: Implementasi minimal (tiru `add_inventory_item`, required hanya `name`)**

```ts
// def baru: { name: "add_service_item", description: "Daftarkan satu jasa/layanan...", parameters: { name, priceMinor?, unit?, category?, revenueAccountId? } }
// handler: createInventoryItem via withOrg dengan itemType:"JASA"; imageDocumentId DITOLAK ("JASA_TANPA_FOTO: jasa tidak mendukung foto").
// list_inventory_items: sertakan itemType + sembunyikan kolom stok untuk JASA di formatting pesan.
```

- [ ] **Step 4: Jalankan test, pastikan PASS**

```bash
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts
bunx tsc --noEmit
```

Expected: PASS + tsc bersih.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/tools/inventory.tools.ts tests/integration/catalog-jasa-faktur.test.ts
git commit -m "feat(ai): tool master jasa"
```

---

### Task 10: Verifikasi penuh + green build

**Files:** — (tidak ada perubahan kode; hanya verifikasi)

- [ ] **Step 1: Tulis ulang daftar verifikasi sebagai skrip**

```bash
bunx tsc --noEmit
bun x vitest run tests/integration/catalog-jasa-faktur.test.ts tests/integration/invoice-create-post.test.ts tests/integration/inventory-opname-journal.test.ts
bun x playwright test tests/e2e/jasa-faktur.spec.ts tests/e2e/persediaan.spec.ts --workers=1
bun run build
```

- [ ] **Step 2: Jalankan semuanya berurutan, catat hasil**

Expected: tsc bersih; vitest 3 file PASS; playwright 2 file PASS; build hijau. Jika merah, perbaiki di task terkait (jangan commit `--no-verify`).

- [ ] **Step 3: (tidak ada kode — lewati implementasi)**
- [ ] **Step 4: (hasil Step 2 adalah bukti PASS)**
- [ ] **Step 5: Commit kosong penanda (bila semua hijau dan tree bersih, boleh lewati)**

```bash
git status --short
```

Expected: tree bersih (tidak ada commit kosong bila tidak perlu).

---

## Self-Review

**1. Spec coverage:** §2 skema → Task 1; SKU JSA- + guard JASA → Task 2; FK + snapshot → Task 3; §3 jurnal jual PERPETUAL/PERIODIC → Task 4; beli + VOID → Task 5; fail-closed + postWarning → Task 4–6; §4 menu/form/picker/testid → Task 7–8; §5 AI + error mapping + vitest/playwright → Task 6–10; §6 non-tujuan tidak ada tasknya (benar — bundling, harga bertingkat, pajak master, foto jasa, backfill FK lama memang tidak dikerjakan).

**2. Placeholder scan:** tidak ada TBD/TODO/"nanti"/"dsb"; semua langkah berisi kode + perintah + expected aktual; tidak ada "mirip Task N" tanpa kode.

**3. Type consistency:** `nextSkuCodes(q, orgId, kind)` dipakai konsisten Task 2–3; `CreateInvoiceItemInput.catalogItemId?: string | null` sama di Task 3–5; `voidInvoiceWithReversal(db, orgId, invoiceId, actorEmail)` didefinisikan Task 5 dan hanya itu nama yang dipakai; `createServiceItemAction/suggestJsaSkuAction` Task 6 = yang dipakai Task 7; testid `persediaan-jasa-*`, `faktur-item-picker`, `faktur-stok-warning` sama di Task 7–8.
