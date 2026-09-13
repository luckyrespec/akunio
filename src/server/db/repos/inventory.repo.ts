import { and, asc, desc, eq, ilike, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Queryable } from "./queryable";
import {
  inventorySettings,
  inventoryItems,
  inventoryLayers,
  inventoryTransactions,
  stockOpnames,
  stockOpnameItems,
} from "../schema/inventory";
import { invoiceItems, invoices } from "../schema/invoicing";
import { accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import { createDraftJournalEntry, toMinor } from "./journals.repo";
import { nextSkuCodes } from "./inventory-sku";
import { findPeriodByDate } from "./periods.repo";
import { calculateStockDifference } from "@/core/inventory/valuation";
import { isRagTenantIndexingEnabled } from "@/server/ai/rag-worker";

export interface CreateItemInput {
  code?: string;
  itemType?: "BARANG" | "JASA";
  revenueAccountId?: string | null;
  expenseAccountId?: string | null;
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

function qtyToDb(qty: number): string {
  return String(qty);
}

function costForQty(unitCostMinor: bigint, qty: number): bigint {
  const absQty = Math.abs(qty);
  return (unitCostMinor * BigInt(Math.round(absQty * 10000))) / 10000n;
}

/** drizzle membungkus pg error sebagai "Failed query: ..." dengan cause berantai —
 *  nama constraint ada di cause, bukan message luar. */
function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur instanceof Error; i++) {
    parts.push(cur.message);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.join("\n");
}

export async function getInventorySettings(q: Queryable, orgId: string) {
  const [row] = await q
    .select()
    .from(inventorySettings)
    .where(eq(inventorySettings.orgId, orgId))
    .limit(1);
  return row ?? null;
}

/**
 * Kunci kebijakan metode (WAC/FIFO, perpetual/periodik).
 * Idempoten; tidak melempar bila settings belum ada.
 * Dipanggil saat mutasi stok operasional POSTED pertama (jual/beli/opname),
 * dibuka lagi oleh tutup tahun (closePeriod isYearEnd).
 */
export async function lockInventoryPolicy(q: Queryable, orgId: string): Promise<void> {
  await q.update(inventorySettings)
    .set({ isLocked: true })
    .where(and(eq(inventorySettings.orgId, orgId), eq(inventorySettings.isLocked, false)));
}

export async function upsertInventorySettings(
  q: Queryable,
  orgId: string,
  data: Partial<typeof inventorySettings.$inferInsert>,
) {
  const existing = await getInventorySettings(q, orgId);
  if (existing) {
    if (existing.isLocked && (data.valuationMethod || data.recordingMethod)) {
      throw new Error("KEBIJAKAN_TERKUNCI: Metode penilaian/pencatatan tidak dapat diubah di periode aktif");
    }
    const [updated] = await q
      .update(inventorySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inventorySettings.id, existing.id))
      .returning();
    return updated;
  }

  const [inserted] = await q
    .insert(inventorySettings)
    .values({
      orgId,
      valuationMethod: data.valuationMethod ?? "WEIGHTED_AVERAGE",
      recordingMethod: data.recordingMethod ?? "PERPETUAL",
      cogsAccountId: data.cogsAccountId,
      adjustmentLossAccountId: data.adjustmentLossAccountId,
      adjustmentGainAccountId: data.adjustmentGainAccountId,
    })
    .returning();
  return inserted;
}

export async function listInventoryItems(q: Queryable, orgId: string) {
  return q
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.isActive, true)))
    .orderBy(desc(inventoryItems.createdAt));
}

export async function listServiceItems(q: Queryable, orgId: string) {
  return q
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.orgId, orgId),
        eq(inventoryItems.isActive, true),
        eq(inventoryItems.itemType, "JASA"),
      ),
    )
    .orderBy(desc(inventoryItems.createdAt));
}

export async function listArchivedServiceItems(q: Queryable, orgId: string) {
  return q
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.orgId, orgId),
        eq(inventoryItems.isActive, false),
        eq(inventoryItems.itemType, "JASA"),
      ),
    )
    .orderBy(desc(inventoryItems.createdAt));
}

export async function getInventoryItem(q: Queryable, orgId: string, itemId: string) {
  const [item] = await q
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
    .limit(1);
  return item ?? null;
}

export interface UpdateItemInput {
  name: string;
  category?: string | null;
  unit?: string;
  minStockAlert?: string;
  standardSellingPriceMinor?: bigint;
  barcode?: string | null;
}

/** Ubah field master yang aman. Terkunci: kode SKU, barcode app, stok, harga modal.
 *  Harga modal hanya bergerak via pembelian/opname, bukan edit langsung. */
export async function updateInventoryItem(
  q: Queryable,
  orgId: string,
  itemId: string,
  input: UpdateItemInput,
) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("NAMA_BARANG_MINIMAL_2_HURUF");
  const minStockAlert = input.minStockAlert?.trim() || "0";
  if (!/^\d+(\.\d+)?$/.test(minStockAlert)) {
    throw new Error("MIN_STOK_TIDAK_VALID: harus angka >= 0");
  }
  const selling = input.standardSellingPriceMinor ?? 0n;
  if (selling < 0n) throw new Error("HARGA_JUAL_TIDAK_VALID: harus >= 0");
  const [updated] = await q
    .update(inventoryItems)
    .set({
      name,
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || "Pcs",
      minStockAlert,
      standardSellingPriceMinor: selling,
      barcode: input.barcode?.trim() || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryItems.orgId, orgId),
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.itemType, "BARANG"),
      ),
    )
    .returning({ id: inventoryItems.id });
  if (!updated) throw new Error("BARANG_TIDAK_DITEMUKAN");
  return updated;
}

