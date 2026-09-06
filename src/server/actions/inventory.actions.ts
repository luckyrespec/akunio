"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import {
  createInventoryItem,
  listInventoryItems,
  listServiceItems,
  getInventorySettings,
  upsertInventorySettings,
  createStockOpname,
  listStockOpnames,
  generateAdjustmentJournalDraft,
  postOpnameAdjustment,
} from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import { and, eq } from "drizzle-orm";
import { inventoryItems } from "@/server/db/schema/inventory";
import {
  putInventoryImage,
  deleteDocument,
  validateInventoryImage,
  MAX_INVENTORY_IMAGE_BYTES,
} from "@/server/storage/storage";

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
  code?: string;
  name: string;
  barcode?: string;
  appBarcode?: string;
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

    const item = await withOrg(ctx.orgId, async (tx) =>
      createInventoryItem(tx, ctx.orgId, {
        code: payload.code,
        appBarcode: payload.appBarcode,
        name: payload.name,
        barcode: payload.barcode,
        unit: payload.unit,
        category: payload.category,
        minStockAlert: payload.minStockAlert,
        standardSellingPriceMinor,
        initialQty: payload.initialQty,
        initialCostMinor,
      }),
    );

    revalidatePath("/persediaan");
    revalidatePath("/persediaan/daftar");
    return { ok: true as const, item };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan barang";
    return { ok: false as const, error: message };
  }
}

export async function suggestSkuAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { nextSkuCodes } = await import("@/server/db/repos/inventory-sku");
    const { db } = await import("@/server/db");
    const s = await db.transaction((tx) => nextSkuCodes(tx as never, ctx.orgId));
    return { ok: true as const, ...s };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal generate kode" };
  }
}

export async function getServiceOverviewAction() {
  const ctx = await requireContext();
  const items = await listServiceItems(db, ctx.orgId);
  return { items, totalJasa: items.length };
}

export async function createServiceItemAction(payload: {
  code?: string;
  name: string;
  unit?: string;
  category?: string;
  sellingPriceText?: string;
  revenueAccountId?: string | null;
  expenseAccountId?: string | null;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!payload.name || payload.name.trim().length < 2) {
      return { ok: false as const, error: "Nama jasa minimal 2 huruf" };
    }
    const standardSellingPriceMinor = payload.sellingPriceText
      ? Money.parseIdr(payload.sellingPriceText).minor
      : 0n;

    const item = await withOrg(ctx.orgId, async (tx) =>
      createInventoryItem(tx, ctx.orgId, {
        itemType: "JASA",
        code: payload.code,
        name: payload.name,
        unit: payload.unit ?? "Sesi",
        category: payload.category,
        standardSellingPriceMinor,
        revenueAccountId: payload.revenueAccountId ?? null,
        expenseAccountId: payload.expenseAccountId ?? null,
      }),
    );

    revalidatePath("/persediaan/jasa");
    revalidatePath("/faktur/baru");
    return { ok: true as const, item };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan jasa";
    return { ok: false as const, error: message };
  }
}

export async function suggestJsaSkuAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { nextSkuCodes } = await import("@/server/db/repos/inventory-sku");
    const { db } = await import("@/server/db");
    const s = await db.transaction((tx) => nextSkuCodes(tx as never, ctx.orgId, "JASA"));
    return { ok: true as const, ...s };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal generate kode" };
  }
}

export async function setServiceActiveAction(id: string, active: boolean) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const rows = await withOrg(ctx.orgId, (tx) =>
      tx
        .update(inventoryItems)
        .set({ isActive: active, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryItems.id, id),
            eq(inventoryItems.orgId, ctx.orgId),
            eq(inventoryItems.itemType, "JASA"),
          ),
        )
        .returning({ id: inventoryItems.id }),
    );
    if (rows.length === 0) return { ok: false as const, error: "Jasa tidak ditemukan" };
    revalidatePath("/persediaan/jasa");
    revalidatePath("/faktur/baru");
    return { ok: true as const };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengubah status jasa";
    return { ok: false as const, error: message };
  }
}

export async function createBatchItemsAction(items: Array<{
  code?: string;
  name: string;
  barcode?: string;
  appBarcode?: string;
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
            code: code || undefined,
            appBarcode: payload.appBarcode || undefined,
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
      return { results, skipped, errors };
    });

    revalidatePath("/persediaan");
    revalidatePath("/persediaan/daftar");
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
    const opname = await withOrg(ctx.orgId, async (tx) =>
      createStockOpname(tx, ctx.orgId, payload),
    );
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
    revalidatePath("/persediaan/daftar");
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
    const updated = await withOrg(ctx.orgId, async (tx) =>
      upsertInventorySettings(tx, ctx.orgId, {
        valuationMethod: payload.valuationMethod,
        recordingMethod: payload.recordingMethod,
        inventoryAccountId: payload.inventoryAccountId || undefined,
        cogsAccountId: payload.cogsAccountId || undefined,
        adjustmentLossAccountId: payload.adjustmentLossAccountId || undefined,
        adjustmentGainAccountId: payload.adjustmentGainAccountId || undefined,
      }),
    );
    revalidatePath("/pengaturan");
    revalidatePath("/persediaan");
    revalidatePath("/persediaan/daftar");
    return { ok: true, settings: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui pengaturan persediaan";
    return { ok: false, error: message };
  }
}

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
    return { ok: true as const, item: res.updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan foto";
    return { ok: false as const, error: message };
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
