"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  createInventoryItem,
  listInventoryItems,
  getInventoryItem,
  listItemTransactions,
  getInventorySettings,
  upsertInventorySettings,
  createStockOpname,
  listStockOpnames,
  getStockOpnameWithItems,
  generateAdjustmentJournalDraft,
  type CreateItemInput,
} from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";

export async function getInventoryOverviewAction() {
  const ctx = await requireContext();
  const [items, settings, opnames] = await Promise.all([
    listInventoryItems(db, ctx.orgId),
    getInventorySettings(db, ctx.orgId),
    listStockOpnames(db, ctx.orgId),
  ]);

  const totalValueMinor = items.reduce((acc, item) => acc + item.totalCostMinor, 0n);
  const totalSku = items.length;
  const lowStockItems = items.filter(
    (item) => Number(item.currentQty) <= Number(item.minStockAlert),
  );

  return {
    items,
    settings,
    opnames,
    totalValueMinor: totalValueMinor.toString(),
    totalSku,
    lowStockCount: lowStockItems.length,
  };
}

export async function createItemAction(payload: {
  code: string;
  name: string;
  barcode?: string;
  unit?: string;
  category?: string;
  minStockAlert?: string;
  standardSellingPriceText?: string;
  initialQty?: number;
  initialCostText?: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const initialCostMinor = payload.initialCostText
      ? Money.parseIdr(payload.initialCostText).minor
      : 0n;
    const standardSellingPriceMinor = payload.standardSellingPriceText
      ? Money.parseIdr(payload.standardSellingPriceText).minor
      : 0n;

    const item = await createInventoryItem(db, ctx.orgId, {
      code: payload.code,
      name: payload.name,
      barcode: payload.barcode,
      unit: payload.unit,
      category: payload.category,
      minStockAlert: payload.minStockAlert,
      standardSellingPriceMinor,
      initialQty: payload.initialQty,
      initialCostMinor,
    });

    revalidatePath("/persediaan");
    return { ok: true, item };
  } catch (err: any) {
    return { ok: false, error: err.message || "Gagal menyimpan barang" };
  }
}

export async function createBatchItemsAction(items: Array<{
  code: string;
  name: string;
  barcode?: string;
  unit?: string;
  category?: string;
  minStockAlert?: string;
  standardSellingPriceText?: string;
  initialQty?: number;
  initialCostText?: string;
}>) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!items || items.length === 0) {
      return { ok: false, error: "Daftar barang tidak boleh kosong" };
    }

    const created = await db.transaction(async (tx) => {
      const results = [];
      for (const payload of items) {
        if (!payload.code.trim() || !payload.name.trim()) continue;

        const initialCostMinor = payload.initialCostText
          ? Money.parseIdr(payload.initialCostText).minor
          : 0n;
        const standardSellingPriceMinor = payload.standardSellingPriceText
          ? Money.parseIdr(payload.standardSellingPriceText).minor
          : 0n;

        const item = await createInventoryItem(tx, ctx.orgId, {
          code: payload.code,
          name: payload.name,
          barcode: payload.barcode,
          unit: payload.unit,
          category: payload.category,
          minStockAlert: payload.minStockAlert,
          standardSellingPriceMinor,
          initialQty: payload.initialQty,
          initialCostMinor,
        });
        results.push(item);
      }
      return results;
    });

    revalidatePath("/persediaan");
    return { ok: true, count: created.length };
  } catch (err: any) {
    return { ok: false, error: err.message || "Gagal menyimpan batch barang" };
  }
}


export async function createStockOpnameAction(payload: {
  opnameDate: string;
  notes?: string;
  items: Array<{
    itemId: string;
    physicalQty: number;
    reason?: string;
  }>;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const opname = await createStockOpname(db, ctx.orgId, payload);
    revalidatePath("/persediaan/opname");
    return { ok: true, opnameId: opname.id };
  } catch (err: any) {
    return { ok: false, error: err.message || "Gagal membuat sesi opname" };
  }
}

export async function generateAdjustmentDraftAction(opnameId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await db.transaction(async (tx) => {
      return generateAdjustmentJournalDraft(tx, ctx.orgId, opnameId);
    });
    revalidatePath("/persediaan/opname");
    revalidatePath(`/persediaan/opname/${opnameId}`);
    revalidatePath("/jurnal");
    return { ok: true, ...res };
  } catch (err: any) {
    return { ok: false, error: err.message || "Gagal membuat draf jurnal penyesuaian" };
  }
}
