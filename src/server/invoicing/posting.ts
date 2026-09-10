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
import { getInventorySettings, lockInventoryPolicy } from "@/server/db/repos/inventory.repo";
import { postJournalEntry, toMinor } from "@/server/db/repos/journals.repo";
import { resolveRevenueAccountId, resolveCogsAccountId, resolveExpenseAccountId } from "@/server/db/repos/accounts.repo";
import { journalLines } from "@/server/db/schema/journal";
import { calculateItemTotal } from "@/core/invoicing/calculations";
import type { JournalLineInput } from "@/core/journals/types";
import { calculateWeightedAverage, consumeFifoLayers } from "@/core/inventory/valuation";
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

/** Mutasi OUT satu item barang untuk faktur penjualan maupun kasir POS. Mengembalikan HPP (biaya) terpakai.
 *  Stok boleh minus (warning di UI, bukan blokir): shortfall FIFO dihargai rata-rata.
 *  Catatan: pemanggil POS memvalidasi kecukupan stok sendiri sebelum memanggil (kasir menolak stok kurang). */
export async function applyCatalogStockOut(
  tx: Queryable,
  orgId: string,
  master: CatalogMaster,
  qty: number,
  valuation: "WEIGHTED_AVERAGE" | "FIFO",
  dateISO: string,
  source: { type: "INVOICE" | "POS"; id: string },
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
    sourceType: source.type,
    sourceId: source.id,
    memo,
  });
  return consumedCostMinor;
}

/** Mutasi IN satu item barang untuk faktur pembelian. Layer FIFO selalu ditulis
 *  (agar pindah metode valuasi tetap valid), average dihitung via WAC. */
