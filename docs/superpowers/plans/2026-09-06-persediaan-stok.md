# Persediaan Split Menu + SKU/Barcode + Thumbnail + Foto Asisten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pecah modul persediaan menjadi child-menu ala Kas & Bank, tambah SKU/app-barcode otomatis anti-duplikat, satu thumbnail ≤500KB per barang, dan foto upload asisten bisa jadi thumbnail via opt-in.

**Architecture:** Migrasi aditif (tabel counter + kolom baru, tanpa ubah kolom lama); generator SKU via counter per-org + `pg_advisory_xact_lock` (pola `journal_seq_counters`); foto di SeaweedFS prefix `orgs/{orgId}/inventory/` dengan kompres client-side; asisten persist lampiran jadi baris `documents` lalu teruskan `imageDocumentId` ke tool.

**Tech Stack:** Next 16.3 App Router, Drizzle 0.45 + pg, SeaweedFS via `@aws-sdk/client-s3`, `jsbarcode` (baru, hanya halaman detail), Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-06-persediaan-stok-design.md`

## Global Constraints

- `bunx tsc --noEmit` strict, tanpa `any` — harus hijau.
- `bun run build` harus hijau.
- Uang: `numeric(18,2)` / BigInt minor via `Money` (`src/core/money/money.ts`) — jangan JS `number` untuk rupiah.
- `bun.exe` auto-load `.env` dan mengalahkan parent-shell `export DATABASE_URL=...` — untuk target DB lain pakai temp drizzle config atau temp `.env` swap + restore; verifikasi dengan query nyata.
- `bunx` bisa hilang di `execSync(shell:true)` children — pilih `bun x`.
- Migrasi Drizzle ditulis tangan (`IF NOT EXISTS`, pemisah `--> statement-breakpoint`, entri journal, tanpa snapshot; preseden `drizzle/0013_kas_bank.sql`). Jangan sentuh CHECK `je_source_chk` (milik `tax.sql`).
- Raw `src/server/db/*.sql` di-apply terurut via `bun run db:sql`.
- Transaksi tenant baru wajib lewat `withOrg` (`src/server/db/repos/with-org.ts`) agar RLS `app_user` lolos.
- Bahasa UI: Bahasa Indonesia. Token Paper & Ink; `prefers-reduced-motion` dihormati.
- Pola UI bersama: `PageHeader` tiap halaman; split button terra `h-9 rounded-xl` + chevron `border-l border-white/20`; tabel card `rounded-xl border-rule` + thead `text-[11px] uppercase` + `tnum`; `AccountSelect` untuk akun (tidak relevan di sini, tapi jangan buat select akun baru).
- Playwright: `workers:1`; setelah `goto` tunggu `networkidle` + hidrasi sebelum klik; bunuh `:3000` basi sebelum `bun run e2e`.
- Jangan `TRUNCATE`/`rm -rf` direktori data SeaweedFS (`weed_strorage`).

---

## File Structure

Perubahan dikelompokkan per tanggung jawab:

- **Migrasi & skema:** `drizzle/0014_inventory-sku-image.sql` (baru), `drizzle/meta/_journal.json` (tambah entri),
  `src/server/db/schema/inventory.ts` (kolom + tabel counter), `src/server/db/rls.sql` (tambah tabel counter),
  `tests/integration/helpers.ts` (tambah tabel di TRUNCATE).
- **Generator SKU:** `src/server/db/repos/inventory-sku.ts` (baru, satu-satunya tempat format SKU/barcode),
  dipakai oleh `src/server/db/repos/inventory.repo.ts` (`CreateItemInput` + `createInventoryItem`).
  Error duplikat dipetakan di `src/server/actions/inventory.actions.ts`.
- **Foto barang:** `src/server/storage/storage.ts` (tambah `putInventoryImage`),
  `src/app/api/inventory/[id]/photo/route.ts` (baru, serve gambar per-org),
  aksi upload/hapus di `src/server/actions/inventory.actions.ts`.
- **Split routes:** `git mv` dari `src/app/(app)/persediaan/*` ke `daftar/*`; `page.tsx` lama jadi redirect;
  `src/components/sidebar-nav.tsx`; `src/lib/assistant-context.ts`.
- **UI barang:** `src/lib/compress-image.ts` (baru), `daftar/baru/item-baru-client.tsx`,
  `daftar/baru/batch/batch-item-client.tsx`, `daftar/persediaan-client.tsx`,
  `daftar/[id]/page.tsx`, `src/components/inventory/app-barcode.tsx` (baru).
- **Asisten:** `src/server/ai/nara.ts` (persist lampiran + prompt), `src/server/ai/tools/inventory.tools.ts`
  (param + handler foto), `src/app/api/nara/chat/confirm/route.ts` (teks konfirmasi).
- **Tests:** `tests/integration/inventory-sku-image.test.ts` (baru), `tests/e2e/persediaan.spec.ts` (baru).

### Task 1: Migrasi DB + skema + RLS + TRUNCATE

**Files:**
- Create: `drizzle/0014_inventory-sku-image.sql`
- Modify: `drizzle/meta/_journal.json`, `src/server/db/schema/inventory.ts`, `src/server/db/rls.sql`, `tests/integration/helpers.ts`
- Test: `tests/integration/inventory-sku-image.test.ts` (dievaluasi di Task 8; di sini verifikasi manual via psql)

**Interfaces:**
- Consumes: `organizations.id` (FK), pola `drizzle/0013_kas_bank.sql`.
- Produces: tabel `inventory_sku_counters(org_id PK, last_seq)`, kolom `inventory_items.app_barcode`,
  `image_storage_key`, `image_mime`, unique index `inventory_items_org_app_barcode_uq`.

- [ ] **Step 1: Tambah kolom + tabel counter + index di Drizzle schema**

Di `src/server/db/schema/inventory.ts`, ubah import dan tambah tabel. Edit import:

```ts
import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
```

Tambah setelah blok `inventorySettings` (sebelum `inventoryItems`):

```ts
export const inventorySkuCounters = pgTable(
  "inventory_sku_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId] })],
);
```

Di `inventoryItems`, tambah tiga kolom setelah `barcode`:

```ts
    barcode: varchar("barcode", { length: 64 }),
    appBarcode: varchar("app_barcode", { length: 16 }),
    imageStorageKey: text("image_storage_key"),
    imageMime: varchar("image_mime", { length: 32 }),
```

Ubah closure index `inventoryItems` menjadi:

```ts
  (t) => [
    uniqueIndex("inventory_items_org_code_uq").on(t.orgId, t.code),
    uniqueIndex("inventory_items_org_app_barcode_uq").on(t.orgId, t.appBarcode),
  ],
```

- [ ] **Step 2: Tulis migrasi SQL tangan `drizzle/0014_inventory-sku-image.sql`**

```sql
-- Persediaan: counter SKU per-org + app_barcode unik + thumbnail barang.
-- Ditulis tangan karena `drizzle-kit generate` crash repo-wide
-- (TypeError BigInt serialization pada kolom numeric mode bigint).
-- Idempoten (IF NOT EXISTS). Kepemilikan objek:
--   migrasi ini  -> tabel + kolom + indeks
--   rls.sql      -> RLS policy (array generik org_id)
CREATE TABLE IF NOT EXISTS "inventory_sku_counters" (
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"last_seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_sku_counters_org_id_pk" PRIMARY KEY("org_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "app_barcode" varchar(16);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "image_storage_key" text;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "image_mime" varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_org_app_barcode_uq" ON "public"."inventory_items" USING btree ("org_id","app_barcode");
```

- [ ] **Step 3: Tambah entri journal Drizzle via node (jangan edit manual)**

Run:

```bash
node.exe -e "const fs=require('fs');const p='drizzle/meta/_journal.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.entries.some(e=>e.tag==='0014_inventory-sku-image')){console.log('sudah ada');process.exit(0)}j.entries.push({idx:14,version:'7',when:Date.now(),tag:'0014_inventory-sku-image',breakpoints:true});fs.writeFileSync(p,JSON.stringify(j,null,'\t'));console.log('ok')"
```

Verifikasi: `node.exe -e "console.log(require('./drizzle/meta/_journal.json').entries.slice(-2).map(e=>e.tag))"` harus mencetak `0013_kas_bank` dan `0014_inventory-sku-image`.

- [ ] **Step 4: Daftarkan tabel counter ke RLS generik**

Di `src/server/db/rls.sql`, pada array tabel (baris berisi `'inventory_settings','inventory_items',...`), tambah `'inventory_sku_counters'` setelah `'stock_opnames',`:

```
'inventory_settings','inventory_items','inventory_layers','inventory_transactions','stock_opnames','inventory_sku_counters',
```

Catatan: `stock_opname_items` sengaja TIDAK masuk array (tidak punya kolom `org_id`; policy generik akan gagal). Itu di luar scope.

- [ ] **Step 5: Tambah tabel ke TRUNCATE global test**

Di `tests/integration/helpers.ts`, fungsi `truncateAll`, tambah `inventory_sku_counters` ke daftar (setelah `kas_bank_seq_counters,`):

```
              kas_bank_entries, kas_bank_seq_counters, inventory_sku_counters,
```

- [ ] **Step 6: Apply migrasi ke dev + verifikasi kolom ada**

Run: `bun run db:migrate` lalu `bun run db:sql`. Verifikasi dengan query nyata (wajib, jangan percaya env):

```bash
node.exe -e "const {Client}=require('pg');require('dotenv').config();(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='inventory_items' and column_name in ('app_barcode','image_storage_key','image_mime') order by 1\");console.log(r.rows);await c.end()})()"
```

Expected: tiga baris `app_barcode`, `image_mime`, `image_storage_key`.

- [ ] **Step 7: Commit**

```bash
git add drizzle/0014_inventory-sku-image.sql drizzle/meta/_journal.json src/server/db/schema/inventory.ts src/server/db/rls.sql tests/integration/helpers.ts
git commit -m "feat(persediaan): migrasi counter SKU + app_barcode + thumbnail"
```

### Task 2: Generator SKU/app-barcode + integrasi repo + pesan duplikat

**Files:**
- Create: `src/server/db/repos/inventory-sku.ts`
- Modify: `src/server/db/repos/inventory.repo.ts`, `src/server/actions/inventory.actions.ts`
- Test: `tests/integration/inventory-sku-image.test.ts` (bagian SKU)

**Interfaces:**
- Consumes: `Queryable` (`src/server/db/repos/queryable.ts`), `inventorySkuCounters`.
- Produces: `nextSkuCodes(q, orgId) -> Promise<{ code: string; appBarcode: string }>`; `createInventoryItem` menerima `code?`/`appBarcode?` kosong (= auto).

- [ ] **Step 1: Tulis test gagal untuk generator**

Buat `tests/integration/inventory-sku-image.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory sku + image", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  async function cleanupInventory() {
    await admin.query(
      `TRUNCATE inventory_transactions, inventory_layers, stock_opname_items, stock_opnames, inventory_items, inventory_settings, inventory_sku_counters CASCADE`,
    );
  }

  beforeAll(async () => {
    await truncateAll();
    await cleanupInventory().catch(() => {});
    orgId = (await makeOrg("PT SKU")).orgId;
  });

  afterAll(async () => {
    await cleanupInventory().catch(() => {});
    await truncateAll().catch(() => {});
    await admin.end();
  });

  it("generator berurutan BRG-0001 dan barcode 20000001", async () => {
    const { db } = await import("@/server/db");
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { nextSkuCodes } = await import("@/server/db/repos/inventory-sku");
    const first = await withOrg(orgId, (tx) => nextSkuCodes(tx as never, orgId));
    const second = await withOrg(orgId, (tx) => nextSkuCodes(tx as never, orgId));
    expect(first).toEqual({ code: "BRG-0001", appBarcode: "20000001" });
    expect(second).toEqual({ code: "BRG-0002", appBarcode: "20000002" });
  });

  it("5 create konkuren menghasilkan kode unik", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const inv = await import("@/server/db/repos/inventory.repo");
    const orgB = (await makeOrg("PT SKU Race")).orgId;
    const codes = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        withOrg(orgB, (tx) =>
          inv.createInventoryItem(tx as never, orgB, { name: `Barang ${i}` }),
        ).then((it) => it.code),
      ),
    );
    expect(new Set(codes).size).toBe(5);
  });

  it("duplikat kode manual melempar error", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const inv = await import("@/server/db/repos/inventory.repo");
    await withOrg(orgId, (tx) =>
      inv.createInventoryItem(tx as never, orgId, { code: "BRG-9000", name: "A" }),
    );
    await expect(
      withOrg(orgId, (tx) =>
        inv.createInventoryItem(tx as never, orgId, { code: "brg-9000", name: "B" }),
      ),
    ).rejects.toThrow(/SKU_SUDAH_DIPAKAI/);
  });
});
```

- [ ] **Step 2: Run test, pastikan gagal (modul belum ada)**

Run: `bun x vitest run tests/integration/inventory-sku-image.test.ts`
Expected: FAIL `Cannot find module '@/server/db/repos/inventory-sku'`.

- [ ] **Step 3: Implementasi generator `src/server/db/repos/inventory-sku.ts`**

```ts
import { eq, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { inventorySkuCounters } from "../schema/inventory";

/** Satu-satunya tempat format SKU/barcode app. Counter per-org + advisory lock
 *  agar insert konkuren tidak mendapat nomor sama (pola journal_seq_counters). */