export interface UpdateServiceInput {
  name: string;
  category?: string | null;
  unit?: string;
  standardSellingPriceMinor?: bigint;
  revenueAccountId?: string | null;
  expenseAccountId?: string | null;
}

/** Ubah jasa. Terkunci: kode. Akun yang diisi harus milik org dengan tipe tepat
 *  (pendapatan∈PENDAPATAN, beban∈BEBAN); null = kembali ke akun default. */
export async function updateServiceItem(
  q: Queryable,
  orgId: string,
  itemId: string,
  input: UpdateServiceInput,
) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("NAMA_JASA_MINIMAL_2_HURUF");
  const selling = input.standardSellingPriceMinor ?? 0n;
  if (selling < 0n) throw new Error("HARGA_JUAL_TIDAK_VALID: harus >= 0");
  for (const [accountId, expected, label] of [
    [input.revenueAccountId, "PENDAPATAN", "pendapatan"],
    [input.expenseAccountId, "BEBAN", "beban"],
  ] as const) {
    if (!accountId) continue;
    const [acc] = await q
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
      .limit(1);
    if (!acc) throw new Error(`AKUN_${label.toUpperCase()}_TIDAK_DITEMUKAN`);
    if (acc.type !== expected) {
      throw new Error(`AKUN_${label.toUpperCase()}_TIPE_SALAH: harus akun ${expected}`);
    }
  }
  const [updated] = await q
    .update(inventoryItems)
    .set({
      name,
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || "Sesi",
      standardSellingPriceMinor: selling,
      revenueAccountId: input.revenueAccountId ?? null,
      expenseAccountId: input.expenseAccountId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryItems.orgId, orgId),
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.itemType, "JASA"),
      ),
    )
    .returning({ id: inventoryItems.id });
  if (!updated) throw new Error("JASA_TIDAK_DITEMUKAN");
  return updated;
}

/** Riwayat harga modal dari lapis masuk (saldo awal, pembelian, penyesuaian),
 *  kronologis menaik untuk chart. Rata-rata historis tidak direkonstruksi. */
export async function listItemCostHistory(
  q: Queryable,
  orgId: string,
  itemId: string,
  limit = 100,
) {
  return q
    .select({
      id: inventoryLayers.id,
      date: inventoryLayers.date,
      referenceType: inventoryLayers.referenceType,
      initialQty: inventoryLayers.initialQty,
      unitCostMinor: inventoryLayers.unitCostMinor,
    })
    .from(inventoryLayers)
    .where(and(eq(inventoryLayers.orgId, orgId), eq(inventoryLayers.itemId, itemId)))
    .orderBy(asc(inventoryLayers.date), asc(inventoryLayers.createdAt))
    .limit(limit);
}

export async function listArchivedInventoryItems(q: Queryable, orgId: string) {
  return q
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.orgId, orgId),
        eq(inventoryItems.isActive, false),
        eq(inventoryItems.itemType, "BARANG"),
      ),
    )
    .orderBy(desc(inventoryItems.createdAt));
}

/** Arsipkan / aktifkan ulang barang. Guard arsip: stok harus nol dan barang
 *  tidak dirujuk faktur yang belum lunas/batal (mencakup DRAFT). Mengaktifkan
 *  ulang selalu boleh. Jasa memakai alur arsip jasa tersendiri. */
