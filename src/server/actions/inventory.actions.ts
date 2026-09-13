"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import {
  createInventoryItem,
  listInventoryItems,
  listArchivedInventoryItems,
  listServiceItems,
  listArchivedServiceItems,
  getInventorySettings,
  upsertInventorySettings,
  createStockOpname,
  listStockOpnames,
  generateAdjustmentJournalDraft,
  postOpnameAdjustment,
  setItemActive,
  updateInventoryItem,
  updateServiceItem,
  updateOpnameItemCost,
  updateOpnameJournalMemo,
  cancelStockOpname,
  deleteCancelledOpname,
} from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import { and, eq } from "drizzle-orm";
import { inventoryItems } from "@/server/db/schema/inventory";
import { MAX_INVENTORY_IMAGE_BYTES } from "@/server/storage/storage";
import { removeItemImage, saveItemImage } from "@/server/storage/inventory-image";

export async function getInventoryOverviewAction() {
  const ctx = await requireContext();
  const [allActive, archivedItems, jasaItems, archivedJasaItems, settings, opnames] = await Promise.all([
    listInventoryItems(db, ctx.orgId),
    listArchivedInventoryItems(db, ctx.orgId),
    listServiceItems(db, ctx.orgId),
    listArchivedServiceItems(db, ctx.orgId),
    getInventorySettings(db, ctx.orgId),
    listStockOpnames(db, ctx.orgId),
  ]);

  // Jasa punya daftarnya sendiri — pisahkan agar tidak dobel di tabel gabungan.
  const items = allActive.filter((item) => item.itemType === "BARANG");

  const totalValueMinor = items.reduce((acc, item) => acc + item.totalCostMinor, 0n);
  const totalSku = items.length;
  const lowStockItems = items.filter(
    (item) => Number(item.currentQty) <= Number(item.minStockAlert),
  );

  return {
    items,
    archivedItems,
    jasaItems,
    archivedJasaItems,
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

    revalidatePath("/persediaan/daftar");
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
    revalidatePath("/persediaan/daftar");
    revalidatePath("/faktur/baru");
    return { ok: true as const };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengubah status jasa";
    return { ok: false as const, error: message };
  }
}

const ITEM_ACTIVE_ERRORS: Array<[string, string]> = [
  ["STOK_MASIH_ADA", "Stok masih ada — nolkan stok (jual/opname) sebelum mengarsipkan."],
  [
    "MASIH_DIPAKAI_DOKUMEN_TERBUKA",
    "Barang masih dipakai di faktur yang belum lunas atau batal.",
  ],
  ["BARANG_TIDAK_DITEMUKAN", "Barang tidak ditemukan."],
  ["HANYA_BARANG", "Jasa memakai alur arsip jasa."],
];

export async function setItemActiveAction(id: string, active: boolean) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const updated = await withOrg(ctx.orgId, (tx) =>
      setItemActive(tx as never, ctx.orgId, id, active),
    );
    if (!updated) return { ok: false as const, error: "Barang tidak ditemukan." };
    revalidatePath("/persediaan/daftar");
    revalidatePath(`/persediaan/daftar/${id}`);
    revalidatePath("/persediaan/opname/baru");
    revalidatePath("/faktur/baru");
    revalidatePath("/kasir");
    return { ok: true as const, isActive: updated.isActive };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal mengubah status barang";
    const hit = ITEM_ACTIVE_ERRORS.find(([code]) => raw.startsWith(code));
    return { ok: false as const, error: hit ? hit[1] : raw };
  }
}

export async function updateItemAction(payload: {
  id: string;
  name: string;
  category?: string;
  unit?: string;
  minStockAlert?: string;
  standardSellingPriceText?: string;
  barcode?: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let standardSellingPriceMinor = 0n;
    if (payload.standardSellingPriceText?.trim()) {
      try {
        standardSellingPriceMinor = Money.parseIdr(payload.standardSellingPriceText).minor;
      } catch {
        return { ok: false as const, error: "Harga jual tidak valid." };
      }
    }
    const updated = await withOrg(ctx.orgId, (tx) =>
      updateInventoryItem(tx as never, ctx.orgId, payload.id, {
        name: payload.name,
        category: payload.category,
        unit: payload.unit,
        minStockAlert: payload.minStockAlert,
        standardSellingPriceMinor,
        barcode: payload.barcode,
      }),
    );
    revalidatePath("/persediaan/daftar");
    revalidatePath(`/persediaan/daftar/${payload.id}`);
    revalidatePath("/faktur/baru");
    return { ok: true as const, id: updated.id };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal menyimpan perubahan barang";
    const friendly =
      raw.startsWith("NAMA_BARANG_MINIMAL_2_HURUF")
        ? "Nama barang minimal 2 huruf."
        : raw.startsWith("MIN_STOK_TIDAK_VALID")
          ? "Batas min. stok harus angka >= 0."
          : raw.startsWith("HARGA_JUAL_TIDAK_VALID")
            ? "Harga jual harus >= 0."
            : raw.startsWith("BARANG_TIDAK_DITEMUKAN")
              ? "Barang tidak ditemukan."
              : raw;
    return { ok: false as const, error: friendly };
  }
}

