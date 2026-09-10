import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { posSales, posSaleItems, posSaleSeqCounters, posShifts } from "../schema/pos";
import { kasBankEntries } from "../schema/cash-bank";
import { accounts } from "../schema/org";
import { inventoryItems } from "../schema/inventory";
import { journalEntries } from "../schema/journal";
import { postJournalEntry, createDraftJournalEntry, postDraftEntry } from "./journals.repo";
import { resolveRevenueAccountId, resolveCogsAccountId } from "./accounts.repo";
import { getInventorySettings, lockInventoryPolicy } from "./inventory.repo";
import { findPeriodByDate } from "./periods.repo";
import {
  applyCatalogStockOut,
  resolveInventoryControlAccountId,
} from "@/server/invoicing/posting";
import type { JournalLineInput } from "@/core/journals/types";

export type PosPaymentMethod = "TUNAI" | "QRIS" | "TRANSFER";

export interface PosCheckoutLineInput {
  itemId: string;
  qty: number;
  unitPriceMinor: bigint;
  discountMinor?: bigint;
}

export interface PosCheckoutInput {
  soldDate: string;
  paymentMethod: PosPaymentMethod;
  cashAccountId: string;
  lines: PosCheckoutLineInput[];
  headerDiscountMinor?: bigint;
  cashReceivedMinor: bigint;
  buyerName?: string | null;
  shiftId?: string | null;
  idempotencyKey?: string | null;
}

export interface PosCheckoutResult {
  saleId: string;
  number: string;
  journalEntryId: string;
  journalNumber: string;
  kasEntryId: string;
  totalMinor: bigint;
  changeMinor: bigint;
}

function moneyForQty(unitMinor: bigint, qty: number): bigint {
  return (unitMinor * BigInt(Math.round(Math.abs(qty) * 10000))) / 10000n;
}

async function getAccountByCodeOrNull(q: Queryable, orgId: string, code: string) {
  const [row] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
  return row ?? null;
}

async function nextPosNumber(q: Queryable, orgId: string, soldDate: string): Promise<string> {
  const year = soldDate.slice(0, 4);
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pos:${orgId}:${year}`}))`);
  const res = await q.execute(sql`
    INSERT INTO pos_sale_seq_counters (org_id, year, last)
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT (org_id, year)
    DO UPDATE SET last = pos_sale_seq_counters.last + 1
    RETURNING last
  `);
  const last = Number((res.rows?.[0] as { last: number } | undefined)?.last ?? 1);
  return `POS-${year}-${String(last).padStart(4, "0")}`;
}

/** Checkout kasir: jurnal POS + mutasi stok + baris log kas — atomik.
 *  TIDAK memanggil createCashEntryRepo (akan tercipta jurnal ganda dan
 *  guard menolak akun kontrol Persediaan). Baris kas ditulis langsung
 *  menunjuk ke jurnal POS agar Histori Bank tetap lengkap. */