export async function setItemActive(
  q: Queryable,
  orgId: string,
  itemId: string,
  active: boolean,
) {
  const [item] = await q
    .select({
      id: inventoryItems.id,
      itemType: inventoryItems.itemType,
      currentQty: inventoryItems.currentQty,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
    .limit(1)
    .for("update");
  if (!item) throw new Error("BARANG_TIDAK_DITEMUKAN");
  if (item.itemType !== "BARANG") {
    throw new Error("HANYA_BARANG: jasa memakai alur arsip jasa");
  }
  if (!active) {
    if (Number(item.currentQty) !== 0) {
      throw new Error("STOK_MASIH_ADA: nolkan stok (jual/opname) sebelum mengarsipkan");
    }
    const refs = await q
      .select({ id: invoices.id })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
      .where(
        and(
          eq(invoices.orgId, orgId),
          eq(invoiceItems.catalogItemId, itemId),
          notInArray(invoices.status, ["PAID", "VOID"]),
        ),
      )
      .limit(1);
    if (refs.length > 0) {
      throw new Error(
        "MASIH_DIPAKAI_DOKUMEN_TERBUKA: barang dirujuk faktur yang belum lunas atau batal",
      );
    }
  }
  const [updated] = await q
    .update(inventoryItems)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
    .returning({ id: inventoryItems.id, isActive: inventoryItems.isActive });
  return updated ?? null;
}

export async function createInventoryItem(
  q: Queryable,
  orgId: string,
  input: CreateItemInput,
) {
  let code = input.code?.trim().toUpperCase() ?? "";
  let appBarcode = input.appBarcode?.trim() ?? "";
  const itemType = input.itemType ?? "BARANG";
  if (itemType === "JASA" && (input.initialQty ?? 0) > 0) {
    throw new Error("JASA_TANPA_STOK: jasa tidak punya stok awal");
  }
  if (!code || (itemType === "BARANG" && !appBarcode)) {
    const gen = await nextSkuCodes(q, orgId, itemType);
    if (!code) code = gen.code;
    if (!appBarcode && itemType === "BARANG") appBarcode = gen.appBarcode;
  }
  const name = input.name.trim();
  if (!code || !name) throw new Error("KODE_DAN_NAMA_WAJIB_DIISI");
  if (appBarcode && !/^[0-9]{1,16}$/.test(appBarcode)) {
    throw new Error("APP_BARCODE_TIDAK_VALID: hanya digit, maks 16 karakter");
  }
  const initialQty = itemType === "JASA" ? 0 : (input.initialQty ?? 0);
  if (!Number.isFinite(initialQty) || initialQty < 0) {
    throw new Error("STOK_AWAL_TIDAK_VALID: kuantitas harus >= 0");
  }
  const initialCostMinor = itemType === "JASA" ? 0n : (input.initialCostMinor ?? 0n);
  if (initialCostMinor < 0n) throw new Error("HARGA_MODAL_TIDAK_VALID");
  const totalCostMinor = costForQty(initialCostMinor, initialQty);

  let item: typeof inventoryItems.$inferSelect;
  try {
    [item] = await q
      .insert(inventoryItems)
      .values({
        orgId,
        code,
        itemType,
        revenueAccountId: input.revenueAccountId ?? null,
        expenseAccountId: input.expenseAccountId ?? null,
        name,
        barcode: input.barcode?.trim() || null,
        appBarcode: appBarcode || null,
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
    const msg = errorText(e);
    if (msg.includes("inventory_items_org_code_uq")) {
      throw new Error("SKU_SUDAH_DIPAKAI: kode SKU sudah terdaftar");
    }
    if (msg.includes("inventory_items_org_app_barcode_uq")) {
      throw new Error("APP_BARCODE_SUDAH_DIPAKAI: barcode app sudah terdaftar");
    }
    throw e;
  }

  if (initialQty > 0) {
    // Catat layer FIFO
    await q.insert(inventoryLayers).values({
      orgId,
      itemId: item.id,
      date: new Date().toISOString().slice(0, 10),
      initialQty: qtyToDb(initialQty),
      remainingQty: qtyToDb(initialQty),
      unitCostMinor: initialCostMinor,
      referenceType: "OPENING_BALANCE",
    });

    // Catat mutasi kartu stok
    await q.insert(inventoryTransactions).values({
      orgId,
      itemId: item.id,
      date: new Date().toISOString().slice(0, 10),
      type: "IN",
      qty: qtyToDb(initialQty),
      unitCostMinor: initialCostMinor,
      totalCostMinor,
      resultingQty: qtyToDb(initialQty),
      resultingTotalCostMinor: totalCostMinor,
      sourceType: "MANUAL",
      memo: "Saldo Awal Persediaan",
    });
  }

  return item;
}

export async function listItemTransactions(q: Queryable, orgId: string, itemId: string) {
  return q
    .select()
    .from(inventoryTransactions)
    .where(and(eq(inventoryTransactions.orgId, orgId), eq(inventoryTransactions.itemId, itemId)))
    .orderBy(desc(inventoryTransactions.createdAt));
}

export async function createStockOpname(
  q: Queryable,
  orgId: string,
  data: {
    opnameDate: string;
    notes?: string;
    items: Array<{
      itemId: string;
      physicalQty: number;
      reason?: string;
    }>;
  },
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.opnameDate)) {
    throw new Error("TANGGAL_OPNAME_TIDAK_VALID: gunakan format YYYY-MM-DD");
  }
  if (data.items.length === 0) throw new Error("ITEM_OPNAME_KOSONG");

  const year = data.opnameDate.slice(0, 4);
  // Kunci nomor opname per org-tahun agar count+1 tidak balapan.
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`opname:${orgId}:${year}`}))`);
  const [countRow] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(stockOpnames)
    .where(
      and(
        eq(stockOpnames.orgId, orgId),
        sql`left(${stockOpnames.number}, 8) = ${`OPN-${year}`}`,
      ),
    );
  const seq = (countRow?.count ?? 0) + 1;
  const number = `OPN-${year}-${String(seq).padStart(4, "0")}`;

  const [opname] = await q
    .insert(stockOpnames)
    .values({
      orgId,
      number,
      opnameDate: data.opnameDate,
      status: "DRAFT",
      notes: data.notes ?? null,
    })
    .returning();

  let totalDiffValueMinor = 0n;

  for (const it of data.items) {
    if (!Number.isFinite(it.physicalQty) || it.physicalQty < 0) {
      throw new Error("FISIK_TIDAK_VALID: kuantitas fisik harus angka >= 0");
    }
    const item = await getInventoryItem(q, orgId, it.itemId);
    if (!item) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${it.itemId}`);

    const sysQty = Number(item.currentQty);
    const unitCostMinor = item.averageCostMinor;
    const diff = calculateStockDifference(sysQty, it.physicalQty, unitCostMinor);
    totalDiffValueMinor += diff.differenceValueMinor;

    await q.insert(stockOpnameItems).values({
      opnameId: opname.id,
      itemId: item.id,
      systemQty: qtyToDb(sysQty),
      physicalQty: qtyToDb(it.physicalQty),
      differenceQty: qtyToDb(diff.differenceQty),
      unitCostMinor,
      differenceValueMinor: diff.differenceValueMinor,
      reason: it.reason ?? null,
    });
  }

  const [updated] = await q
    .update(stockOpnames)
    .set({ totalDifferenceValueMinor: totalDiffValueMinor })
    .where(eq(stockOpnames.id, opname.id))
    .returning();

  return updated;
}