export async function nextSkuCodes(
  q: Queryable,
  orgId: string,
): Promise<{ code: string; appBarcode: string }> {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`sku:${orgId}`}))`);
  const [row] = await q
    .select()
    .from(inventorySkuCounters)
    .where(eq(inventorySkuCounters.orgId, orgId))
    .limit(1);
  const seq = (row?.lastSeq ?? 0) + 1;
  if (row) {
    await q
      .update(inventorySkuCounters)
      .set({ lastSeq: seq })
      .where(eq(inventorySkuCounters.orgId, orgId));
  } else {
    await q.insert(inventorySkuCounters).values({ orgId, lastSeq: seq });
  }
  return {
    code: `BRG-${String(seq).padStart(4, "0")}`,
    appBarcode: String(20_000_000 + seq),
  };
}
```

- [ ] **Step 4: Integrasi ke `createInventoryItem` di `inventory.repo.ts`**

Ubah interface:

```ts
export interface CreateItemInput {
  code?: string;
  name: string;
  barcode?: string;
  appBarcode?: string;
  unit?: string;
  category?: string;
  minStockAlert?: string;
  standardSellingPriceMinor?: bigint;
  initialQty?: number;
  initialCostMinor?: bigint;
}
```

Ganti tiga baris awal `createInventoryItem`:

