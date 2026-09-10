"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { listInventoryItems } from "@/server/db/repos/inventory.repo";
import {
  checkoutPosSale,
  getPosSaleDetail,
  openShift,
  closeShift,
  postShiftVariance,
  getShiftSummary,
  listOpenShifts,
  type PosPaymentMethod,
} from "@/server/db/repos/pos.repo";
import { Money } from "@/core/money/money";
import { PostingError } from "@/server/db/repos/journals.repo";
import { parseCsv } from "@/core/import/csv";
import { createBatchItemsAction } from "./inventory.actions";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import type { ContactType } from "@/server/db/schema/invoicing";

export interface PosCartLineDTO {
  itemId: string;
  qty: number;
  /** Minor (sudah dikali 100). BUKAN teks rupiah — Money.parseIdr akan mengalikan 100 lagi. */
  unitPriceMinor: string;
  /** Minor, opsional. */
  discountMinor?: string;
}

/** Validasi string minor murni (digit saja) — untuk nilai yang sudah minor dari client. */
function parseMinorText(raw: string, label: string): bigint {
  const s = (raw ?? "").trim();
  if (!/^\d+$/.test(s)) throw new Error(`${label} tidak valid.`);
  return BigInt(s);
}

export async function getPosCashAccountsAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const rows = await listAccounts(db, ctx.orgId);
    return {
      ok: true as const,
      data: rows
        .filter((a) => a.isCash && !a.archivedAt)
        .map((a) => ({ id: a.id, code: a.code, name: a.name })),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat kas." };
  }
}

export async function getPosCatalogAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const rows = await listInventoryItems(db, ctx.orgId);
    return {
      ok: true as const,
      data: rows
        .filter((r) => r.itemType === "BARANG" && r.isActive)
        .map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          barcode: r.barcode,
          appBarcode: r.appBarcode,
          unit: r.unit,
          category: r.category,
          qty: String(r.currentQty),
          price: r.standardSellingPriceMinor.toString(),
          minStock: String(r.minStockAlert ?? "0"),
        })),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat barang." };
  }
}

export async function checkoutPosSaleAction(input: {
  items: PosCartLineDTO[];
  paymentMethod: PosPaymentMethod;
  cashAccountId: string;
  /** Minor (digit saja). Client mem-parse teks rupiah via Money.parseIdr lebih dulu. */
  cashReceivedMinor: string;
  buyerName?: string;
  shiftId?: string | null;
  idempotencyKey: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let cashReceived: bigint;
    try {
      cashReceived = parseMinorText(input.cashReceivedMinor, "Uang diterima");
    } catch {
      return { ok: false as const, error: "Nominal tidak valid. Contoh: 1500000 atau Rp1.500.000." };
    }
    const lines: Array<{ itemId: string; qty: number; unitPriceMinor: bigint; discountMinor: bigint }> = [];
    for (const l of input.items) {
      let unitPriceMinor: bigint;
      let discountMinor = 0n;
      try {
        unitPriceMinor = parseMinorText(l.unitPriceMinor, "Harga barang");
        if (l.discountMinor?.trim()) discountMinor = parseMinorText(l.discountMinor, "Diskon");
      } catch {
        return { ok: false as const, error: "Harga barang tidak valid." };
      }
      lines.push({ itemId: l.itemId, qty: l.qty, unitPriceMinor, discountMinor });
    }
    const out = await withOrg(ctx.orgId, (tx) =>
      checkoutPosSale(tx as never, ctx.orgId, ctx.userEmail, {
        soldDate: new Date().toISOString().slice(0, 10),
        paymentMethod: input.paymentMethod,
        cashAccountId: input.cashAccountId,
        lines,
        cashReceivedMinor: cashReceived,
        buyerName: input.buyerName ?? null,
        shiftId: input.shiftId ?? null,
        idempotencyKey: input.idempotencyKey,
      }));
    revalidatePath("/kasir");
    revalidatePath("/kas-bank/histori");
    revalidatePath("/jurnal");
    revalidatePath("/buku-besar");
    return {
      ok: true as const,
      data: {
        saleId: out.saleId,
        number: out.number,
        total: out.totalMinor.toString(),
        change: out.changeMinor.toString(),
      },
    };
  } catch (e) {
    if (e instanceof PostingError) {
      return { ok: false as const, error: `VALIDASI_GAGAL: ${JSON.stringify(e.issues)}` };
    }
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menyimpan penjualan." };
  }
}

