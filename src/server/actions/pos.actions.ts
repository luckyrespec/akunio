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
  type PosPaymentMethod,
} from "@/server/db/repos/pos.repo";
import { Money } from "@/core/money/money";

export interface PosCartLineDTO {
  itemId: string;
  qty: number;
  unitPriceText: string;
  discountText?: string;
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
  cashReceivedText: string;
  headerDiscountText?: string;
  buyerName?: string;
  shiftId?: string | null;
  idempotencyKey: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let cashReceivedMinor: bigint;
    let headerDiscountMinor = 0n;
    try {
      cashReceivedMinor = Money.parseIdr(input.cashReceivedText).minor;
      if (input.headerDiscountText?.trim()) {
        headerDiscountMinor = Money.parseIdr(input.headerDiscountText).minor;
      }
    } catch {
      return { ok: false as const, error: "Nominal tidak valid. Contoh: 1500000 atau Rp1.500.000." };
    }
    const lines: Array<{ itemId: string; qty: number; unitPriceMinor: bigint; discountMinor: bigint }> = [];
    for (const l of input.items) {
      let unitPriceMinor: bigint;
      let discountMinor = 0n;
      try {
        unitPriceMinor = Money.parseIdr(l.unitPriceText).minor;
        if (l.discountText?.trim()) discountMinor = Money.parseIdr(l.discountText).minor;
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
        headerDiscountMinor,
        cashReceivedMinor,
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