```ts
  const code = input.code?.trim().toUpperCase() || (await nextSkuCodes(q, orgId)).code;
```

menjadi logika satu-kali generate (agar code + barcode dari seq sama bila keduanya kosong):

```ts
  let code = input.code?.trim().toUpperCase() ?? "";
  let appBarcode = input.appBarcode?.trim() ?? "";
  if (!code || !appBarcode) {
    const gen = await nextSkuCodes(q, orgId);
    if (!code) code = gen.code;
    if (!appBarcode) appBarcode = gen.appBarcode;
  }
  const name = input.name.trim();
  if (!code || !name) throw new Error("KODE_DAN_NAMA_WAJIB_DIISI");
```

Validasi format appBarcode setelahnya:

```ts
  if (!/^[0-9]{1,16}$/.test(appBarcode)) {
    throw new Error("APP_BARCODE_TIDAK_VALID: hanya digit, maks 16 karakter");
  }
```

Tambah `appBarcode` ke values insert:

```ts
      code,
      name,
      barcode: input.barcode?.trim() || null,
      appBarcode,
```

Bungkus insert dengan pemetaan error duplikat — ganti `const [item] = await q.insert(...)` menjadi try/catch:

```ts
  let item: typeof inventoryItems.$inferSelect;
  try {
    [item] = await q
      .insert(inventoryItems)
      .values({
        orgId,
        code,
        name,
        barcode: input.barcode?.trim() || null,
        appBarcode,
        unit: input.unit?.trim() || "Pcs",
        category: input.category?.trim() || null,
        minStockAlert: input.minStockAlert || "0",
        currentQty: qtyToDb(initialQty),
        averageCostMinor: initialCostMinor,
        totalCostMinor,
        standardSellingPriceMinor: input.standardSellingPriceMinor ?? 0n,
      })
      .returning();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("inventory_items_org_code_uq")) throw new Error("SKU_SUDAH_DIPAKAI: kode SKU sudah terdaftar");
    if (msg.includes("inventory_items_org_app_barcode_uq")) throw new Error("APP_BARCODE_SUDAH_DIPAKAI: barcode app sudah terdaftar");
    throw e;
  }
```

Tambah import di atas file: `import { nextSkuCodes } from "./inventory-sku";`

- [ ] **Step 5: Teruskan `appBarcode` di server actions**

Di `createItemAction` dan `createBatchItemsAction` (`src/server/actions/inventory.actions.ts`):
tambah `appBarcode?: string` ke tipe payload, teruskan ke `createInventoryItem`
(`appBarcode: payload.appBarcode`), dan tambah `revalidatePath("/persediaan/daftar")` di samping
`revalidatePath("/persediaan")` yang sudah ada. Contoh untuk `createItemAction`:

```ts
    const item = await withOrg(ctx.orgId, async (tx) =>
      createInventoryItem(tx, ctx.orgId, {
        code: payload.code,
        appBarcode: payload.appBarcode,
        name: payload.name,
        ...
      }),
    );

    revalidatePath("/persediaan");
    revalidatePath("/persediaan/daftar");
```

Untuk batch: dalam loop, `code` boleh kosong (auto) — ubah cek `if (!code || !name)` menjadi
`if (!name)` dengan alasan `"Nama kosong"`, dan `code` yang kosong diteruskan apa adanya agar repo auto-generate.
`seen` hanya untuk code non-kosong:

```ts
        const code = (payload.code ?? "").trim().toUpperCase();
        const name = (payload.name ?? "").trim();
        if (!name) {
          skipped.push({ index: idx, reason: "Nama kosong" });
          continue;
        }
        if (code) {
          if (seen.has(code)) {
            errors.push({ index: idx, code, message: `Duplikat SKU dalam batch: ${code}` });
            continue;
          }
          seen.add(code);
        }
```

Terapkan pola yang sama di `batch_add_inventory_items` handler AI (Task 7 menyentuh file itu;
cukup siapkan repo agar `code` kosong = auto).

- [ ] **Step 6: Run test, pastikan hijau**