export async function checkoutPosSale(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: PosCheckoutInput,
): Promise<PosCheckoutResult> {
  if (input.idempotencyKey) {
    const [dupe] = await q
      .select()
      .from(posSales)
      .where(and(eq(posSales.orgId, orgId), eq(posSales.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (dupe) {
      return {
        saleId: dupe.id,
        number: dupe.number,
        journalEntryId: dupe.journalEntryId!,
        journalNumber: "",
        kasEntryId: dupe.kasEntryId!,
        totalMinor: dupe.totalMinor,
        changeMinor: dupe.changeMinor,
      };
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.soldDate)) throw new Error("TANGGAL_TIDAK_VALID");
  if (input.paymentMethod !== "TUNAI" && input.paymentMethod !== "QRIS" && input.paymentMethod !== "TRANSFER") {
    throw new Error("METODE_BAYAR_TIDAK_VALID");
  }
  if (!input.lines || input.lines.length === 0) throw new Error("KERANJANG_KOSONG");
  for (const l of input.lines) {
    if (!Number.isFinite(l.qty) || l.qty <= 0) throw new Error("QTY_TIDAK_VALID: kuantitas harus > 0");
    if (l.unitPriceMinor < 0n) throw new Error("HARGA_TIDAK_VALID");
    if ((l.discountMinor ?? 0n) < 0n) throw new Error("DISKON_TIDAK_VALID");
  }
  const headerDiscount = input.headerDiscountMinor ?? 0n;
  if (headerDiscount < 0n) throw new Error("DISKON_TIDAK_VALID");

  const [cash] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, input.cashAccountId)))
    .limit(1);
  if (!cash) throw new Error("AKUN_TIDAK_DITEMUKAN");
  if (cash.archivedAt) throw new Error("AKUN_DIARSIPKAN");
  if (!cash.isCash) throw new Error("BUKAN_AKUN_KAS: pilih rekening Kas atau Bank");

  let shiftId: string | null = input.shiftId ?? null;
  if (shiftId) {
    const [shift] = await q
      .select()
      .from(posShifts)
      .where(and(eq(posShifts.orgId, orgId), eq(posShifts.id, shiftId)))
      .limit(1);
    if (!shift) throw new Error("SHIFT_TIDAK_DITEMUKAN");
    if (shift.status !== "BUKA") throw new Error("SHIFT_TUTUP: buka shift baru untuk berjualan");
  }

  const period = await findPeriodByDate(q, orgId, input.soldDate);
  if (!period) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  if (period.status !== "OPEN") throw new Error(`PERIODE_${period.status}: penjualan hanya pada periode OPEN`);

  const settings = await getInventorySettings(q, orgId);
  const recording = settings?.recordingMethod ?? "PERPETUAL";
  const valuation = settings?.valuationMethod ?? "WEIGHTED_AVERAGE";

  const ids = [...new Set(input.lines.map((l) => l.itemId))];
  const masters = await q
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), inArray(inventoryItems.id, ids)));
  const masterById = new Map(masters.map((m) => [m.id, m]));

  type Prepared = { master: (typeof masters)[number]; qty: number; unitPriceMinor: bigint; discountMinor: bigint; netMinor: bigint };
  const prepared: Prepared[] = [];
  let subtotal = 0n;
  let itemDiscounts = 0n;
  for (const l of input.lines) {
    const master = masterById.get(l.itemId);
    if (!master) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${l.itemId}`);
    if (master.itemType !== "BARANG") throw new Error("KASIR_HANYA_BARANG: jasa dijual lewat Faktur");
    if (!master.isActive) throw new Error(`ITEM_NONAKTIF: ${master.code}`);
    const gross = moneyForQty(l.unitPriceMinor, l.qty);
    const disc = l.discountMinor ?? 0n;
    if (disc > gross) throw new Error(`DISKON_MELEBIHI_HARGA: ${master.code}`);
    const net = gross - disc;
    subtotal += gross;
    itemDiscounts += disc;
    prepared.push({ master, qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountMinor: disc, netMinor: net });
  }

  const discountTotal = itemDiscounts + headerDiscount;
  const total = subtotal - discountTotal;
  if (total <= 0n) throw new Error("TOTAL_TIDAK_VALID");
  if (input.cashReceivedMinor < total) throw new Error("TUNAI_KURANG: uang diterima kurang dari total");
  const change = input.cashReceivedMinor - total;

  const revenueGroups = new Map<string, bigint>();
  const orgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  for (const p of prepared) {
    const accId = resolveRevenueAccountId(orgAccounts, p.master.revenueAccountId);
    revenueGroups.set(accId, (revenueGroups.get(accId) ?? 0n) + p.netMinor);
  }
  if (headerDiscount > 0n) {
    let biggest: string | null = null;
    for (const [id, v] of revenueGroups) {
      if (biggest === null || v > (revenueGroups.get(biggest) ?? 0n)) biggest = id;
    }
    revenueGroups.set(biggest!, (revenueGroups.get(biggest!) ?? 0n) - headerDiscount);
  }

  const saleId = randomUUID();
  const number = await nextPosNumber(q, orgId, input.soldDate);

  let hppTotal = 0n;
  const hppLinks: Array<{ kind: "PERSEDIAAN"; refId: string; amountMinor: bigint; qty: number }> = [];
  if (recording === "PERPETUAL") {
    for (const p of prepared) {
      await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inv-item:${p.master.id}`}))`);
      const [fresh] = await q
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, p.master.id), eq(inventoryItems.orgId, orgId)))
        .limit(1);
      if (!fresh) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${p.master.code}`);
      if (Number(fresh.currentQty) < p.qty - 1e-9) {
        throw new Error(`STOK_KURANG: ${fresh.code} sisa ${fresh.currentQty}`);
      }
      const cost = await applyCatalogStockOut(
        q, orgId, fresh, p.qty, valuation, input.soldDate,
        { type: "POS", id: saleId },
        `Jual ${number} (${fresh.code})`,
      );
      hppTotal += cost;
      hppLinks.push({ kind: "PERSEDIAAN", refId: fresh.id, amountMinor: cost, qty: p.qty });
    }
  }

  const lines: JournalLineInput[] = [
    { accountId: input.cashAccountId, debitMinor: total, creditMinor: 0n, memo: `Kas penjualan ${number}` },
  ];
  for (const [accountId, netto] of revenueGroups) {
    if (netto === 0n) continue;
    lines.push({ accountId, debitMinor: 0n, creditMinor: netto, memo: `Pendapatan ${number}` });
  }
  if (recording === "PERPETUAL" && hppTotal > 0n) {
    const cogsAccId = resolveCogsAccountId(orgAccounts, settings?.cogsAccountId ?? null);
    const invAccId = await resolveInventoryControlAccountId(q, orgId);
    lines.push({ accountId: cogsAccId, debitMinor: hppTotal, creditMinor: 0n, memo: `HPP ${number}` });
    lines.push({
      accountId: invAccId, debitMinor: 0n, creditMinor: hppTotal,
      memo: `Persediaan keluar ${number}`, subledgerLinks: hppLinks,
    });
  }

  const je = await postJournalEntry(q, orgId, actorEmail, {
    dateISO: input.soldDate,
    memo: `Penjualan kasir ${number}`,
    source: "POS",
    idempotencyKey: input.idempotencyKey ? `pos:${input.idempotencyKey}` : `pos:${saleId}`,
    lines,
  });

  const firstRevenueId = [...revenueGroups.keys()][0];
  const [kasRow] = await q
    .insert(kasBankEntries)
    .values({
      orgId,
      kind: "TERIMA",
      entryDate: input.soldDate,
      cashAccountId: input.cashAccountId,
      counterAccountId: firstRevenueId,
      contactId: null,
      amountMinor: total,
      memo: `POS ${number}`,
      number,
      journalEntryId: je.id,
      status: "POSTED",
      createdBy: actorEmail,
    })
    .returning({ id: kasBankEntries.id });

  await q.insert(posSales).values({
    id: saleId,
    orgId,
    shiftId,
    number,
    soldDate: input.soldDate,
    paymentMethod: input.paymentMethod,
    cashAccountId: input.cashAccountId,
    subtotalMinor: subtotal,
    discountMinor: discountTotal,
    totalMinor: total,
    cashReceivedMinor: input.cashReceivedMinor,
    changeMinor: change,
    buyerName: input.buyerName?.trim() || null,
    journalEntryId: je.id,
    kasEntryId: kasRow.id,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  for (const p of prepared) {
    const unitCost = p.qty > 0 && recording === "PERPETUAL"
      ? (hppLinks.find((h) => h.refId === p.master.id)?.amountMinor ?? 0n)
      : 0n;
    await q.insert(posSaleItems).values({
      orgId,
      saleId,
      itemId: p.master.id,
      qty: String(p.qty),
      unitPriceMinor: p.unitPriceMinor,
      discountMinor: p.discountMinor,
      lineTotalMinor: p.netMinor,
      unitCostMinor: p.qty > 0 ? (unitCost * 10000n) / BigInt(Math.round(p.qty * 10000)) : 0n,
    });
  }

  await lockInventoryPolicy(q, orgId);

  return {
    saleId,
    number,
    journalEntryId: je.id,
    journalNumber: je.number,
    kasEntryId: kasRow.id,
    totalMinor: total,
    changeMinor: change,
  };
}

export interface PosSaleDetail {
  sale: typeof posSales.$inferSelect;
  items: Array<typeof posSaleItems.$inferSelect & { itemName: string; itemCode: string }>;
  journalNumber: string | null;
}

export async function getPosSaleDetail(q: Queryable, orgId: string, saleId: string): Promise<PosSaleDetail | null> {
  const [sale] = await q
    .select()
    .from(posSales)
    .where(and(eq(posSales.orgId, orgId), eq(posSales.id, saleId)))
    .limit(1);
  if (!sale) return null;
  const rows = await q
    .select({ line: posSaleItems, itemName: inventoryItems.name, itemCode: inventoryItems.code })
    .from(posSaleItems)
    .innerJoin(inventoryItems, eq(inventoryItems.id, posSaleItems.itemId))
    .where(eq(posSaleItems.saleId, sale.id));
  let journalNumber: string | null = null;
  if (sale.journalEntryId) {
    const [je] = await q
      .select({ number: journalEntries.number })
      .from(journalEntries)
      .where(eq(journalEntries.id, sale.journalEntryId))
      .limit(1);
    journalNumber = je?.number ?? null;
  }
  return {
    sale,
    items: rows.map((r) => ({ ...r.line, itemName: r.itemName, itemCode: r.itemCode })),
    journalNumber,
  };
}

export interface ShiftSummary {
  shift: typeof posShifts.$inferSelect;
  saleCount: number;
  tunaiMinor: bigint;
  qrisMinor: bigint;
  transferMinor: bigint;
  expectedCashMinor: bigint;
}

export async function listOpenShifts(q: Queryable, orgId: string) {
  const rows = await q
    .select({
      id: posShifts.id,
      cashAccountId: posShifts.cashAccountId,
      openedAt: posShifts.openedAt,
      cashCode: accounts.code,
      cashName: accounts.name,
    })
    .from(posShifts)
    .innerJoin(accounts, eq(accounts.id, posShifts.cashAccountId))
    .where(and(eq(posShifts.orgId, orgId), eq(posShifts.status, "BUKA")))
    .orderBy(posShifts.openedAt);
  return rows;
}

export async function openShift(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: { cashAccountId: string; openingCashMinor: bigint },
): Promise<typeof posShifts.$inferSelect> {
  const [cash] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, input.cashAccountId)))
    .limit(1);
  if (!cash) throw new Error("AKUN_TIDAK_DITEMUKAN");
  if (cash.archivedAt) throw new Error("AKUN_DIARSIPKAN");
  if (!cash.isCash) throw new Error("BUKAN_AKUN_KAS: shift hanya untuk rekening Kas atau Bank");
  if (input.openingCashMinor < 0n) throw new Error("KAS_AWAL_TIDAK_VALID");
  const [open] = await q
    .select({ id: posShifts.id })
    .from(posShifts)
    .where(and(
      eq(posShifts.orgId, orgId),
      eq(posShifts.cashAccountId, input.cashAccountId),
      eq(posShifts.status, "BUKA"),
    ))
    .limit(1);
  if (open) throw new Error("SHIFT_SUDAH_BUKA: tutup shift berjalan dulu");
  const [shift] = await q
    .insert(posShifts)
    .values({
      orgId,
      cashAccountId: input.cashAccountId,
      openedBy: actorEmail,
      openingCashMinor: input.openingCashMinor,
      status: "BUKA",
    })
    .returning();
  return shift;
}