export async function updateServiceItemAction(payload: {
  id: string;
  name: string;
  category?: string;
  unit?: string;
  sellingPriceText?: string;
  revenueAccountId?: string | null;
  expenseAccountId?: string | null;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let standardSellingPriceMinor = 0n;
    if (payload.sellingPriceText?.trim()) {
      try {
        standardSellingPriceMinor = Money.parseIdr(payload.sellingPriceText).minor;
      } catch {
        return { ok: false as const, error: "Harga jual tidak valid." };
      }
    }
    const updated = await withOrg(ctx.orgId, (tx) =>
      updateServiceItem(tx as never, ctx.orgId, payload.id, {
        name: payload.name,
        category: payload.category,
        unit: payload.unit,
        standardSellingPriceMinor,
        revenueAccountId: payload.revenueAccountId ?? null,
        expenseAccountId: payload.expenseAccountId ?? null,
      }),
    );
    revalidatePath("/persediaan/daftar");
    revalidatePath(`/persediaan/jasa/${payload.id}`);
    revalidatePath("/faktur/baru");
    return { ok: true as const, id: updated.id };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal menyimpan perubahan jasa";
    const friendly =
      raw.startsWith("NAMA_JASA_MINIMAL_2_HURUF")
        ? "Nama jasa minimal 2 huruf."
        : raw.startsWith("HARGA_JUAL_TIDAK_VALID")
          ? "Harga jual harus >= 0."
          : raw.startsWith("AKUN_PENDAPATAN_TIDAK_DITEMUKAN")
            ? "Akun pendapatan tidak ditemukan."
            : raw.startsWith("AKUN_PENDAPATAN_TIPE_SALAH")
              ? "Akun pendapatan harus bertipe PENDAPATAN."
              : raw.startsWith("AKUN_BEBAN_TIDAK_DITEMUKAN")
                ? "Akun beban tidak ditemukan."
                : raw.startsWith("AKUN_BEBAN_TIPE_SALAH")
                  ? "Akun beban harus bertipe BEBAN."
                  : raw.startsWith("JASA_TIDAK_DITEMUKAN")
                    ? "Jasa tidak ditemukan."
                    : raw;
    return { ok: false as const, error: friendly };
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

export async function updateOpnameItemCostAction(
  opnameId: string,
  itemId: string,
  costText: string,
) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let unitCostMinor = 0n;
    if (costText.trim()) {
      try {
        unitCostMinor = Money.parseIdr(costText).minor;
      } catch {
        return { ok: false as const, error: "Harga modal tidak valid." };
      }
    }
    const res = await withOrg(ctx.orgId, (tx) =>
      updateOpnameItemCost(tx as never, ctx.orgId, opnameId, itemId, unitCostMinor),
    );
    revalidatePath(`/persediaan/opname/${opnameId}`);
    revalidatePath("/persediaan/opname");
    return { ok: true as const, ...res };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal menyimpan harga modal";
    const friendly =
      raw.startsWith("HARGA_MODAL_SUDAH_TERISI")
        ? "Barang ini sudah punya harga modal dari pembelian/saldo awal."
        : raw.startsWith("OPNAME_TIDAK_BISA_DIEDIT")
          ? "Harga modal hanya bisa diisi selama opname masih Draf Perhitungan."
          : raw.startsWith("HARGA_MODAL_TIDAK_VALID")
            ? "Harga modal harus >= 0."
            : raw;
    return { ok: false as const, error: friendly };
  }
}