Run: `bun x vitest run tests/integration/inventory-sku-image.test.ts`
Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/repos/inventory-sku.ts src/server/db/repos/inventory.repo.ts src/server/actions/inventory.actions.ts tests/integration/inventory-sku-image.test.ts
git commit -m "feat(persediaan): generator SKU BRG-urut + app-barcode anti-duplikat"
```

### Task 3: Thumbnail — storage helper, serve route, aksi upload/hapus

**Files:**
- Modify: `src/server/storage/storage.ts`, `src/server/actions/inventory.actions.ts`
- Create: `src/app/api/inventory/[id]/photo/route.ts`
- Test: tambah case di `tests/integration/inventory-sku-image.test.ts` (validasi murni tanpa S3)

**Interfaces:**
- Consumes: `extForMime`, `getStorageConfig` (sudah ada di `storage.ts`).
- Produces: `putInventoryImage(orgId, itemId, file)`, `MAX_INVENTORY_IMAGE_BYTES = 500*1024`,
  `validateInventoryImage(buffer, mime)`, aksi `updateItemImageAction(itemId, formData)`,
  `deleteItemImageAction(itemId)`, GET `/api/inventory/[id]/photo`.

- [ ] **Step 1: Tulis test validasi murni (gagal dulu)**

Tambah di `tests/integration/inventory-sku-image.test.ts` (atau file unit baru
`tests/unit/inventory/image.test.ts` — pilih unit agar tanpa DB):

```ts
import { describe, it, expect } from "vitest";
import { validateInventoryImage, MAX_INVENTORY_IMAGE_BYTES } from "@/server/storage/storage";

describe("validateInventoryImage", () => {
  it("menerima jpeg kecil", () => {
    expect(() => validateInventoryImage(Buffer.alloc(100), "image/jpeg")).not.toThrow();
  });
  it("menolak pdf", () => {
    expect(() => validateInventoryImage(Buffer.alloc(100), "application/pdf")).toThrow(/MIME/);
  });
  it("menolak lebih dari 500KB", () => {
    expect(() =>
      validateInventoryImage(Buffer.alloc(MAX_INVENTORY_IMAGE_BYTES + 1), "image/png"),
    ).toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test, pastikan gagal**

Run: `bun x vitest run tests/unit/inventory/image.test.ts`
Expected: FAIL modul/fungsi belum ada.

- [ ] **Step 3: Implementasi di `src/server/storage/storage.ts`**

Tambah setelah `putDocument`:

```ts
export const MAX_INVENTORY_IMAGE_BYTES = 500 * 1024;

const INVENTORY_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateInventoryImage(buffer: Buffer, mime: string): void {
  if (!(INVENTORY_IMAGE_MIMES as readonly string[]).includes(mime)) {
    throw new Error("MIME_TIDAK_DIDUKUNG: foto barang harus JPG, PNG, atau WebP");
  }
  if (buffer.length > MAX_INVENTORY_IMAGE_BYTES) {
    throw new Error("FOTO_KEBESARAN: ukuran foto maksimal 500 KB");
  }
}

export async function putInventoryImage(
  orgId: string,
  itemId: string,
  file: { buffer: Buffer; mime: string },
): Promise<{ storageKey: string }> {
  validateInventoryImage(file.buffer, file.mime);
  const key = `orgs/${orgId}/inventory/${itemId}/${randomUUID()}${extForMime(file.mime)}`;
  const c = getStorageConfig();
  await client().send(new PutObjectCommand({
    Bucket: c.bucket, Key: key, Body: file.buffer, ContentType: file.mime,
  }));
  return { storageKey: key };
}
```

- [ ] **Step 4: Run test validasi, pastikan hijau**

Run: `bun x vitest run tests/unit/inventory/image.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Route serve foto per-org `src/app/api/inventory/[id]/photo/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInventoryItem } from "@/server/db/repos/inventory.repo";
import { getDocument } from "@/server/storage/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const item = await getInventoryItem(db, ctx.orgId, id);
  if (!item?.imageStorageKey) {
    return NextResponse.json({ error: "Foto tidak ada." }, { status: 404 });
  }
  const buf = await getDocument(item.imageStorageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": item.imageMime ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
```

- [ ] **Step 6: Aksi upload/hapus di `inventory.actions.ts`**

Tambah import: `putInventoryImage, deleteDocument, validateInventoryImage, MAX_INVENTORY_IMAGE_BYTES`
dari `@/server/storage/storage`, dan `eq` dari `drizzle-orm` + `inventoryItems` dari skema.
Lalu tambah dua aksi di akhir file:

```ts
export async function updateItemImageAction(itemId: string, formData: FormData) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "File foto wajib diisi" };
    }
    if (file.size > MAX_INVENTORY_IMAGE_BYTES) {
      return { ok: false, error: "Ukuran foto maksimal 500 KB (kompres dulu di form)" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      validateInventoryImage(buffer, file.type);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Foto tidak valid" };
    }
    const res = await withOrg(ctx.orgId, async (tx) => {
      const items = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, itemId))
        .limit(1);
      const current = items[0];
      if (!current || current.orgId !== ctx.orgId) throw new Error("ITEM_TIDAK_DITEMUKAN");
      const { storageKey } = await putInventoryImage(ctx.orgId, itemId, { buffer, mime: file.type });
      const [updated] = await tx
        .update(inventoryItems)
        .set({ imageStorageKey: storageKey, imageMime: file.type, updatedAt: new Date() })
        .where(eq(inventoryItems.id, itemId))
        .returning();
      return { updated, oldKey: current.imageStorageKey };
    });
    if (res.oldKey) {
      try { await deleteDocument(res.oldKey); } catch { /* best-effort */ }
    }
    revalidatePath("/persediaan/daftar");
    revalidatePath(`/persediaan/daftar/${itemId}`);
    return { ok: true, item: res.updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan foto";
    return { ok: false, error: message };
  }
}

export async function deleteItemImageAction(itemId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const oldKey = await withOrg(ctx.orgId, async (tx) => {
      const items = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, itemId))
        .limit(1);
      const current = items[0];
      if (!current || current.orgId !== ctx.orgId) throw new Error("ITEM_TIDAK_DITEMUKAN");
      await tx
        .update(inventoryItems)
        .set({ imageStorageKey: null, imageMime: null, updatedAt: new Date() })
        .where(eq(inventoryItems.id, itemId));
      return current.imageStorageKey;
    });
    if (oldKey) {
      try { await deleteDocument(oldKey); } catch { /* best-effort */ }
    }
    revalidatePath("/persediaan/daftar");
    revalidatePath(`/persediaan/daftar/${itemId}`);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menghapus foto";
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `bun x tsc --noEmit`
Expected: PASS.

```bash
git add src/server/storage/storage.ts src/app/api/inventory/ src/server/actions/inventory.actions.ts tests/unit/inventory/image.test.ts
git commit -m "feat(persediaan): thumbnail barang 500KB + serve route + aksi upload"
```