export async function listStockOpnames(q: Queryable, orgId: string) {
  return q
    .select()
    .from(stockOpnames)
    .where(eq(stockOpnames.orgId, orgId))
    .orderBy(desc(stockOpnames.opnameDate), desc(stockOpnames.createdAt));
}

export type OpnameStatusFilter =
  | "ALL"
  | "DRAFT"
  | "REVIEW_DRAFT_JOURNAL"
  | "COMPLETED"
  | "CANCELLED";

function opnameListConds(orgId: string, opts: { search?: string; status?: OpnameStatusFilter }) {
  const conds = [eq(stockOpnames.orgId, orgId)];
  const search = opts.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(ilike(stockOpnames.number, like), ilike(stockOpnames.notes, like)) as SQL,
    );
  }
  if (opts.status && opts.status !== "ALL") {
    conds.push(eq(stockOpnames.status, opts.status));
  }
  return and(...conds);
}

/** Daftar sesi opname untuk tabel server-side (search + status + pagination). */
export async function listStockOpnamesPaginated(
  q: Queryable,
  orgId: string,
  opts: { search?: string; status?: OpnameStatusFilter; limit: number; offset: number },
) {
  return q
    .select()
    .from(stockOpnames)
    .where(opnameListConds(orgId, opts))
    .orderBy(desc(stockOpnames.opnameDate), desc(stockOpnames.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function countStockOpnames(
  q: Queryable,
  orgId: string,
  opts: { search?: string; status?: OpnameStatusFilter } = {},
): Promise<number> {
  const [row] = await q
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(stockOpnames)
    .where(opnameListConds(orgId, opts));
  return row?.n ?? 0;
}

/** Statistik KPI dalam satu query agregat (tanpa memuat semua baris). */
export async function getStockOpnameStats(q: Queryable, orgId: string) {
  const [row] = await q
    .select({
      total: sql<number>`cast(count(*) as int)`,
      completed: sql<number>`cast(count(*) filter (where status = 'COMPLETED') as int)`,
      draft: sql<number>`cast(count(*) filter (where status = 'DRAFT') as int)`,
      review: sql<number>`cast(count(*) filter (where status = 'REVIEW_DRAFT_JOURNAL') as int)`,
      cancelled: sql<number>`cast(count(*) filter (where status = 'CANCELLED') as int)`,
      netDifference: sql<string>`cast(coalesce(sum(total_difference_value_minor) filter (where status <> 'CANCELLED'), 0) as text)`,
    })
    .from(stockOpnames)
    .where(eq(stockOpnames.orgId, orgId));
  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    draft: row?.draft ?? 0,
    review: row?.review ?? 0,
    cancelled: row?.cancelled ?? 0,
    netDifferenceMinor: BigInt(row?.netDifference ?? "0"),
  };
}

/** Hapus permanen sesi yang sudah DIBATALKAN. Draf & sesi selesai tidak bisa
 *  dihapus — draf masih bisa dibatalkan dulu, yang selesai menjadi jejak audit. */
export async function deleteCancelledOpname(q: Queryable, orgId: string, opnameId: string) {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`opname-delete:${opnameId}`}))`);
  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (opnameData.status !== "CANCELLED") {
    throw new Error(
      "HANYA_OPNAME_DIBATALKAN: hanya sesi berstatus Dibatalkan yang bisa dihapus permanen",
    );
  }
  if (opnameData.journalEntryId) {
    throw new Error("OPNAME_MASIH_TERHUBUNG_JURNAL: batalkan sesi lewat tombol Batalkan Sesi lebih dulu");
  }
  await q
    .delete(stockOpnames)
    .where(and(eq(stockOpnames.orgId, orgId), eq(stockOpnames.id, opnameId)));
  return { ok: true as const };
}

export async function getStockOpnameWithItems(q: Queryable, orgId: string, opnameId: string) {
  const [opname] = await q
    .select()
    .from(stockOpnames)
    .where(and(eq(stockOpnames.orgId, orgId), eq(stockOpnames.id, opnameId)))
    .limit(1);
  if (!opname) return null;

  const items = await q
    .select({
      id: stockOpnameItems.id,
      itemId: stockOpnameItems.itemId,
      itemName: inventoryItems.name,
      itemCode: inventoryItems.code,
      unit: inventoryItems.unit,
      systemQty: stockOpnameItems.systemQty,
      physicalQty: stockOpnameItems.physicalQty,
      differenceQty: stockOpnameItems.differenceQty,
      unitCostMinor: stockOpnameItems.unitCostMinor,
      differenceValueMinor: stockOpnameItems.differenceValueMinor,
      reason: stockOpnameItems.reason,
      /** Harga modal barang SAAT INI (0 = belum pernah punya cost). */
      currentAverageCostMinor: inventoryItems.averageCostMinor,
    })
    .from(stockOpnameItems)
    .innerJoin(inventoryItems, eq(inventoryItems.id, stockOpnameItems.itemId))
    .where(eq(stockOpnameItems.opnameId, opname.id));

  return { ...opname, items };
}

type ResolvedAccounts = {
  inventoryAccountId: string;
  lossAccountId: string | null;
  gainAccountId: string | null;
};

/**
 * Resolve akun penyesuaian secara fail-closed: tidak ada tebakan fuzzy.
 * Akun persediaan dibaca dari registry subledger_controls (PERSEDIAAN),
 * bukan lagi kolom inventory_settings. Akun selisih wajib terisi (diatur di
 * Pengaturan > Persediaan atau saat onboarding). Pesan error menyebut lokasi.
 */
async function resolveAdjustmentAccounts(
  q: Queryable,
  orgId: string,
  direction: "DEFISIT" | "SURPLUS",
): Promise<ResolvedAccounts> {
  const settings = await getInventorySettings(q, orgId);
  const allAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byId = new Map(allAccounts.map((a) => [a.id, a]));

  const { getSubledgerControls } = await import("./subledger.repo");
  const controls = await getSubledgerControls(q, orgId);
  const inventoryId = controls.find((c) => c.kind === "PERSEDIAAN")?.controlAccountId ?? null;
  const lossId = settings?.adjustmentLossAccountId ?? null;
  const gainId = settings?.adjustmentGainAccountId ?? null;

  const inventoryOk = inventoryId && byId.has(inventoryId);
  if (!inventoryOk) {
    throw new Error(
      "AKUN_PERSEDIAAN_BELUM_DIPETAKAN: registry subledger PERSEDIAAN belum di-seed (dijalankan otomatis saat onboarding)",
    );
  }
  if (direction === "DEFISIT" && (!lossId || !byId.has(lossId))) {
    throw new Error(
      "AKUN_BEBAN_SELISIH_BELUM_DIPETAKAN: pilih Beban Selisih Defisit di Pengaturan > Persediaan",
    );
  }
  if (direction === "SURPLUS" && (!gainId || !byId.has(gainId))) {
    throw new Error(
      "AKUN_PENDAPATAN_SELISIH_BELUM_DIPETAKAN: pilih Pendapatan Selisih Surplus di Pengaturan > Persediaan",
    );
  }
  return {
    inventoryAccountId: inventoryId as string,
    lossAccountId: lossId,
    gainAccountId: gainId,
  };
}

/**
 * Terapkan qty fisik opname ke item (qty, kartu stok, layer FIFO).
 * Dipakai jalur posting normal maupun jalur "tanpa jurnal" saat nilai selisih Rp0.
 * Mengembalikan catatan shortfall layer (best-effort) untuk notes opname.
 */
async function applyOpnameStockToItems(
  q: Queryable,
  orgId: string,
  opname: {
    id: string;
    number: string;
    opnameDate: string;
    items: Array<{ itemId: string; systemQty: string; physicalQty: string; unitCostMinor: bigint }>;
  },
): Promise<string> {
  let layerShortfall = "";
  for (const line of opname.items) {
    const item = await getInventoryItem(q, orgId, line.itemId);
    if (!item) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${line.itemId}`);
    const currentQty = Number(item.currentQty);
    const recordedSystemQty = Number(line.systemQty);
    const physicalQty = Number(line.physicalQty);
    if (!Number.isFinite(physicalQty) || physicalQty < 0) {
      throw new Error("FISIK_TIDAK_VALID: kuantitas fisik harus angka >= 0");
    }
    if (Math.abs(currentQty - recordedSystemQty) > 1e-9) {
      throw new Error(
        `STOK_BERUBAH_SEJAK_OPNAME: ${item.code} tercatat ${recordedSystemQty} saat opname, kini ${currentQty}. Buat opname ulang.`,
      );
    }
    const diffQty = physicalQty - currentQty;
    if (Math.abs(diffQty) < 1e-9) continue;

    const unitCostMinor = line.unitCostMinor;
    const newTotalCostMinor = costForQty(unitCostMinor, physicalQty);
    const diffValueMinor = costForQty(unitCostMinor, diffQty);

    await q.update(inventoryItems)
      .set({
        currentQty: qtyToDb(physicalQty),
        totalCostMinor: newTotalCostMinor,
        averageCostMinor: physicalQty > 0 ? unitCostMinor : item.averageCostMinor,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id));

    await q.insert(inventoryTransactions).values({
      orgId,
      itemId: item.id,
      date: opname.opnameDate,
      type: "ADJUSTMENT",
      qty: qtyToDb(diffQty),
      unitCostMinor,
      totalCostMinor: diffQty < 0 ? -diffValueMinor : diffValueMinor,
      resultingQty: qtyToDb(physicalQty),
      resultingTotalCostMinor: newTotalCostMinor,
      sourceType: "OPNAME",
      sourceId: opname.id,
      memo: `Opname ${opname.number} (${diffQty > 0 ? "+" : ""}${diffQty})`,
    });

    if (diffQty > 0) {
      await q.insert(inventoryLayers).values({
        orgId,
        itemId: item.id,
        date: opname.opnameDate,
        initialQty: qtyToDb(diffQty),
        remainingQty: qtyToDb(diffQty),
        unitCostMinor,
        referenceType: "ADJUSTMENT",
        referenceId: opname.id,
      });
    } else {
      // Defisit: kurangi layer FIFO tertua lebih dulu.
      let toDeduct = Math.abs(diffQty);
      const layers = await q
        .select()
        .from(inventoryLayers)
        .where(and(eq(inventoryLayers.orgId, orgId), eq(inventoryLayers.itemId, item.id)))
        .orderBy(asc(inventoryLayers.date), asc(inventoryLayers.createdAt));
      for (const layer of layers) {
        if (toDeduct <= 1e-9) break;
        const remaining = Number(layer.remainingQty);
        if (remaining <= 1e-9) continue;
        const take = Math.min(remaining, toDeduct);
        await q.update(inventoryLayers)
          .set({ remainingQty: qtyToDb(remaining - take) })
          .where(eq(inventoryLayers.id, layer.id));
        toDeduct -= take;
      }
      if (toDeduct > 1e-9) {
        // Layer tidak mencakup seluruh defisit (inkonsistensi data lama):
        // catat shortfall di catatan opname agar terlihat, tanpa membuat qty negatif.
        layerShortfall = `${layerShortfall}${layerShortfall ? "; " : ""}${item.code} kurang layer ${toDeduct}`;
      }
    }
  }
  return layerShortfall;
}

