import { Db } from "@/server/db";
import { type Queryable } from "@/server/db/repos/queryable";
import { invoices, invoicePayments } from "@/server/db/schema/invoicing";
import { accounts } from "@/server/db/schema/org";
import {
  inventoryItems,
  inventoryLayers,
  inventoryTransactions,
} from "@/server/db/schema/inventory";
import { getInvoiceByIdRepo } from "@/server/db/repos/invoices.repo";
import { getInventorySettings } from "@/server/db/repos/inventory.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { calculateItemTotal } from "@/core/invoicing/calculations";
import { consumeFifoLayers } from "@/core/inventory/valuation";
import type { FifoLayer } from "@/core/inventory/types";
import { eq, and, asc, inArray, sql } from "drizzle-orm";

type CatalogMaster = typeof inventoryItems.$inferSelect;

async function getAccountByCodeOrNull(q: Queryable, orgId: string, code: string) {
  const [row] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
  return row ?? null;
}

function qtyToDb(qty: number): string {
  return String(qty);
}

function costForQty(unitCostMinor: bigint, qty: number): bigint {
  return (unitCostMinor * BigInt(Math.round(Math.abs(qty) * 10000))) / 10000n;
}

/** Mutasi OUT satu item barang untuk faktur penjualan. Mengembalikan HPP (biaya) terpakai.
 *  Stok boleh minus (warning di UI, bukan blokir): shortfall FIFO dihargai rata-rata. */