### Task 4: Split routes + sidebar + redirect + label

**Files:**
- Move (git mv): `src/app/(app)/persediaan/page.tsx`, `persediaan-client.tsx` → `daftar/`;
  `baru/` → `daftar/baru/`; `[id]/` → `daftar/[id]/`.
- Modify: `src/app/(app)/persediaan/page.tsx` (baru, redirect), semua Link/router/back-link,
  `src/components/sidebar-nav.tsx`, `src/lib/assistant-context.ts`, `inventory.actions.ts` revalidate sisa.
- Test: `tests/e2e/persediaan.spec.ts` (navigasi + redirect).

**Interfaces:**
- Consumes: hasil Task 2–3 (tidak ada dependensi kode, hanya path).
- Produces: URL final `/persediaan/daftar/**`, `/persediaan/opname/**`, redirect permanen URL lama.

- [ ] **Step 1: Pindahkan file dengan git mv**

```bash
mkdir -p "src/app/(app)/persediaan/daftar"
git mv "src/app/(app)/persediaan/page.tsx" "src/app/(app)/persediaan/daftar/page.tsx"
git mv "src/app/(app)/persediaan/persediaan-client.tsx" "src/app/(app)/persediaan/daftar/persediaan-client.tsx"
git mv "src/app/(app)/persediaan/baru" "src/app/(app)/persediaan/daftar/baru"
git mv "src/app/(app)/persediaan/[id]" "src/app/(app)/persediaan/daftar/[id]"
```

Opname tidak pindah (sudah di `/persediaan/opname/...`).

- [ ] **Step 2: `page.tsx` lama menjadi redirect + update import client**

Tulis ulang `src/app/(app)/persediaan/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function PersediaanRedirect() {
  redirect("/persediaan/daftar");
}
```

Di `src/app/(app)/persediaan/daftar/page.tsx` ubah import menjadi `import { PersediaanClient } from "./persediaan-client";`
(jika hasil `git mv` masih menunjuk path lama — cek isi file; path relatif `./persediaan-client` tetap valid).

- [ ] **Step 3: Tulis test e2e gagal (redirect + sidebar)**

Buat `tests/e2e/persediaan.spec.ts` (pola `tests/e2e/kas-bank.spec.ts`; tunggu `networkidle` + hidrasi sebelum klik):

```ts
import { test, expect } from "@playwright/test";

test("persediaan redirect dan child menu", async ({ page }) => {
  await page.goto("/persediaan");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/persediaan\/daftar/);
  await expect(page.getByRole("heading", { name: /Persediaan/i }).first()).toBeVisible();
});

test("sidebar persediaan punya anak Daftar dan Opname", async ({ page }) => {
  await page.goto("/persediaan/daftar");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "Daftar Barang" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stok Opname" })).toBeVisible();
});
```

- [ ] **Step 4: Run e2e, pastikan gagal (sidebar belum diubah)**

Run: `bun run e2e tests/e2e/persediaan.spec.ts` (bunuh `:3000` basi dulu bila ada).
Expected: FAIL link "Daftar Barang" tidak ditemukan.

- [ ] **Step 5: Sidebar jadi parent + 2 anak**

Di `src/components/sidebar-nav.tsx`, ganti baris single-item persediaan:

```tsx
      { href: "/persediaan", label: "Persediaan & Stok", icon: IconInventory, match: (p: string) => p.startsWith("/persediaan") },
```

menjadi:

```tsx
      {
        href: "/persediaan/daftar",
        label: "Persediaan & Stok",
        icon: IconInventory,
        match: (p: string) => p.startsWith("/persediaan"),
        children: [
          { href: "/persediaan/daftar", label: "Daftar Barang" },
          { href: "/persediaan/opname", label: "Stok Opname" },
        ],
      },
```

- [ ] **Step 6: Update semua Link/router/back-link lama**

Cari `"/persediaan"` (daftar hasil grep awal): di file-file berikut ganti ke path baru —
`daftar/persediaan-client.tsx` (`/persediaan/opname` tetap; `/persediaan/baru` → `/persediaan/daftar/baru`;
`/persediaan/${item.id}` → `/persediaan/daftar/${item.id}`), `daftar/baru/item-baru-client.tsx`
(`router.push("/persediaan")` → `/persediaan/daftar`; back-link; link batch),
`daftar/baru/batch/batch-item-client.tsx` (sama), `daftar/[id]/page.tsx` (back-link → `/persediaan/daftar`),
`opname/page.tsx` (back-link → `/persediaan/daftar`), `opname/baru/opname-form-client.tsx`
(sudah benar ke `/persediaan/opname/...`, biarkan).
Redirect kompatibilitas: buat `src/app/(app)/persediaan/daftar/[...legacy]/page.tsx`? TIDAK —
cukup redirect eksplisit per URL lama yang masih dirujuk eksternal: buat file
`src/app/(app)/persediaan/baru/page.tsx` berisi `redirect("/persediaan/daftar/baru")`?
`git mv` menghapus folder lama sehingga import lama 404. Sederhananya: tambahkan di `next.config`?
Cek apakah repo punya redirects — jika tidak, buat dua file redirect kecil:
`src/app/(app)/persediaan/baru/page.tsx` dan `src/app/(app)/persediaan/[id]/page.tsx` tidak bisa
koeksis dengan folder pindahan (nama bentrok tidak terjadi karena folder lama sudah pindah).
Buat:
- `src/app/(app)/persediaan/baru/page.tsx`: `redirect("/persediaan/daftar/baru")`
- `src/app/(app)/persediaan/baru/batch/page.tsx`: `redirect("/persediaan/daftar/baru/batch")`
- `src/app/(app)/persediaan/[id]/page.tsx`: `redirect("/persediaan/daftar/[id]")` — TIDAK BISA
  (butuh id). Gunakan segmen dinamis: file `src/app/(app)/persediaan/[id]/page.tsx` dengan
  `params` lalu `redirect(`/persediaan/daftar/${id}`)`. Itu valid.

- [ ] **Step 7: Update PATH_LABELS asisten + revalidate sisa**

Di `src/lib/assistant-context.ts` ganti tiga key persediaan:

```ts
  "/persediaan/daftar/baru/batch": "Input Cepat Persediaan (Grid / Batch)",
  "/persediaan/daftar/baru": "Tambah Barang Persediaan",
  "/persediaan/daftar": "Katalog & Mutasi Persediaan",
  "/persediaan/opname": "Sesi Stok Opname",
```