/**
 * Isi/ubah harga modal per unit untuk baris opname pada status DRAFT.
 * Hanya diizinkan bila barang belum punya harga modal (averageCost = 0):
 * dipakai user migrasi yang belum sempat mencatat nota pembelian. Nilai ini
 * menjadi dasar penilaian selisih dan menjadi modal awal saat opname diposting.
 */
export async function updateOpnameItemCost(
  q: Queryable,
  orgId: string,
  opnameId: string,
  itemId: string,
  unitCostMinor: bigint,
) {
  if (unitCostMinor < 0n) throw new Error("HARGA_MODAL_TIDAK_VALID: harus >= 0");
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`opname-cost:${opnameId}`}))`);

  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (opnameData.status !== "DRAFT" || opnameData.journalEntryId) {
    throw new Error("OPNAME_TIDAK_BISA_DIEDIT: hanya Draf Perhitungan bisa diubah harga modalnya");
  }
  const line = opnameData.items.find((it) => it.itemId === itemId);
  if (!line) throw new Error("ITEM_OPNAME_TIDAK_DITEMUKAN");
  const item = await getInventoryItem(q, orgId, itemId);
  if (!item) throw new Error("BARANG_TIDAK_DITEMUKAN");
  if (item.averageCostMinor > 0n) {
    throw new Error(
      "HARGA_MODAL_SUDAH_TERISI: barang ini sudah punya harga modal dari pembelian/saldo awal",
    );
  }

  const diffQty = Number(line.differenceQty);
  const differenceValueMinor = costForQty(unitCostMinor, diffQty);
  await q
    .update(stockOpnameItems)
    .set({ unitCostMinor, differenceValueMinor })
    .where(and(eq(stockOpnameItems.opnameId, opnameId), eq(stockOpnameItems.itemId, itemId)));

  const rows = await q
    .select({ value: stockOpnameItems.differenceValueMinor })
    .from(stockOpnameItems)
    .where(eq(stockOpnameItems.opnameId, opnameId));
  const total = rows.reduce((acc, r) => acc + r.value, 0n);
  await q
    .update(stockOpnames)
    .set({ totalDifferenceValueMinor: total, updatedAt: new Date() })
    .where(eq(stockOpnames.id, opnameId));

  return { totalDifferenceValueMinor: total, differenceValueMinor };
}

/** Ubah memo jurnal penyesuaian opname, hanya selagi draf (belum POSTED). */
export async function updateOpnameJournalMemo(
  q: Queryable,
  orgId: string,
  opnameId: string,
  memo: string,
) {
  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (!opnameData.journalEntryId) throw new Error("JURNAL_BELUM_DIBUAT");
  const updated = await q
    .update(journalEntries)
    .set({ memo: memo.trim() })
    .where(
      and(
        eq(journalEntries.id, opnameData.journalEntryId),
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.status, "DRAFT"),
      ),
    )
    .returning({ id: journalEntries.id });
  if (updated.length === 0) throw new Error("JURNAL_SUDAH_DIPOSTING: memo tidak bisa diubah lagi");
  return { ok: true as const };
}

/**
 * Membuat Draf Jurnal Penyesuaian (Opsi A) dari hasil selisih Stok Opname.
 * Stock-neutral: tidak menyentuh qty/layer/transaksi dan tidak mengunci
 * kebijakan; stok baru diterapkan saat draf diposting via postOpnameAdjustment.
 * Pengecualian: bila nilai selisih Rp0 (harga modal belum diisi) TIDAK ada yang
 * bisa dijurnal, namun qty fisik tetap diterapkan dan opname ditandai COMPLETED.
 */
export async function generateAdjustmentJournalDraft(
  q: Queryable,
  orgId: string,
  opnameId: string,
) {
  // Kunci per opname agar dua pemanggilan bersamaan tidak mencetak dua draf
  // (cek journalEntryId di bawah tidak atomik tanpa lock).
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`opname-draft:${opnameId}`}))`);

  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (opnameData.journalEntryId) throw new Error("DRAF_JURNAL_SUDAH_DIBUAT");
  if (opnameData.status !== "DRAFT") {
    throw new Error(`STATUS_OPNAME_TIDAK_VALID: hanya DRAFT yang bisa dibuatkan draf jurnal (saat ini ${opnameData.status})`);
  }

  const diffValue = opnameData.totalDifferenceValueMinor;
  if (diffValue === 0n) {
    const hasQtyDiff = opnameData.items.some((it) => Number(it.differenceQty) !== 0);
    if (!hasQtyDiff) {
      // Fisik cocok sempurna: tidak ada yang perlu diterapkan maupun dijurnal.
      const [done] = await q.update(stockOpnames)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(stockOpnames.id, opnameId))
        .returning();
      return { opname: done ?? opnameData, journalEntryId: null as string | null, noJournal: true as const };
    }
    // Ada selisih qty tapi nilai Rp0 (harga modal belum diisi): tetap terapkan
    // stok fisik, tandai selesai tanpa jurnal, dan catat alasannya di notes.
    const shortfall = await applyOpnameStockToItems(q, orgId, opnameData);
    const note = "[Tanpa jurnal: nilai selisih Rp0 karena harga modal belum diisi]";
    const [done] = await q.update(stockOpnames)
      .set({
        status: "COMPLETED",
        notes: `${opnameData.notes ?? ""}${opnameData.notes ? "\n" : ""}${note}${shortfall ? ` [Layer tidak penuh: ${shortfall}]` : ""}`,
        updatedAt: new Date(),
      })
      .where(eq(stockOpnames.id, opnameId))
      .returning();
    return { opname: done ?? opnameData, journalEntryId: null as string | null, noJournal: true as const };
  }

  const isDeficit = diffValue < 0n;
  const absValue = isDeficit ? -diffValue : diffValue;
  const direction = isDeficit ? "DEFISIT" : "SURPLUS";
  const resolved = await resolveAdjustmentAccounts(q, orgId, direction);

  const persediaanLinks: Array<{ kind: "PERSEDIAAN"; refId: string; amountMinor: bigint; qty: number }> =
    opnameData.items
      .filter((it) => it.differenceValueMinor !== 0n)
      .map((it) => ({
        kind: "PERSEDIAAN" as const,
        refId: it.itemId,
        amountMinor: it.differenceValueMinor < 0n ? -it.differenceValueMinor : it.differenceValueMinor,
        qty: Number(it.differenceQty),
      }));

  const lines = isDeficit
    ? [
        {
          accountId: (resolved.lossAccountId as string),
          debitMinor: absValue,
          creditMinor: 0n,
          memo: `Beban Selisih Stok Opname ${opnameData.number}`,
        },
        {
          accountId: resolved.inventoryAccountId,
          debitMinor: 0n,
          creditMinor: absValue,
          memo: `Pengurangan Persediaan Opname ${opnameData.number}`,
          subledgerLinks: persediaanLinks,
        },
      ]
    : [
        {
          accountId: resolved.inventoryAccountId,
          debitMinor: absValue,
          creditMinor: 0n,
          memo: `Penambahan Persediaan Opname ${opnameData.number}`,
          subledgerLinks: persediaanLinks,
        },
        {
          accountId: (resolved.gainAccountId as string),
          debitMinor: 0n,
          creditMinor: absValue,
          memo: `Pendapatan/Koreksi Selisih Stok Opname ${opnameData.number}`,
        },
      ];

  const draft = await createDraftJournalEntry(q, orgId, {
    dateISO: opnameData.opnameDate,
    memo: `Penyesuaian Stok Opname Fisik ${opnameData.number}`,
    source: "STOCK_OPNAME",
    lines,
  });

  const [moved] = await q.update(stockOpnames)
    .set({
      status: "REVIEW_DRAFT_JOURNAL",
      journalEntryId: draft.id,
      updatedAt: new Date(),
    })
    .where(eq(stockOpnames.id, opnameId))
    .returning();

  return { opname: moved ?? opnameData, journalEntryId: draft.id, journalNumber: draft.number };
}