export async function getPosSaleAction(saleId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const detail = await db.transaction((tx) => getPosSaleDetail(tx as never, ctx.orgId, saleId));
    if (!detail) return { ok: false as const, error: "Penjualan tidak ditemukan." };
    return {
      ok: true as const,
      data: {
        number: detail.sale.number,
        soldDate: detail.sale.soldDate,
        paymentMethod: detail.sale.paymentMethod,
        total: detail.sale.totalMinor.toString(),
        cashReceived: detail.sale.cashReceivedMinor.toString(),
        change: detail.sale.changeMinor.toString(),
        buyerName: detail.sale.buyerName,
        journalNumber: detail.journalNumber,
        items: detail.items.map((it) => ({
          code: it.itemCode,
          name: it.itemName,
          qty: String(it.qty),
          unitPrice: it.unitPriceMinor.toString(),
          discount: it.discountMinor.toString(),
          lineTotal: it.lineTotalMinor.toString(),
        })),
      },
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat struk." };
  }
}

export async function getOpenShiftsAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const rows = await db.transaction((tx) => listOpenShifts(tx as never, ctx.orgId));
    return {
      ok: true as const,
      data: rows.map((r) => ({
        id: r.id,
        cashAccountId: r.cashAccountId,
        cashCode: r.cashCode,
        cashName: r.cashName,
        openedAt: r.openedAt?.toISOString() ?? null,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat shift." };
  }
}

export async function openShiftAction(input: { cashAccountId: string; openingCashText: string }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let openingCashMinor: bigint;
    try {
      openingCashMinor = Money.parseIdr(input.openingCashText || "0").minor;
    } catch {
      return { ok: false as const, error: "Kas awal tidak valid." };
    }
    const shift = await withOrg(ctx.orgId, (tx) =>
      openShift(tx as never, ctx.orgId, ctx.userEmail, {
        cashAccountId: input.cashAccountId,
        openingCashMinor,
      }));
    revalidatePath("/kas-bank/setoran");
    return { ok: true as const, data: { shiftId: shift.id } };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuka shift." };
  }
}

export async function getShiftSummaryAction(shiftId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const s = await db.transaction((tx) => getShiftSummary(tx as never, ctx.orgId, shiftId));
    return {
      ok: true as const,
      data: {
        shiftId: s.shift.id,
        status: s.shift.status,
        saleCount: s.saleCount,
        tunai: s.tunaiMinor.toString(),
        qris: s.qrisMinor.toString(),
        transfer: s.transferMinor.toString(),
        openingCash: s.shift.openingCashMinor.toString(),
        expectedCash: s.expectedCashMinor.toString(),
        hasVarianceDraft: !!s.shift.varianceJournalEntryId,
      },
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat shift." };
  }
}

export async function closeShiftAction(input: {
  shiftId: string;
  cashCountedText: string;
  varianceAccountId?: string | null;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let cashCountedMinor: bigint;
    try {
      cashCountedMinor = Money.parseIdr(input.cashCountedText).minor;
    } catch {
      return { ok: false as const, error: "Hasil hitung kas tidak valid." };
    }
    const out = await withOrg(ctx.orgId, (tx) =>
      closeShift(tx as never, ctx.orgId, ctx.userEmail, {
        shiftId: input.shiftId,
        cashCountedMinor,
        varianceAccountId: input.varianceAccountId ?? null,
      }));
    revalidatePath("/kas-bank/setoran");
    revalidatePath("/jurnal");
    return {
      ok: true as const,
      data: {
        variance: out.varianceMinor.toString(),
        varianceJournalEntryId: out.varianceJournalEntryId,
      },
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menutup shift." };
  }
}

export async function postShiftVarianceAction(shiftId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const out = await withOrg(ctx.orgId, (tx) =>
      postShiftVariance(tx as never, ctx.orgId, ctx.userEmail, shiftId));
    revalidatePath("/kas-bank/setoran");
    revalidatePath("/jurnal");
    return { ok: true as const, data: out };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memposting selisih." };
  }
}

export async function getVarianceAccountOptionsAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const rows = await listAccounts(db, ctx.orgId);
    return {
      ok: true as const,
      data: rows
        .filter((a) => !a.archivedAt && !a.isCash)
        .map((a) => ({ id: a.id, code: a.code, name: a.name })),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat akun." };
  }
}