Hapus key `"/persediaan"` lama. Prefix-match (`startsWith`) tetap melabeli `/persediaan/daftar/[id]` dengan benar.
Di `inventory.actions.ts`, sisa `revalidatePath("/persediaan/opname")` dan
`` `/persediaan/opname/${opnameId}` `` biarkan; pastikan tidak ada `revalidatePath("/persediaan")`
tanpa pasangan `/persediaan/daftar` (Task 2 sudah menambah untuk create; tambah juga di
`postOpnameAdjustmentAction` dan `updateInventorySettingsAction`).

- [ ] **Step 8: Run e2e, pastikan hijau**

Run: `bun run e2e tests/e2e/persediaan.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/persediaan src/components/sidebar-nav.tsx src/lib/assistant-context.ts src/server/actions/inventory.actions.ts tests/e2e/persediaan.spec.ts
git commit -m "feat(persediaan): split child-menu Daftar Barang + Stok Opname"
```

### Task 5: UI barang — kompres util, form Generate + foto, tabel, detail + barcode

**Files:**
- Create: `src/lib/compress-image.ts`, `src/components/inventory/app-barcode.tsx`
- Modify: `daftar/baru/item-baru-client.tsx`, `daftar/persediaan-client.tsx`, `daftar/[id]/page.tsx`
- Test: e2e tambah case tambah-barang (di file Task 4)

**Interfaces:**
- Consumes: `updateItemImageAction`, `deleteItemImageAction`, `nextSkuCodes` (via aksi baru di bawah),
  GET `/api/inventory/[id]/photo`.
- Produces: form dengan tombol Generate + uploader terkompres; tabel kolom Foto; detail foto + barcode SVG.

- [ ] **Step 1: Install jsbarcode**

Run: `bun add jsbarcode` lalu `bun add -d @types/jsbarcode`.
Verifikasi: `bun x tsc --noEmit` tetap hijau (jika `@types/jsbarcode` tak ada, pakai
`import JsBarcode from "jsbarcode"` dengan `// @ts-expect-error`? TIDAK — tanpa `any` dan tanpa
expect-error: alternatif tanpa dep adalah render teks mono saja. Putuskan saat eksekusi:
jika types bermasalah, fallback teks mono + coret komponen SVG dari plan dengan commit message jelas.)

- [ ] **Step 2: Util kompres `src/lib/compress-image.ts`**

```ts
/** Kompres gambar di browser hingga <= maxBytes. Tanpa dep tambahan. */
export async function compressImageToLimit(
  file: File,
  maxBytes = 500 * 1024,
): Promise<{ blob: Blob; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("Browser tidak mendukung kanvas");
  ctx2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= maxBytes) return { blob, mime: "image/jpeg" };
  }
  throw new Error("Foto melebihi 500 KB walau sudah dikompres");
}
```

- [ ] **Step 3: Aksi Generate saran kode (server)**

Di `inventory.actions.ts` tambah:

```ts
export async function suggestSkuAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { nextSkuCodes } = await import("@/server/db/repos/inventory-sku");
    const { db } = await import("@/server/db");
    const s = await db.transaction((tx) => nextSkuCodes(tx as never, ctx.orgId));
    return { ok: true, ...s };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal generate kode" };
  }
}
```

Catatan: saran bisa diklaim transaksi lain sebelum disimpan — itu OK karena simpan memakai
nomor segar lagi bila field dikosongkan; bila user memakai saran dan bentrok, pesan
`SKU_SUDAH_DIPAKAI` yang bicara (Task 2). Tulis catatan ini sebagai helper text di form,
bukan error.

- [ ] **Step 4: Form `item-baru-client.tsx` — tombol Generate + uploader foto**

  - Field Kode SKU: tambah tombol "Generate" yang memanggil `suggestSkuAction` lalu
    `setFormData({ ...formData, code: res.code })`; placeholder tambah "(kosongkan = otomatis)".
    Hapus `required` pada input code (nama tetap required).
  - Field App-barcode baru (opsional, tombol Generate mengisi `appBarcode` dari saran yang sama).
  - Section foto: `<input type="file" accept="image/jpeg,image/png,image/webp">` +
    pratinjau `<img>` + status. Saat submit sukses (`createItemAction` ok dengan `res.item.id`):
    jika ada file, kompres via `compressImageToLimit`, kirim `FormData` ke
    `updateItemImageAction(item.id, fd)`; gagal foto → tampilkan warning non-blokir
    "Barang tersimpan, foto gagal: {error}". Perlu `createItemAction` mengembalikan `item.id`
    (sudah: `return { ok: true, item }`).
  - Copy Bahasa Indonesia; error memakai `role="alert"` seperti existing.

- [ ] **Step 5: Tabel `persediaan-client.tsx` — kolom Foto + App-barcode**

  - Tambah `<th>Foto</th>` pertama + sel `<img src={`/api/inventory/${item.id}/photo`} loading="lazy"
    className="size-8 rounded-lg object-cover border border-rule" onError={hide} />` dengan fallback
    ikon `Package` bila `!item.imageStorageKey` (prop `initialData.items` sekarang membawa
    `imageStorageKey`; pastikan `listInventoryItems` select-all sudah mencakupnya — ya, select * ).
  - Di bawah `Barcode: {item.barcode}` tambah baris `App: {item.appBarcode ?? "-"}`.
  - Search ikut `appBarcode`: tambah `it.appBarcode?.toLowerCase().includes(...)`.

- [ ] **Step 6: Komponen barcode + detail `daftar/[id]/page.tsx`**

Buat `src/components/inventory/app-barcode.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function AppBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      JsBarcode(ref.current, value, { format: "CODE128", height: 48, displayValue: true, fontSize: 12 });
    }
  }, [value]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className="max-w-full" />;
}
```

Di `daftar/[id]/page.tsx`: tambah blok identitas — foto (`/api/inventory/${id}/photo`, 240px,
fallback teks "Belum ada foto"), tiga kode (`code`, `appBarcode ?? "-"`, `barcode pabrik ?? "-"`),
dan `<AppBarcode value={item.appBarcode} />` hanya bila ada. Tambah section upload:
form client kecil (file input + tombol Simpan Foto + Hapus) memanggil aksi Task 3.
Back-link sudah `/persediaan/daftar` (Task 4).

- [ ] **Step 7: Typecheck + build + commit**

Run: `bun x tsc --noEmit` lalu `bun run build`.
Expected: keduanya hijau.