async function applyInvoiceStockIn(
  tx: Queryable,
  orgId: string,
  master: CatalogMaster,
  qty: number,
  unitCostMinor: bigint,
  dateISO: string,
  sourceId: string,
  memo: string,
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inv-item:${master.id}`}))`);
  const [fresh] = await tx
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, master.id), eq(inventoryItems.orgId, orgId)))
    .limit(1);
  if (!fresh) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${master.code}`);
  if (fresh.itemType !== "BARANG") return;

  const r = calculateWeightedAverage(Number(fresh.currentQty), fresh.totalCostMinor, qty, unitCostMinor);
  await tx
    .update(inventoryItems)
    .set({
      currentQty: qtyToDb(r.newQty),
      totalCostMinor: r.newTotalCostMinor,
      averageCostMinor: r.newAverageCostMinor,
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, fresh.id));

  await tx.insert(inventoryLayers).values({
    orgId,
    itemId: fresh.id,
    date: dateISO,
    initialQty: qtyToDb(qty),
    remainingQty: qtyToDb(qty),
    unitCostMinor,
    referenceType: "PURCHASE",
    referenceId: sourceId,
  });

  await tx.insert(inventoryTransactions).values({
    orgId,
    itemId: fresh.id,
    date: dateISO,
    type: "IN",
    qty: qtyToDb(qty),
    unitCostMinor,
    totalCostMinor: costForQty(unitCostMinor, qty),
    resultingQty: qtyToDb(r.newQty),
    resultingTotalCostMinor: r.newTotalCostMinor,
    sourceType: "INVOICE",
    sourceId,
    memo,
  });
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

/** Akun kontrol persediaan dari registry subledger; fallback kode untuk org lama. */
export async function resolveInventoryControlAccountId(tx: Queryable, orgId: string): Promise<string> {
  const { getSubledgerControls } = await import("@/server/db/repos/subledger.repo");
  const controls = await getSubledgerControls(tx, orgId);
  const id = controls.find((c) => c.kind === "PERSEDIAAN")?.controlAccountId ?? null;
  if (id) return id;
  const fallback =
    (await getAccountByCodeOrNull(tx, orgId, "1310"))?.id ??
    (await getAccountByCodeOrNull(tx, orgId, "1300"))?.id;
  if (!fallback) {
    throw new Error(
      "AKUN_PERSEDIAAN_BELUM_DIPETAKAN: registry subledger PERSEDIAAN belum di-seed (dijalankan otomatis saat onboarding)",
    );
  }
  return fallback;
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
    const lines: JournalLineInput[] = [];

    // Katalog ter-link (barang vs jasa) + kebijakan persediaan — dipakai cabang jual maupun beli.
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
    const orgAccounts = await tx.select().from(accounts).where(eq(accounts.orgId, orgId));
    const masterOf = (catalogItemId: string | null) => {
      if (!catalogItemId) return null;
      const m = masterById.get(catalogItemId) ?? null;
      if (!m) throw new Error(`ITEM_TIDAK_DITEMUKAN: ${catalogItemId}`);
      return m;
    };

    const settings = await getInventorySettings(tx, orgId);
    const recording = settings?.recordingMethod ?? "PERPETUAL";
    const valuation = settings?.valuationMethod ?? "WEIGHTED_AVERAGE";

    const parseQty = (raw: string | number, label: string): number => {
      const qty = typeof raw === "string" ? parseFloat(raw) || 0 : raw;
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`QTY_FAKTUR_TIDAK_VALID: ${label}`);
      return qty;
    };

    if (inv.type === "INVOICE") {
      // Penjualan (Piutang) — pendapatan dipecah per akun (barang vs jasa vs manual),
      // barang (PERPETUAL) mutasi OUT + HPP, jasa tanpa mutasi.
      const arAccount = await getAccountByCode(tx, orgId, "1200"); // Piutang Usaha

      const revenueGroups = new Map<string, bigint>();
      const barangMutations: Array<{ master: CatalogMaster; qty: number }> = [];

      for (const line of inv.items) {
        const calc = calculateItemTotal(
          line.quantity,
          line.unitPriceMinor,
          line.discountMinor,
          line.taxRatePercent,
        );
        const master = masterOf(line.catalogItemId);
        if (master?.itemType === "JASA") {
          const accId = resolveRevenueAccountId(orgAccounts, master.revenueAccountId);
          revenueGroups.set(accId, (revenueGroups.get(accId) ?? 0n) + calc.netSubtotalMinor);
        } else if (master) {
          const accId = resolveRevenueAccountId(orgAccounts, master.revenueAccountId);
          revenueGroups.set(accId, (revenueGroups.get(accId) ?? 0n) + calc.netSubtotalMinor);
          if (recording === "PERPETUAL") {
            barangMutations.push({ master, qty: parseQty(line.quantity, line.description) });
          }
        } else {
          const revAccountId = resolveRevenueAccountId(orgAccounts, null);
          revenueGroups.set(revAccountId, (revenueGroups.get(revAccountId) ?? 0n) + calc.netSubtotalMinor);
        }
      }

      // Debit: Piutang Usaha (Total)
      lines.push({
        accountId: arAccount.id,
        debitMinor: inv.totalMinor,
        creditMinor: 0n,
        memo: `Piutang ${inv.invoiceNumber}`,
        subledgerLinks: [{ kind: "PIUTANG", refId: inv.contactId, amountMinor: inv.totalMinor }],
      });

      // Kompatibilitas: faktur tanpa baris (insert header langsung) pakai satu
      // akun pendapatan seperti perilaku lama.
      if (revenueGroups.size === 0) {
        const revAccountId = resolveRevenueAccountId(orgAccounts, null);
        revenueGroups.set(revAccountId, inv.subtotalMinor - inv.discountMinor);
      }

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
        const invAccId = await resolveInventoryControlAccountId(tx, orgId);
        const cogsAccId = resolveCogsAccountId(orgAccounts, settings?.cogsAccountId ?? null);
        let hppTotal = 0n;
        const hppLinks: Array<{ kind: "PERSEDIAAN"; refId: string; amountMinor: bigint; qty: number }> = [];
        for (const m of barangMutations) {
          const cost = await applyCatalogStockOut(
            tx,
            orgId,
            m.master,
            m.qty,
            valuation,
            inv.issueDate,
            { type: "INVOICE", id: inv.id },
            `Jual ${inv.invoiceNumber} (${m.master.code})`,
          );
          hppTotal += cost;
          hppLinks.push({ kind: "PERSEDIAAN", refId: m.master.id, amountMinor: cost, qty: m.qty });
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
            subledgerLinks: hppLinks,
          });
        }
      }
    } else {
      // Pembelian (Utang) — barang PERPETUAL: IN + Dr Persediaan; jasa: Dr Beban;
      // barang PERIODIC: Dr Pembelian tanpa mutasi.
      const apAccount = await getAccountByCode(tx, orgId, "2100"); // Utang Usaha

      const debitGroups = new Map<string, bigint>();
      const addDebit = (accountId: string, netto: bigint) => {
        debitGroups.set(accountId, (debitGroups.get(accountId) ?? 0n) + netto);
      };
      const barangIns: Array<{ master: CatalogMaster; qty: number; unitCostMinor: bigint }> = [];
      const invLinks: Array<{ kind: "PERSEDIAAN"; refId: string; amountMinor: bigint; qty: number }> = [];
      const invAccIds = new Set<string>();
      let purchaseAccountId: string | null = null;

      const resolveInventoryAccountId = async (): Promise<string> =>
        resolveInventoryControlAccountId(tx, orgId);

      for (const line of inv.items) {
        const calc = calculateItemTotal(
          line.quantity,
          line.unitPriceMinor,
          line.discountMinor,
          line.taxRatePercent,
        );
        const master = masterOf(line.catalogItemId);
        if (master?.itemType === "JASA") {
          const accId = resolveExpenseAccountId(orgAccounts, master.expenseAccountId);
          addDebit(accId, calc.netSubtotalMinor);
        } else if (master) {
          if (recording === "PERPETUAL") {
            const qty = parseQty(line.quantity, line.description);
            const unitCostMinor =
              qty > 0 ? (calc.netSubtotalMinor * 100n) / BigInt(Math.round(qty * 100)) : 0n;
            const invId = await resolveInventoryAccountId();
            addDebit(invId, calc.netSubtotalMinor);
            invAccIds.add(invId);
            invLinks.push({ kind: "PERSEDIAAN", refId: master.id, amountMinor: calc.netSubtotalMinor, qty });
            barangIns.push({ master, qty, unitCostMinor });
          } else {
            purchaseAccountId ??=
              resolveCogsAccountId(orgAccounts, settings?.cogsAccountId ?? null);
            addDebit(purchaseAccountId, calc.netSubtotalMinor);
          }
        } else {
          const expAccountId = resolveExpenseAccountId(orgAccounts, null); // Beban/Pembelian
          addDebit(expAccountId, calc.netSubtotalMinor);
        }
      }

      for (const [accountId, netto] of debitGroups) {
        if (netto === 0n) continue;
        lines.push({
          accountId,
          debitMinor: netto,
          creditMinor: 0n,
          memo: `Beban/Pembelian ${inv.invoiceNumber}`,
          ...(invAccIds.has(accountId) ? { subledgerLinks: invLinks } : {}),
        });
      }

      // Kompatibilitas: tagihan tanpa baris pakai satu akun beban seperti perilaku lama.
      if (![...debitGroups.values()].some((v) => v !== 0n)) {
        const expAccountId = resolveExpenseAccountId(orgAccounts, null); // Beban/Pembelian
        lines.push({
          accountId: expAccountId,
          debitMinor: inv.subtotalMinor - inv.discountMinor,
          creditMinor: 0n,
          memo: `Beban/Pembelian ${inv.invoiceNumber}`,
        });
      }

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
        subledgerLinks: [{ kind: "UTANG", refId: inv.contactId, amountMinor: inv.totalMinor }],
      });

      for (const m of barangIns) {
        await applyInvoiceStockIn(
          tx,
          orgId,
          m.master,
          m.qty,
          m.unitCostMinor,
          inv.issueDate,
          inv.id,
          `Beli ${inv.invoiceNumber} (${m.master.code})`,
        );
      }
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

    // Kebijakan metode terkunci sejak faktur operasional pertama yang
    // menyentuh barang (jasa saja tidak mengunci). Dibuka lagi saat tutup tahun.
    const hasBarang = inv.items.some((line) => masterOf(line.catalogItemId)?.itemType === "BARANG");
    if (hasBarang) {
      await lockInventoryPolicy(tx, orgId);
    }

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

/** Void faktur: jurnal pembalik tertaut reversal_of_id + kembalikan stok yang
 *  pernah digerakkan faktur ini. Menolak bila sudah VOID atau sudah ada bayar.
 *  Mengembalikan id jurnal pembalik, atau null bila faktur belum terposting. */
export async function voidInvoiceWithReversal(
  db: Db,
  orgId: string,
  invoiceId: string,
  actorEmail: string,
): Promise<string | null> {
  const inv = await getInvoiceByIdRepo(db, orgId, invoiceId);
  if (!inv) throw new Error(`Faktur dengan ID ${invoiceId} tidak ditemukan.`);
  if (inv.status === "VOID") throw new Error("FAKTUR_SUDAH_VOID: faktur ini sudah dibatalkan");
  if (inv.amountPaidMinor > 0n) {
    throw new Error("FAKTUR_SUDAH_DIBAYAR: batalkan pembayaran terlebih dahulu sebelum void");
  }

  if (!inv.journalEntryId) {
    await db
      .update(invoices)
      .set({ status: "VOID", updatedAt: new Date() })
      .where(eq(invoices.id, inv.id));
    return null;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inv-void:${invoiceId}`}))`);
    const [fresh] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, inv.id), eq(invoices.orgId, orgId)))
      .limit(1);
    if (!fresh || fresh.status === "VOID") throw new Error("FAKTUR_SUDAH_VOID: faktur ini sudah dibatalkan");
    if (!fresh.journalEntryId) throw new Error("JURNAL_TIDAK_DITEMUKAN: faktur belum terposting");

    const origLines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.entryId, fresh.journalEntryId));
    if (origLines.length === 0) throw new Error("JURNAL_TIDAK_DITEMUKAN: baris jurnal asal kosong");

    const { listLinksForEntry } = await import("@/server/db/repos/subledger.repo");
    const origLinkRows = await listLinksForEntry(tx, orgId, fresh.journalEntryId);
    const origLinksByLine = new Map<string, Array<{ kind: "PIUTANG" | "UTANG" | "PERSEDIAAN"; refId: string; amountMinor: bigint }>>();
    for (const r of origLinkRows) {
      if (!r.linkId) continue;
      const arr = origLinksByLine.get(r.lineId) ?? [];
      arr.push({ kind: r.kind as "PIUTANG" | "UTANG" | "PERSEDIAAN", refId: r.refId!, amountMinor: r.amountMinor! });
      origLinksByLine.set(r.lineId, arr);
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const reversal = await postJournalEntry(
      tx,
      orgId,
      actorEmail,
      {
        dateISO: todayISO,
        memo: `Pembalik ${inv.invoiceNumber} - ${inv.contact.name}`,
        source: "DOCUMENT",
        lines: origLines.map((l) => ({
          accountId: l.accountId,
          debitMinor: toMinor(l.credit),
          creditMinor: toMinor(l.debit),
          memo: `Pembalik ${inv.invoiceNumber}`,
          ...(origLinksByLine.get(l.id)?.length
            ? { subledgerLinks: origLinksByLine.get(l.id)!.map((x) => ({ ...x })) }
            : {}),
        })),
      },
      { reversalOfId: fresh.journalEntryId },
    );

    // Kembalikan setiap gerakan stok faktur ini (OUT->IN, IN->OUT).
    const settings = await getInventorySettings(tx, orgId);
    const valuation = settings?.valuationMethod ?? "WEIGHTED_AVERAGE";
    const moves = await tx
      .select()
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.orgId, orgId),
          eq(inventoryTransactions.sourceType, "INVOICE"),
          eq(inventoryTransactions.sourceId, inv.id),
        ),
      );
    if (moves.length > 0) {
      const ids = [...new Set(moves.map((m) => m.itemId))];
      const masters = await tx
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.orgId, orgId), inArray(inventoryItems.id, ids)));
    const masterById = new Map(masters.map((m) => [m.id, m]));
      for (const m of moves) {
        const master = masterById.get(m.itemId);
        if (!master) continue;
        const qty = Number(m.qty);
        if (m.type === "OUT") {
          await applyInvoiceStockIn(
            tx, orgId, master, qty, m.unitCostMinor, todayISO, reversal.id,
            `Reversal ${inv.invoiceNumber} (${master.code})`,
          );
        } else {
          await applyCatalogStockOut(
            tx, orgId, master, qty, valuation, todayISO, { type: "INVOICE", id: reversal.id },
            `Reversal ${inv.invoiceNumber} (${master.code})`,
          );
        }
      }
    }

    await tx
      .update(invoices)
      .set({ status: "VOID", updatedAt: new Date() })
      .where(eq(invoices.id, inv.id));

    return reversal.id;
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
    const lines: JournalLineInput[] = [];

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
        subledgerLinks: [{ kind: "PIUTANG", refId: inv.contactId, amountMinor: payment.amountMinor }],
      });
    } else {
      // Pembayaran Utang: Dr Utang Usaha, Cr Kas/Bank
      const apAccount = await getAccountByCode(tx, orgId, "2100");

      lines.push({
        accountId: apAccount.id,
        debitMinor: payment.amountMinor,
        creditMinor: 0n,
        memo: `Pelunasan Utang ${inv.invoiceNumber}`,
        subledgerLinks: [{ kind: "UTANG", refId: inv.contactId, amountMinor: payment.amountMinor }],
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