/**
 * Posting draf penyesuaian opname + penerapan stok secara atomik.
 * - Mengunci via advisory lock per opname agar tidak double-post.
 * - Memvalidasi periode OPEN, draf masih DRAFT, dan stok buku belum berubah
 *   sejak opname (mencegah overwrite konkurensi diam-diam).
 * - Menulis kartu stok (ADJUSTMENT) + layer FIFO + menyelesaikan opname
 *   menjadi COMPLETED + mengunci kebijakan metode (policy lock saat POSTED).
 */
export async function postOpnameAdjustment(
  q: Queryable,
  orgId: string,
  opnameId: string,
  actorEmail: string,
) {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`opname-post:${opnameId}`}))`);

  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (opnameData.status === "COMPLETED") throw new Error("OPNAME_SUDAH_SELESAI");
  if (opnameData.status !== "REVIEW_DRAFT_JOURNAL" || !opnameData.journalEntryId) {
    throw new Error("OPNAME_BELUM_SIAP_POSTING: buat draf jurnal penyesuaian terlebih dahulu");
  }

  const period = await findPeriodByDate(q, orgId, opnameData.opnameDate);
  if (!period) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  if (period.status !== "OPEN") {
    throw new Error(`PERIODE_${period.status}: jurnal penyesuaian hanya bisa diposting pada periode OPEN`);
  }

  const [entry] = await q
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, opnameData.journalEntryId), eq(journalEntries.orgId, orgId)))
    .limit(1);
  if (!entry) throw new Error("JURNAL_TIDAK_DITEMUKAN");
  if (entry.status === "POSTED") throw new Error("JURNAL_SUDAH_DIPOSTING");
  if (entry.status !== "DRAFT") throw new Error(`STATUS_JURNAL_TIDAK_VALID: ${entry.status}`);

  // Defense-in-depth: pastikan total draf masih cocok dengan selisih opname
  // sebelum dikunci POSTED (tidak ada jalur edit draf, tapi murah dicek).
  const draftLines = await q
    .select({ debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .where(eq(journalLines.entryId, entry.id));
  const draftDebit = draftLines.reduce((a, l) => a + toMinor(l.debit), 0n);
  const draftCredit = draftLines.reduce((a, l) => a + toMinor(l.credit), 0n);
  const expectedAbs = opnameData.totalDifferenceValueMinor < 0n
    ? -opnameData.totalDifferenceValueMinor
    : opnameData.totalDifferenceValueMinor;
  if (draftDebit !== expectedAbs || draftCredit !== expectedAbs) {
    throw new Error("DRAF_JURNAL_TIDAK_SESUAI_SELSISIH: total draf berubah, buat ulang draf penyesuaian");
  }

  // Terapkan stok per item ke kuantitas fisik hasil opname.
  const layerShortfall = await applyOpnameStockToItems(q, orgId, opnameData);

  const posted = await q.update(journalEntries)
    .set({ status: "POSTED", postedAt: new Date(), postedBy: actorEmail })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "DRAFT")))
    .returning({ id: journalEntries.id, number: journalEntries.number });
  if (posted.length === 0) throw new Error("JURNAL_SUDAH_DIPOSTING");

  try {
    if (isRagTenantIndexingEnabled()) {
      await q.execute(sql`INSERT INTO rag_queue (org_id, kind, ref_id) VALUES (${orgId}, 'JOURNAL', ${entry.id})`);
    }
  } catch {
    // best-effort
  }

  const [completed] = await q.update(stockOpnames)
    .set({
      status: "COMPLETED",
      notes: layerShortfall
        ? `${opnameData.notes ?? ""}${opnameData.notes ? "\n" : ""}[Layer tidak penuh: ${layerShortfall}]`
        : opnameData.notes,
      updatedAt: new Date(),
    })
    .where(eq(stockOpnames.id, opnameId))
    .returning();

  // Policy lock berlaku saat POSTED (bukan saat draf dibuat).
  await lockInventoryPolicy(q, orgId);

  return { opname: completed ?? opnameData, journalEntryId: entry.id, journalNumber: posted[0].number };
}

/**
 * Batalkan sesi opname yang belum selesai (standar audit: dokumen pra-posting
 * boleh dibatalkan, dokumen posted tidak). Draf jurnal penyesuaian yang masih
 * DRAFT dan stock-neutral, ikut dihapus bersama baris/subledger/lampirannya.
 * Sesi COMPLETED tidak bisa dibatalkan; koreksi lewat sesi opname baru.
 */
export async function cancelStockOpname(q: Queryable, orgId: string, opnameId: string) {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`opname-cancel:${opnameId}`}))`);

  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (opnameData.status === "COMPLETED") {
    throw new Error("OPNAME_SELESAI_TIDAK_BISA_DIBATALKAN: buat sesi opname koreksi bila perlu");
  }
  if (opnameData.status === "CANCELLED") throw new Error("OPNAME_SUDAH_DIBATALKAN");
  if (!["DRAFT", "IN_PROGRESS", "REVIEW_DRAFT_JOURNAL"].includes(opnameData.status)) {
    throw new Error(`STATUS_OPNAME_TIDAK_VALID: ${opnameData.status}`);
  }

  if (opnameData.journalEntryId) {
    const [entry] = await q
      .select({ id: journalEntries.id, status: journalEntries.status })
      .from(journalEntries)
      .where(
        and(eq(journalEntries.id, opnameData.journalEntryId), eq(journalEntries.orgId, orgId)),
      )
      .limit(1);
    if (!entry) throw new Error("JURNAL_TIDAK_DITEMUKAN");
    if (entry.status !== "DRAFT") {
      throw new Error(
        "JURNAL_SUDAH_DIPOSTING: jurnal penyesuaian sudah final, sesi tidak bisa dibatalkan",
      );
    }
    // Lepas referensi lebih dulu: FK stock_opnames → journal_entries menahan delete.
    await q
      .update(stockOpnames)
      .set({ journalEntryId: null, updatedAt: new Date() })
      .where(eq(stockOpnames.id, opnameId));
    // Baris, subledger links, dan lampiran ikut terhapus via FK cascade.
    await q
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.orgId, orgId)));
  }

  const [cancelled] = await q
    .update(stockOpnames)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(stockOpnames.id, opnameId))
    .returning();
  return cancelled ?? opnameData;
}