async function applyInvoiceStockOut(
  tx: Queryable,
  orgId: string,
  master: CatalogMaster,
  qty: number,
  valuation: "WEIGHTED_AVERAGE" | "FIFO",
  dateISO: string,
  sourceId: string,
  memo: string,
): Promise<bigint> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inv-item:${master.id}`}))`);
  const [fresh] = await tx
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, master.id), eq(inventoryItems.orgId, orgId)))
    .limit(1);
  if (!fresh) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${master.code}`);
  if (fresh.itemType !== "BARANG") return 0n;

  const currentQty = Number(fresh.currentQty);
  const currentTotal = fresh.totalCostMinor;
  let consumedCostMinor: bigint;

  if (valuation === "FIFO") {
    const rows = await tx
      .select()
      .from(inventoryLayers)
      .where(and(eq(inventoryLayers.orgId, orgId), eq(inventoryLayers.itemId, fresh.id)))
      .orderBy(asc(inventoryLayers.date), asc(inventoryLayers.createdAt));
    const layers: FifoLayer[] = rows.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      date: l.date,
      initialQty: Number(l.initialQty),
      remainingQty: Number(l.remainingQty),
      unitCostMinor: l.unitCostMinor,
      referenceType: l.referenceType as FifoLayer["referenceType"],
      referenceId: l.referenceId,
    }));
    try {
      const r = consumeFifoLayers(layers, qty);
      consumedCostMinor = r.consumedCostMinor;
      for (const c of r.consumedBreakdown) {
        if (!c.layerId) continue;
        const layer = layers.find((x) => x.id === c.layerId)!;
        await tx
          .update(inventoryLayers)
          .set({ remainingQty: qtyToDb(layer.remainingQty - c.qtyConsumed) })
          .where(eq(inventoryLayers.id, c.layerId));
      }
    } catch {
      // Shortfall: habiskan semua layer, sisanya hargai rata-rata.
      const availCost = layers.reduce((a, l) => a + costForQty(l.unitCostMinor, l.remainingQty), 0n);
      for (const l of layers) {
        if (!l.id || l.remainingQty <= 1e-9) continue;
        await tx.update(inventoryLayers).set({ remainingQty: "0" }).where(eq(inventoryLayers.id, l.id));
      }
      const available = layers.reduce((a, l) => a + l.remainingQty, 0);
      consumedCostMinor = availCost + costForQty(fresh.averageCostMinor, qty - available);
    }
  } else {
    consumedCostMinor = costForQty(fresh.averageCostMinor, qty);
  }

  const newQty = currentQty - qty;
  const newTotal = currentTotal - consumedCostMinor;
  await tx
    .update(inventoryItems)
    .set({ currentQty: qtyToDb(newQty), totalCostMinor: newTotal, updatedAt: new Date() })
    .where(eq(inventoryItems.id, fresh.id));

  const unitCostMinor = qty > 0 ? (consumedCostMinor * 10000n) / BigInt(Math.round(qty * 10000)) : 0n;
  await tx.insert(inventoryTransactions).values({
    orgId,
    itemId: fresh.id,
    date: dateISO,
    type: "OUT",
    qty: qtyToDb(qty),
    unitCostMinor,
    totalCostMinor: consumedCostMinor,
    resultingQty: qtyToDb(newQty),
    resultingTotalCostMinor: newTotal,
    sourceType: "INVOICE",
    sourceId,
    memo,
  });
  return consumedCostMinor;
}

async function getAccountByCode(q: Queryable, orgId: string, code: string) {
  const [row] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
  if (!row) {
    throw new Error(`Akun dengan kode '${code}' tidak ditemukan pada bagan akun (COA).`);
  }
  return row;
}

export async function postInvoiceToLedger(
  db: Db,
  orgId: string,
  invoiceId: string,
  actorEmail: string
): Promise<string> {
  const inv = await getInvoiceByIdRepo(db, orgId, invoiceId);
  if (!inv) {
    throw new Error(`Faktur dengan ID ${invoiceId} tidak ditemukan.`);
  }

  if (inv.journalEntryId) {
    return inv.journalEntryId;
  }

  return db.transaction(async (tx) => {
    const lines: Array<{ accountId: string; debitMinor: bigint; creditMinor: bigint; memo?: string }> = [];

    if (inv.type === "INVOICE") {
      // Penjualan (Piutang) — pendapatan dipecah per akun (barang vs jasa vs manual),
      // barang (PERPETUAL) mutasi OUT + HPP, jasa tanpa mutasi.
      const arAccount = await getAccountByCode(tx, orgId, "1200"); // Piutang Usaha

      const linkedIds = [
        ...new Set(inv.items.map((i) => i.catalogItemId).filter((v): v is string => !!v)),
      ];
      const masters =
        linkedIds.length > 0
          ? await tx
              .select()
              .from(inventoryItems)
              .where(and(eq(inventoryItems.orgId, orgId), inArray(inventoryItems.id, linkedIds)))
          : [];
      const masterById = new Map(masters.map((m) => [m.id, m]));

      const settings = await getInventorySettings(tx, orgId);
      const recording = settings?.recordingMethod ?? "PERPETUAL";
      const valuation = settings?.valuationMethod ?? "WEIGHTED_AVERAGE";

      const revenueGroups = new Map<string, bigint>();
      const barangMutations: Array<{ master: CatalogMaster; qty: number }> = [];

      for (const line of inv.items) {
        const calc = calculateItemTotal(
          line.quantity,
          line.unitPriceMinor,
          line.discountMinor,
          line.taxRatePercent,
        );
        const master = line.catalogItemId ? (masterById.get(line.catalogItemId) ?? null) : null;
        if (line.catalogItemId && !master) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${line.catalogItemId}`);
        if (master?.itemType === "JASA") {
          const accId =
            master.revenueAccountId ??
            (await getAccountByCodeOrNull(tx, orgId, "4130"))?.id ??
            (await getAccountByCode(tx, orgId, "4100")).id;
          revenueGroups.set(accId, (revenueGroups.get(accId) ?? 0n) + calc.netSubtotalMinor);
        } else if (master) {
          const accId =
            master.revenueAccountId ??
            (await getAccountByCodeOrNull(tx, orgId, "4110"))?.id ??
            (await getAccountByCode(tx, orgId, "4100")).id;
          revenueGroups.set(accId, (revenueGroups.get(accId) ?? 0n) + calc.netSubtotalMinor);
          if (recording === "PERPETUAL") {
            const qty = typeof line.quantity === "string" ? parseFloat(line.quantity) || 0 : line.quantity;
            if (!Number.isFinite(qty) || qty <= 0) {
              throw new Error(`QTY_FAKTUR_TIDAK_VALID: ${line.description}`);
            }
            barangMutations.push({ master, qty });
          }
        } else {
          const revAccount = await getAccountByCode(tx, orgId, "4100"); // Pendapatan Usaha
          revenueGroups.set(revAccount.id, (revenueGroups.get(revAccount.id) ?? 0n) + calc.netSubtotalMinor);
        }
      }

      // Debit: Piutang Usaha (Total)
      lines.push({
        accountId: arAccount.id,
        debitMinor: inv.totalMinor,
        creditMinor: 0n,
        memo: `Piutang ${inv.invoiceNumber}`,
      });

      // Kredit: Pendapatan per akun (Net Subtotal per grup)
      for (const [accountId, netto] of revenueGroups) {
        if (netto === 0n) continue;
        lines.push({
          accountId,
          debitMinor: 0n,
          creditMinor: netto,
          memo: `Pendapatan ${inv.invoiceNumber}`,
        });
      }

      // Kredit: PPN Keluaran (jika ada)
      if (inv.taxMinor > 0n) {
        const taxAccount = await getAccountByCode(tx, orgId, "2200"); // PPN Keluaran
        lines.push({
          accountId: taxAccount.id,
          debitMinor: 0n,
          creditMinor: inv.taxMinor,
          memo: `PPN Keluaran ${inv.invoiceNumber}`,
        });
      }

      // Mutasi stok barang + HPP agregat (PERPETUAL saja).
      if (barangMutations.length > 0) {
        const invAccId =
          settings?.inventoryAccountId ??
          (await getAccountByCodeOrNull(tx, orgId, "1310"))?.id ??
          (await getAccountByCodeOrNull(tx, orgId, "1300"))?.id;
        if (!invAccId) {
          throw new Error(
            "AKUN_PERSEDIAAN_BELUM_DIPETAKAN: pilih Akun Persediaan di Pengaturan > Persediaan sebelum memposting faktur barang",
          );
        }
        const cogsAccId =
          settings?.cogsAccountId ?? (await getAccountByCode(tx, orgId, "5100")).id;
        let hppTotal = 0n;
        for (const m of barangMutations) {
          hppTotal += await applyInvoiceStockOut(
            tx,
            orgId,
            m.master,
            m.qty,
            valuation,
            inv.issueDate,
            inv.id,
            `Jual ${inv.invoiceNumber} (${m.master.code})`,
          );
        }
        if (hppTotal > 0n) {
          lines.push({
            accountId: cogsAccId,
            debitMinor: hppTotal,
            creditMinor: 0n,
            memo: `HPP ${inv.invoiceNumber}`,
          });
          lines.push({
            accountId: invAccId,
            debitMinor: 0n,
            creditMinor: hppTotal,
            memo: `Persediaan keluar ${inv.invoiceNumber}`,
          });
        }
      }
    } else {
      // Pembelian (Utang)
      const apAccount = await getAccountByCode(tx, orgId, "2100"); // Utang Usaha
      const expAccount = await getAccountByCode(tx, orgId, "5100"); // Beban Pokok Penjualan

      const netSubtotal = inv.subtotalMinor - inv.discountMinor;
      lines.push({
        accountId: expAccount.id,
        debitMinor: netSubtotal,
        creditMinor: 0n,
        memo: `Beban/Pembelian ${inv.invoiceNumber}`,
      });

      if (inv.taxMinor > 0n) {
        const taxAccount = await getAccountByCode(tx, orgId, "1400"); // PPN Masukan
        lines.push({
          accountId: taxAccount.id,
          debitMinor: inv.taxMinor,
          creditMinor: 0n,
          memo: `PPN Masukan ${inv.invoiceNumber}`,
        });
      }

      lines.push({
        accountId: apAccount.id,
        debitMinor: 0n,
        creditMinor: inv.totalMinor,
        memo: `Utang ${inv.invoiceNumber}`,
      });
    }

    const memo =
      inv.type === "INVOICE"
        ? `Faktur Penjualan ${inv.invoiceNumber} - ${inv.contact.name}`
        : `Tagihan Pembelian ${inv.invoiceNumber} - ${inv.contact.name}`;

    const entry = await postJournalEntry(
      tx,
      orgId,
      actorEmail,
      {
        dateISO: inv.issueDate,
        memo,
        source: "DOCUMENT",
        lines,
      }
    );

    await tx
      .update(invoices)
      .set({
        journalEntryId: entry.id,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, inv.id));

    return entry.id;
  });
}