export async function getShiftSummary(q: Queryable, orgId: string, shiftId: string): Promise<ShiftSummary> {
  const [shift] = await q
    .select()
    .from(posShifts)
    .where(and(eq(posShifts.orgId, orgId), eq(posShifts.id, shiftId)))
    .limit(1);
  if (!shift) throw new Error("SHIFT_TIDAK_DITEMUKAN");
  const rows = await q
    .select({ method: posSales.paymentMethod, total: posSales.totalMinor })
    .from(posSales)
    .where(and(eq(posSales.orgId, orgId), eq(posSales.shiftId, shiftId)));
  let tunai = 0n, qris = 0n, transfer = 0n;
  for (const r of rows) {
    if (r.method === "TUNAI") tunai += r.total;
    else if (r.method === "QRIS") qris += r.total;
    else transfer += r.total;
  }
  return {
    shift,
    saleCount: rows.length,
    tunaiMinor: tunai,
    qrisMinor: qris,
    transferMinor: transfer,
    expectedCashMinor: shift.openingCashMinor + tunai,
  };
}

export async function closeShift(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: { shiftId: string; cashCountedMinor: bigint; varianceAccountId?: string | null; dateISO?: string },
): Promise<{ shift: typeof posShifts.$inferSelect; varianceMinor: bigint; varianceJournalEntryId: string | null }> {
  const summary = await getShiftSummary(q, orgId, input.shiftId);
  if (summary.shift.status !== "BUKA") throw new Error("SHIFT_SUDAH_TUTUP");
  if (input.cashCountedMinor < 0n) throw new Error("KAS_HITUNG_TIDAK_VALID");
  const variance = input.cashCountedMinor - summary.expectedCashMinor;
  const dateISO = input.dateISO ?? new Date().toISOString().slice(0, 10);

  let varianceJournalEntryId: string | null = summary.shift.varianceJournalEntryId;
  if (variance !== 0n && input.varianceAccountId && !varianceJournalEntryId) {
    const [varianceAcc] = await q
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, input.varianceAccountId)))
      .limit(1);
    if (!varianceAcc) throw new Error("AKUN_TIDAK_DITEMUKAN");
    if (varianceAcc.archivedAt) throw new Error("AKUN_DIARSIPKAN");
    const abs = variance < 0n ? -variance : variance;
    const draft = await createDraftJournalEntry(q, orgId, {
      dateISO,
      memo: `Selisih setoran shift ${summary.shift.id.slice(0, 8)}`,
      source: "POS_SELISIH",
      lines: variance > 0n
        ? [
            { accountId: summary.shift.cashAccountId, debitMinor: abs, creditMinor: 0n, memo: "Kas selisih lebih" },
            { accountId: varianceAcc.id, debitMinor: 0n, creditMinor: abs, memo: "Selisih lebih setoran" },
          ]
        : [
            { accountId: varianceAcc.id, debitMinor: abs, creditMinor: 0n, memo: "Selisih kurang setoran" },
            { accountId: summary.shift.cashAccountId, debitMinor: 0n, creditMinor: abs, memo: "Kas selisih kurang" },
          ],
    });
    varianceJournalEntryId = draft.id;
  }

  const [closed] = await q
    .update(posShifts)
    .set({ status: "TUTUP", closedAt: new Date(), varianceJournalEntryId, updatedAt: new Date() })
    .where(eq(posShifts.id, summary.shift.id))
    .returning();
  return { shift: closed, varianceMinor: variance, varianceJournalEntryId };
}

export async function postShiftVariance(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  shiftId: string,
): Promise<{ journalEntryId: string }> {
  const [shift] = await q
    .select()
    .from(posShifts)
    .where(and(eq(posShifts.orgId, orgId), eq(posShifts.id, shiftId)))
    .limit(1);
  if (!shift) throw new Error("SHIFT_TIDAK_DITEMUKAN");
  if (!shift.varianceJournalEntryId) throw new Error("TIDAK_ADA_SELISIH: tidak ada jurnal selisih untuk diposting");
  const [entry] = await q
    .select({ status: journalEntries.status })
    .from(journalEntries)
    .where(eq(journalEntries.id, shift.varianceJournalEntryId))
    .limit(1);
  if (!entry) throw new Error("JURNAL_TIDAK_DITEMUKAN");
  if (entry.status === "POSTED") return { journalEntryId: shift.varianceJournalEntryId };
  await postDraftEntry(q, orgId, actorEmail, shift.varianceJournalEntryId);
  return { journalEntryId: shift.varianceJournalEntryId };
}