```bash
git add src/lib/compress-image.ts src/components/inventory/ "src/app/(app)/persediaan/daftar" src/server/actions/inventory.actions.ts
git commit -m "feat(persediaan): form Generate SKU + foto kompres + barcode visual"
```

### Task 6: Batch grid + sisa rujukan opname (rapian kecil)

**Files:**
- Modify: `daftar/baru/batch/batch-item-client.tsx`, `daftar/baru/batch/page.tsx` (cek back-link),
  `opname/baru/page.tsx` (tambah appBarcode di mapping items bila dipakai), `src/components/assistant-widget.tsx` (cek path, hanya baca)

**Interfaces:**
- Consumes: repo auto-generate (Task 2).
- Produces: batch membolehkan code kosong; tidak ada link mati.

- [ ] **Step 1: Batch membolehkan code kosong + kolom app-barcode**

Di `BatchRow` tambah `appBarcode: string`; `DEFAULT_ROWS` dan `addRow` ikut tambah `appBarcode: ""`.
Kolom grid tambah "App-barcode (opsional)". Submit: teruskan `appBarcode: r.appBarcode || undefined`
dan `code: r.code || undefined`; validasi baris: nama wajib, code boleh kosong. Tipe
`createBatchItemsAction` di Task 2 sudah longgar untuk code kosong.

- [ ] **Step 2: Sapu link mati**

Grep `"/persediaan"` di `src/` dan pastikan tiap hasil menunjuk path baru atau redirect yang dibuat
di Task 4. Perbaiki yang terlewat. `assistant-widget.tsx` baris 371 hanya `includes("/persediaan")`
— biarkan (tetap cocok untuk path baru).

- [ ] **Step 3: Typecheck + commit**

Run: `bun x tsc --noEmit`. Expected: hijau.

```bash
git add "src/app/(app)/persediaan" src/components/assistant-widget.tsx
git commit -m "chore(persediaan): batch longgar + sapu link lama"
```

### Task 7: Asisten — foto opt-in manual via `imageDocumentId`

**Files:**
- Modify: `src/server/ai/nara.ts`, `src/server/ai/tools/inventory.tools.ts`,
  `src/app/api/nara/chat/confirm/route.ts`
- Test: tambah case handler di `tests/integration/inventory-sku-image.test.ts` dengan guard
  `SKIP_STORAGE_TESTS` (pola: skip bila S3 tak terjangkau)

**Interfaces:**
- Consumes: `createDocumentRow` (`documents.repo`), `putDocument`/`getDocument` (storage),
  `putInventoryImage` (Task 3), `createInventoryItem` auto-SKU (Task 2).
- Produces: tool `add_inventory_item` param opsional `imageDocumentId`; tanpa konfirmasi foto tidak dipakai.

- [ ] **Step 1: Persist lampiran di `askNara` + sertakan id di prompt**

Di `src/server/ai/nara.ts`, setelah `await db.transaction((tx) => addMessage(...user...))`
dan sebelum bangun prompt, tambah (ganti persist yang kini hanya terjadi di branch
`create_journal_draft` — branch itu biarkan apa adanya agar perilaku jurnal tak berubah;
persist baru khusus untuk kebutuhan foto):

```ts
  let attachmentId: string | null = null;
  let attachmentMime: string | null = null;
  if (opts?.document) {
    try {
      const { putDocument } = await import("@/server/storage/storage");
      const { createDocumentRow } = await import("@/server/db/repos/documents.repo");
      const buffer = Buffer.from(opts.document.dataBase64, "base64");
      const { storageKey } = await putDocument(orgId, { buffer, mime: opts.document.mime });
      const docRow = await db.transaction((tx) =>
        createDocumentRow(tx, { orgId, storageKey, mime: opts.document!.mime, sizeBytes: buffer.length }),
      );
      attachmentId = docRow.id;
      attachmentMime = opts.document.mime;
    } catch (e) {
      console.warn("akunio attachment persist failed", e);
    }
  }
```

Di `fullPrompt`, setelah baris lampiran existing, tambah:

```
${attachmentId ? `(Lampiran tersimpan sebagai dokumen id ${attachmentId}, tipe ${attachmentMime}. Jika user minta tambah barang DAN menyetujui foto ini sebagai thumbnail, teruskan id tersebut sebagai imageDocumentId pada add_inventory_item. Tanpa persetujuan eksplisit, JANGAN isi imageDocumentId. Jika ada beberapa lampiran dalam riwayat, tanyakan dulu pakai yang mana.)` : ""}
```

Dan di `systemInstruction` tambah satu bullet:

```
- Jika user menambah barang persediaan sambil melampirkan foto, TAWARKAN dulu menjadikan foto sebagai thumbnail; hanya teruskan imageDocumentId bila user menjawab ya.
```

- [ ] **Step 2: Tool def + handler `inventory.tools.ts`**

Di def `add_inventory_item` tambah properti:

```ts
        imageDocumentId: { type: "string", description: "ID dokumen foto dari lampiran chat untuk dijadikan thumbnail. Hanya isi bila user eksplisit menyetujui. Foto >500KB akan ditolak dengan pesan." },
```

`required` tetap `["code", "name"]` → ubah menjadi `["name"]` (code auto, Task 2).
Sama untuk tiap item `batch_add_inventory_items`: `required: ["code", "name"]` → `["name"]`.

Di handler `add_inventory_item`, setelah `code`/`name` dibaca, longgarkan code:

```ts
      const code = String(args.code ?? "").trim().toUpperCase();
      const name = String(args.name ?? "").trim();
      if (!name) {
        return { success: false, error: "Nama Barang wajib diisi." };
      }
```

Teruskan `appBarcode: args.appBarcode ? String(args.appBarcode) : undefined` ke `createInventoryItem`
(code kosong diteruskan agar repo auto-generate).

Setelah item dibuat, tangani foto (barang tetap ada walau foto gagal):