export async function postInvoicePaymentToLedger(
  db: Db,
  orgId: string,
  paymentId: string,
  actorEmail: string
): Promise<string> {
  const [payment] = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.id, paymentId));

  if (!payment) {
    throw new Error(`Data pembayaran dengan ID ${paymentId} tidak ditemukan.`);
  }

  if (payment.journalEntryId) {
    return payment.journalEntryId;
  }

  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, payment.invoiceId), eq(invoices.orgId, orgId)));

  if (!inv) {
    throw new Error(`Faktur terkait tidak ditemukan.`);
  }

  return db.transaction(async (tx) => {
    const lines: Array<{ accountId: string; debitMinor: bigint; creditMinor: bigint; memo?: string }> = [];

    if (inv.type === "INVOICE") {
      // Pelunasan Piutang: Dr Kas/Bank, Cr Piutang Usaha
      const arAccount = await getAccountByCode(tx, orgId, "1200");

      lines.push({
        accountId: payment.paymentAccountId,
        debitMinor: payment.amountMinor,
        creditMinor: 0n,
        memo: `Penerimaan Pembayaran ${inv.invoiceNumber}`,
      });

      lines.push({
        accountId: arAccount.id,
        debitMinor: 0n,
        creditMinor: payment.amountMinor,
        memo: `Pelunasan Piutang ${inv.invoiceNumber}`,
      });
    } else {
      // Pembayaran Utang: Dr Utang Usaha, Cr Kas/Bank
      const apAccount = await getAccountByCode(tx, orgId, "2100");

      lines.push({
        accountId: apAccount.id,
        debitMinor: payment.amountMinor,
        creditMinor: 0n,
        memo: `Pelunasan Utang ${inv.invoiceNumber}`,
      });

      lines.push({
        accountId: payment.paymentAccountId,
        debitMinor: 0n,
        creditMinor: payment.amountMinor,
        memo: `Pengeluaran Kas/Bank ${inv.invoiceNumber}`,
      });
    }

    const memo =
      inv.type === "INVOICE"
        ? `Pelunasan Faktur ${inv.invoiceNumber}${payment.referenceNumber ? ` (${payment.referenceNumber})` : ""}`
        : `Pembayaran Tagihan ${inv.invoiceNumber}${payment.referenceNumber ? ` (${payment.referenceNumber})` : ""}`;

    const entry = await postJournalEntry(
      tx,
      orgId,
      actorEmail,
      {
        dateISO: payment.paymentDate,
        memo,
        source: "DOCUMENT",
        lines,
      }
    );

    await tx
      .update(invoicePayments)
      .set({
        journalEntryId: entry.id,
      })
      .where(eq(invoicePayments.id, payment.id));

    return entry.id;
  });
}