function col(row: string[], headers: string[], ...aliases: string[]): string {
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i >= 0) return (row[i] ?? "").trim();
  }
  return "";
}

export interface CsvImportResult {
  ok: boolean;
  count?: number;
  skipped?: Array<{ index: number; reason: string }>;
  errors?: Array<{ index: number; message: string }>;
  error?: string;
}

/** Import produk dari teks CSV → createBatchItemsAction (laporan per baris bawaan). */
export async function importProductsCsvAction(csvText: string): Promise<CsvImportResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!ctx) return { ok: false, error: "Sesi berakhir." };
    const { headers, rows } = parseCsv(csvText);
    if (headers.length === 0) return { ok: false, error: "CSV kosong atau tanpa header." };
    if (!headers.some((h) => ["nama", "name"].includes(h))) {
      return { ok: false, error: "Kolom nama/name wajib ada." };
    }
    const items = [];
    const errors: Array<{ index: number; message: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = col(r, headers, "nama", "name");
      if (!name) continue;
      const qtyRaw = col(r, headers, "stok_awal", "stok", "qty");
      let initialQty: number | undefined;
      if (qtyRaw) {
        const q = Number(qtyRaw.replaceAll(".", "").replace(",", "."));
        if (!Number.isFinite(q) || q < 0) {
          errors.push({ index: i, message: `Stok awal tidak valid: ${qtyRaw}` });
          continue;
        }
        initialQty = q;
      }
      items.push({
        code: col(r, headers, "kode", "code", "sku") || undefined,
        name,
        barcode: col(r, headers, "barcode") || undefined,
        unit: col(r, headers, "satuan", "unit") || undefined,
        category: col(r, headers, "kategori", "category") || undefined,
        minStockAlert: col(r, headers, "min_stok", "min") || undefined,
        standardSellingPriceText: col(r, headers, "harga_jual", "jual", "price") || undefined,
        initialQty,
        initialCostText: col(r, headers, "harga_beli", "modal", "cost") || undefined,
      });
    }
    if (items.length === 0 && errors.length === 0) {
      return { ok: false, error: "Tidak ada baris produk valid." };
    }
    const res = await createBatchItemsAction(items);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      count: res.count,
      skipped: res.skipped,
      errors: [...errors, ...(res.errors ?? []).map((e) => ({ index: e.index, message: e.message }))],
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengimpor CSV." };
  }
}

/** Import kontak dari teks CSV (tipe PELANGGAN/VENDOR/BOTH, default PELANGGAN). */
export async function importContactsCsvAction(csvText: string): Promise<CsvImportResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { headers, rows } = parseCsv(csvText);
    if (headers.length === 0) return { ok: false, error: "CSV kosong atau tanpa header." };
    if (!headers.some((h) => ["nama", "name"].includes(h))) {
      return { ok: false, error: "Kolom nama/name wajib ada." };
    }
    let count = 0;
    const errors: Array<{ index: number; message: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = col(r, headers, "nama", "name");
      if (!name) continue;
      const typeRaw = col(r, headers, "tipe", "type").toLowerCase();
      const type: ContactType = /vendor|pemasok|supplier/.test(typeRaw)
        ? "VENDOR"
        : /both|keduanya|pelanggan.*vendor|vendor.*pelanggan/.test(typeRaw)
          ? "BOTH"
          : "CUSTOMER";
      try {
        await createContactRepo(db, ctx.orgId, {
          type,
          name,
          email: col(r, headers, "email") || null,
          phone: col(r, headers, "telepon", "phone", "telp") || null,
          address: col(r, headers, "alamat", "address") || null,
        });
        count++;
      } catch (e) {
        errors.push({ index: i, message: e instanceof Error ? e.message : "Gagal menyimpan baris" });
      }
    }
    revalidatePath("/kontak");
    return { ok: true, count, skipped: [], errors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengimpor CSV." };
  }
}