```ts
      const imageDocumentId = args.imageDocumentId ? String(args.imageDocumentId) : "";
      let photoWarning: string | undefined;
      if (imageDocumentId) {
        try {
          const { getDocument, putInventoryImage } = await import("@/server/storage/storage");
          const { documents } = await import("@/server/db/schema/ai");
          const { db } = await import("@/server/db");
          const { eq, and } = await import("drizzle-orm");
          const rows = await db
            .select()
            .from(documents)
            .where(and(eq(documents.id, imageDocumentId), eq(documents.orgId, orgId)))
            .limit(1);
          const doc = rows[0];
          if (!doc) throw new Error("Dokumen foto tidak ditemukan.");
          const buf = await getDocument(doc.storageKey);
          const { storageKey } = await putInventoryImage(orgId, item.id, { buffer: buf, mime: doc.mime });
          const { inventoryItems } = await import("@/server/db/schema/inventory");
          await withOrg(orgId, async (tx) => {
            await tx
              .update(inventoryItems)
              .set({ imageStorageKey: storageKey, imageMime: doc.mime, updatedAt: new Date() })
              .where(eq(inventoryItems.id, item.id));
          });
        } catch (e) {
          photoWarning = e instanceof Error ? e.message : "Foto gagal dipakai";
        }
      }
```

Kembalikan `photoWarning` bila ada + sertakan `appBarcode` di data respons.
Untuk batch handler: terapkan pelonggaran `code` yang sama (nama wajib; code kosong = auto),
tanpa dukungan foto (pesan di deskripsi tool sudah menyebut upload manual).

- [ ] **Step 3: Teks konfirmasi khusus di `confirm/route.ts`**

Tambah branch setelah `create_invoice`:

```ts
    } else if (toolName === "add_inventory_item") {
      const iData = execution.data as { code?: string; name?: string; photoWarning?: string };
      confirmationText = `Barang ${iData?.name ?? ""} (${iData?.code ?? ""}) berhasil didaftarkan ke master persediaan.`;
      if (iData?.photoWarning) {
        confirmationText += ` Catatan foto: ${iData.photoWarning} — buka detail barang untuk upload versi ≤500 KB.`;
      }
    } else if (toolName === "batch_add_inventory_items") {
      const bData = execution.data as { insertedCount?: number };
      confirmationText = `Berhasil mendaftarkan ${bData?.insertedCount ?? 0} barang ke katalog persediaan.`;
    }
```

- [ ] **Step 4: Test handler (dengan guard storage)**

Tambah case di `tests/integration/inventory-sku-image.test.ts`:

```ts
  it("add_inventory_item via tool tanpa foto tetap sukses + auto SKU", async () => {
    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    const res = await inventoryHandlers["add_inventory_item"](orgId, "tester@test.id", {
      name: "Barang Asisten",
    });
    expect(res.success).toBe(true);
    expect((res.data as { code: string }).code).toMatch(/^BRG-/);
  });

  it("imageDocumentId tak valid menghasilkan photoWarning, barang tetap ada", async () => {
    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    const res = await inventoryHandlers["add_inventory_item"](orgId, "tester@test.id", {
      name: "Barang Foto Rusak",
      imageDocumentId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.success).toBe(true);
    expect((res.data as { photoWarning?: string }).photoWarning).toBeDefined();
  });
```

Run: `bun x vitest run tests/integration/inventory-sku-image.test.ts`
Expected: semua PASS (tanpa S3 karena jalur error tak menyentuh S3).

- [ ] **Step 5: Typecheck + commit**

Run: `bun x tsc --noEmit`. Expected: hijau.

```bash
git add src/server/ai/nara.ts src/server/ai/tools/inventory.tools.ts "src/app/api/nara/chat/confirm/route.ts" tests/integration/inventory-sku-image.test.ts
git commit -m "feat(asisten): foto lampiran jadi thumbnail persediaan via opt-in"
```

### Task 8: Verifikasi penuh + e2e tambah-barang

**Files:**
- Modify: `tests/e2e/persediaan.spec.ts` (tambah case)
- Test: full suite

**Interfaces:**
- Consumes: semua task. Produces: repo hijau + bukti run.

- [ ] **Step 1: Tambah case e2e tambah barang**

Tambah di `tests/e2e/persediaan.spec.ts`:

```ts
test("tambah barang dengan Generate SKU", async ({ page }) => {
  await page.goto("/persediaan/daftar/baru");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Nama Barang/i).fill("Kertas HVS A4 E2E");
  await page.getByRole("button", { name: /Generate/i }).first().click();
  await page.getByRole("button", { name: /Simpan Barang/i }).first().click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/persediaan\/daftar/);
  await expect(page.getByText("Kertas HVS A4 E2E").first()).toBeVisible();
});
```

Sesuaikan selektor dengan label final Task 5 (nama persis boleh beda; yang penting stabil + `data-testid`
bila label ambigu — tambah `data-testid="persediaan-nama"`, `persediaan-generate-sku`,
`persediaan-simpan` di form Task 5 dan pakai di spec ini).

- [ ] **Step 2: Full verification berurutan**

Run berurutan (bunuh `:3000` basi dulu):

```bash
bun x tsc --noEmit
bun run build
bun run test
bun run e2e
```

Expected: semua hijau. Jika `bun run test` merah di suite tak terkait, buktikan dengan
`git stash` bahwa merah sudah ada sebelum perubahan (jangan perbaiki unrelated).

- [ ] **Step 3: Commit final**

```bash
git add tests/e2e/persediaan.spec.ts
git commit -m "test(persediaan): e2e tambah barang + verifikasi penuh"
```

## Self-Review

**1. Spec coverage:** §1 navigasi → Task 4 (sidebar, pindahan, redirect, label). §2 SKU/barcode → Task 2
(generator, validasi, unique) + Task 5 (Generate, tabel, barcode visual) + Task 6 (batch).
§3 thumbnail → Task 3 (storage/route/aksi/validasi) + Task 5 (kompres/form/tabel/detail).
§4 asisten → Task 7 (persist, prompt, tool, konfirmasi). §5 migrasi/RLS/testing → Task 1 + Task 8.
Non-tujuan dihormati: tanpa tabel `inventory_images`, tanpa `sharp`, tanpa backfill massal,
tanpa scanner hardware.

**2. Placeholder scan:** tidak ada TBD/TODO; semua langkah berisi perintah/file/kode aktual;
angka konkret (500KB, 1024px, quality 0.9→0.5, range 20000000, `BRG-%04d`) disalin dari spec.

**3. Type consistency:** `nextSkuCodes(q, orgId)` dipakai konsisten di repo/aksi; nama kolom
Drizzle `appBarcode/imageStorageKey/imageMime` ↔ SQL `app_barcode/image_storage_key/image_mime`;
`putInventoryImage(orgId, itemId, {buffer, mime})`; aksi `{ ok, item } / { ok, error }`;
tool data `{ code, name, photoWarning }` dibaca confirm route dengan nama sama.