export async function updateOpnameJournalMemoAction(opnameId: string, memo: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await withOrg(ctx.orgId, (tx) =>
      updateOpnameJournalMemo(tx as never, ctx.orgId, opnameId, memo),
    );
    revalidatePath(`/persediaan/opname/${opnameId}`);
    revalidatePath("/jurnal");
    return { ok: true as const };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal menyimpan catatan jurnal";
    const friendly = raw.startsWith("JURNAL_SUDAH_DIPOSTING")
      ? "Jurnal sudah diposting — catatan tidak bisa diubah lagi."
      : raw.startsWith("JURNAL_BELUM_DIBUAT")
        ? "Draf jurnal belum dibuat."
        : raw;
    return { ok: false as const, error: friendly };
  }
}

export async function cancelStockOpnameAction(opnameId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await withOrg(ctx.orgId, (tx) => cancelStockOpname(tx as never, ctx.orgId, opnameId));
    revalidatePath("/persediaan/opname");
    revalidatePath(`/persediaan/opname/${opnameId}`);
    revalidatePath("/jurnal");
    revalidatePath("/persediaan/daftar");
    return { ok: true as const };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal membatalkan sesi opname";
    const friendly =
      raw.startsWith("OPNAME_SELESAI_TIDAK_BISA_DIBATALKAN")
        ? "Sesi sudah selesai & diposting — tidak bisa dibatalkan. Buat sesi opname koreksi bila perlu."
        : raw.startsWith("OPNAME_SUDAH_DIBATALKAN")
          ? "Sesi ini sudah dibatalkan."
          : raw.startsWith("JURNAL_SUDAH_DIPOSTING")
            ? "Jurnal penyesuaian sudah diposting — sesi tidak bisa dibatalkan."
            : raw.startsWith("OPNAME_TIDAK_DITEMUKAN")
              ? "Sesi opname tidak ditemukan."
              : raw;
    return { ok: false as const, error: friendly };
  }
}

export async function deleteCancelledOpnameAction(opnameId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await withOrg(ctx.orgId, (tx) => deleteCancelledOpname(tx as never, ctx.orgId, opnameId));
    revalidatePath("/persediaan/opname");
    revalidatePath(`/persediaan/opname/${opnameId}`);
    return { ok: true as const };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Gagal menghapus sesi opname";
    const friendly = raw.startsWith("HANYA_OPNAME_DIBATALKAN")
      ? "Hanya sesi yang sudah dibatalkan yang bisa dihapus permanen."
      : raw.startsWith("OPNAME_MASIH_TERHUBUNG_JURNAL")
        ? "Sesi ini masih terhubung ke jurnal. Batalkan sesi lebih dulu."
        : raw.startsWith("OPNAME_TIDAK_DITEMUKAN")
          ? "Sesi opname tidak ditemukan."
          : raw;
    return { ok: false as const, error: friendly };
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
    await saveItemImage({ orgId: ctx.orgId, itemId, buffer, mime: file.type });
    return { ok: true as const };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan foto";
    return { ok: false as const, error: message };
  }
}

export async function deleteItemImageAction(itemId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await removeItemImage({ orgId: ctx.orgId, itemId });
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menghapus foto";
    return { ok: false, error: message };
  }
}

/**
 * Rincian satu barang untuk sheet drawer (dipakai chat Akunio + reusable di app).
 * Lookup per kode SKU (huruf besar, trim). BigInt diserialkan ke string.
 */
export async function getInventoryItemDetailAction(code: string) {
  try {
    const ctx = await requireContext();
    const clean = code.trim().toUpperCase();
    if (!clean) return { ok: false as const, error: "Kode barang kosong." };
    const rows = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, ctx.orgId), eq(inventoryItems.code, clean)))
      .limit(1);
    const item = rows[0];
    if (!item) return { ok: false as const, error: `Barang ${clean} tidak ditemukan.` };
    return {
      ok: true as const,
      data: {
        id: item.id,
        code: item.code,
        name: item.name,
        itemType: item.itemType,
        category: item.category,
        unit: item.unit,
        barcode: item.barcode,
        appBarcode: item.appBarcode,
        currentQty: item.currentQty,
        minStockAlert: item.minStockAlert,
        averageCostMinor: item.averageCostMinor.toString(),
        totalCostMinor: item.totalCostMinor.toString(),
        standardSellingPriceMinor: item.standardSellingPriceMinor.toString(),
        hasPhoto: Boolean(item.imageStorageKey),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memuat barang";
    return { ok: false as const, error: message };
  }
}
