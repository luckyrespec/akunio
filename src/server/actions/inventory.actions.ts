"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import {
  createInventoryItem,
  listInventoryItems,
  getInventorySettings,
  upsertInventorySettings,
  createStockOpname,
  listStockOpnames,
  generateAdjustmentJournalDraft,
  postOpnameAdjustment,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan barang";
    return { ok: false, error: message };
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

    const seen = new Set<string>();
    const created = await withOrg(ctx.orgId, async (tx) => {
      const results = [];
      const skipped: Array<{ index: number; reason: string }> = [];
      const errors: Array<{ index: number; code: string; message: string }> = [];
      for (let idx = 0; idx < items.length; idx++) {
        const payload = items[idx];
        const code = (payload.code ?? "").trim().toUpperCase();
        const name = (payload.name ?? "").trim();
        if (!code || !name) {
          skipped.push({ index: idx, reason: "Kode SKU dan Nama kosong" });
          continue;
        }
        if (seen.has(code)) {
          errors.push({ index: idx, code, message: `Duplikat SKU dalam batch: ${code}` });
          continue;
        }
        seen.add(code);
        if (payload.initialQty !== undefined && (!Number.isFinite(payload.initialQty) || payload.initialQty < 0)) {
          errors.push({ index: idx, code, message: "Stok awal harus angka >= 0" });
          continue;
        }
        try {
          const initialCostMinor = payload.initialCostText
            ? Money.parseIdr(payload.initialCostText).minor
            : 0n;
          const standardSellingPriceMinor = payload.standardSellingPriceText
            ? Money.parseIdr(payload.standardSellingPriceText).minor
            : 0n;

          const item = await createInventoryItem(tx, ctx.orgId, {
            code,
            name,
            barcode: payload.barcode,
            unit: payload.unit,
            category: payload.category,
            minStockAlert: payload.minStockAlert,
            standardSellingPriceMinor,
            initialQty: payload.initialQty,
            initialCostMinor,
          });
          results.push(item);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Gagal menyimpan baris";
          errors.push({ index: idx, code, message });
        }
      }
      if (results.length === 0 && errors.length > 0) {
        throw new Error(errors[0].message);
      }
      return { results, skipped, errors };
    });

    revalidatePath("/persediaan");
    return {
      ok: true,
      count: created.results.length,
      skipped: created.skipped,
      errors: created.errors,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan batch barang";
    return { ok: false, error: message };
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal membuat sesi opname";
    return { ok: false, error: message };
  }
}

export async function generateAdjustmentDraftAction(opnameId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, async (tx) => {
      return generateAdjustmentJournalDraft(tx, ctx.orgId, opnameId);
    });
    revalidatePath("/persediaan/opname");
    revalidatePath(`/persediaan/opname/${opnameId}`);
    revalidatePath("/jurnal");
    return { ok: true, ...res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal membuat draf jurnal penyesuaian";
    return { ok: false, error: message };
  }
}

export async function postOpnameAdjustmentAction(opnameId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, async (tx) => {
      return postOpnameAdjustment(tx, ctx.orgId, opnameId, ctx.userEmail);
    });
    revalidatePath("/persediaan/opname");
    revalidatePath(`/persediaan/opname/${opnameId}`);
    revalidatePath("/persediaan");
    revalidatePath("/jurnal");
    return { ok: true, ...res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memposting penyesuaian opname";
    return { ok: false, error: message };
  }
}

export async function updateInventorySettingsAction(payload: {
  valuationMethod?: "WEIGHTED_AVERAGE" | "FIFO";
  recordingMethod?: "PERPETUAL" | "PERIODIC";
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  adjustmentLossAccountId?: string | null;
  adjustmentGainAccountId?: string | null;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const updated = await upsertInventorySettings(db, ctx.orgId, {
      valuationMethod: payload.valuationMethod,
      recordingMethod: payload.recordingMethod,
      inventoryAccountId: payload.inventoryAccountId || undefined,
      cogsAccountId: payload.cogsAccountId || undefined,
      adjustmentLossAccountId: payload.adjustmentLossAccountId || undefined,
      adjustmentGainAccountId: payload.adjustmentGainAccountId || undefined,
    });
    revalidatePath("/pengaturan");
    revalidatePath("/persediaan");
    return { ok: true, settings: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui pengaturan persediaan";
    return { ok: false, error: message };
  }
}
