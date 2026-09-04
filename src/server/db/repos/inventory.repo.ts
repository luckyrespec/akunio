import { and, desc, eq, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import {
  inventorySettings,
  inventoryItems,
  inventoryLayers,
  inventoryTransactions,
  stockOpnames,
  stockOpnameItems,
} from "../schema/inventory";
import { accounts } from "../schema/org";
import { createDraftJournalEntry } from "./journals.repo";
import { calculateStockDifference } from "@/core/inventory/valuation";

export interface CreateItemInput {
  code: string;
  name: string;
  barcode?: string;
  unit?: string;
  category?: string;
  minStockAlert?: string;
  standardSellingPriceMinor?: bigint;
  initialQty?: number;
  initialCostMinor?: bigint;
}

export async function getInventorySettings(q: Queryable, orgId: string) {
  const [row] = await q
    .select()
    .from(inventorySettings)
    .where(eq(inventorySettings.orgId, orgId))
    .limit(1);
  return row ?? null;
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
      inventoryAccountId: data.inventoryAccountId,
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

export async function getInventoryItem(q: Queryable, orgId: string, itemId: string) {
  const [item] = await q
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
    .limit(1);
  return item ?? null;
}

export async function createInventoryItem(
  q: Queryable,
  orgId: string,
  input: CreateItemInput,
) {
  const initialQty = input.initialQty ?? 0;
  const initialCostMinor = input.initialCostMinor ?? 0n;
  const totalCostMinor = (initialCostMinor * BigInt(Math.round(initialQty * 10000))) / 10000n;

  const [item] = await q
    .insert(inventoryItems)
    .values({
      orgId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      unit: input.unit?.trim() || "Pcs",
      category: input.category?.trim() || null,
      minStockAlert: input.minStockAlert || "0",
      currentQty: String(initialQty),
      averageCostMinor: initialCostMinor,
      totalCostMinor,
      standardSellingPriceMinor: input.standardSellingPriceMinor ?? 0n,
    })
    .returning();

  if (initialQty > 0) {
    // Catat layer FIFO
    await q.insert(inventoryLayers).values({
      orgId,
      itemId: item.id,
      date: new Date().toISOString().slice(0, 10),
      initialQty: String(initialQty),
      remainingQty: String(initialQty),
      unitCostMinor: initialCostMinor,
      referenceType: "OPENING_BALANCE",
    });

    // Catat mutasi kartu stok
    await q.insert(inventoryTransactions).values({
      orgId,
      itemId: item.id,
      date: new Date().toISOString().slice(0, 10),
      type: "IN",
      qty: String(initialQty),
      unitCostMinor: initialCostMinor,
      totalCostMinor,
      resultingQty: String(initialQty),
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
  const year = data.opnameDate.slice(0, 4);
  const [countRow] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(stockOpnames)
    .where(eq(stockOpnames.orgId, orgId));
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
    const item = await getInventoryItem(q, orgId, it.itemId);
    if (!item) continue;

    const sysQty = Number(item.currentQty);
    const unitCostMinor = item.averageCostMinor;
    const diff = calculateStockDifference(sysQty, it.physicalQty, unitCostMinor);
    totalDiffValueMinor += diff.differenceValueMinor;

    await q.insert(stockOpnameItems).values({
      opnameId: opname.id,
      itemId: item.id,
      systemQty: String(sysQty),
      physicalQty: String(it.physicalQty),
      differenceQty: String(diff.differenceQty),
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
    })
    .from(stockOpnameItems)
    .innerJoin(inventoryItems, eq(inventoryItems.id, stockOpnameItems.itemId))
    .where(eq(stockOpnameItems.opnameId, opname.id));

  return { ...opname, items };
}

/**
 * Membuat Draf Jurnal Penyesuaian (Opsi A) dari hasil selisih Stok Opname
 */
export async function generateAdjustmentJournalDraft(
  q: Queryable,
  orgId: string,
  opnameId: string,
) {
  const opnameData = await getStockOpnameWithItems(q, orgId, opnameId);
  if (!opnameData) throw new Error("OPNAME_TIDAK_DITEMUKAN");
  if (opnameData.journalEntryId) throw new Error("DRAF_JURNAL_SUDAH_DIBUAT");

  const settings = await getInventorySettings(q, orgId);
  // Default fallback akun jika belum disetting khusus:
  // Cari akun Persediaan (1-1300) dan Beban Penyesuaian/HPP (5-1900 / 5-1000)
  const allAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const inventoryAccount = settings?.inventoryAccountId
    ? allAccounts.find((a) => a.id === settings.inventoryAccountId)
    : allAccounts.find((a) => a.code.startsWith("1-13") || a.name.toLowerCase().includes("persediaan"));

  const lossAccount = settings?.adjustmentLossAccountId
    ? allAccounts.find((a) => a.id === settings.adjustmentLossAccountId)
    : allAccounts.find((a) => a.name.toLowerCase().includes("selisih") || a.code.startsWith("5-"));

  const gainAccount = settings?.adjustmentGainAccountId
    ? allAccounts.find((a) => a.id === settings.adjustmentGainAccountId)
    : allAccounts.find((a) => a.code.startsWith("7-") || a.name.toLowerCase().includes("pendapatan lain"));

  if (!inventoryAccount || !lossAccount) {
    throw new Error("AKUN_PERSEDIAAN_ATAU_BEBAN_BELUM_TERSEDIA");
  }

  const diffValue = opnameData.totalDifferenceValueMinor;
  if (diffValue === 0n) {
    // Tidak ada selisih nilai, langsung tandai selesai
    await q.update(stockOpnames)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(stockOpnames.id, opnameId));
    return { opname: opnameData, journalEntryId: null };
  }

  const isDeficit = diffValue < 0n;
  const absValue = isDeficit ? -diffValue : diffValue;

  const lines = isDeficit
    ? [
        {
          accountId: lossAccount.id,
          debitMinor: absValue,
          creditMinor: 0n,
          memo: `Beban Selisih Stok Opname ${opnameData.number}`,
        },
        {
          accountId: inventoryAccount.id,
          debitMinor: 0n,
          creditMinor: absValue,
          memo: `Pengurangan Persediaan Opname ${opnameData.number}`,
        },
      ]
    : [
        {
          accountId: inventoryAccount.id,
          debitMinor: absValue,
          creditMinor: 0n,
          memo: `Penambahan Persediaan Opname ${opnameData.number}`,
        },
        {
          accountId: (gainAccount ?? lossAccount).id,
          debitMinor: 0n,
          creditMinor: absValue,
          memo: `Pendapatan/Koreksi Selisih Stok Opname ${opnameData.number}`,
        },
      ];

  const draft = await createDraftJournalEntry(q, orgId, {
    dateISO: opnameData.opnameDate,
    memo: `Penyesuaian Stok Opname Fisik ${opnameData.number}`,
    source: "STOCK_OPNAME" as any,
    lines,
  });

  await q.update(stockOpnames)
    .set({
      status: "REVIEW_DRAFT_JOURNAL",
      journalEntryId: draft.id,
      updatedAt: new Date(),
    })
    .where(eq(stockOpnames.id, opnameId));

  // Lock pengaturan metode jika draft dibuat dan akan diposting
  if (settings && !settings.isLocked) {
    await q.update(inventorySettings)
      .set({ isLocked: true })
      .where(eq(inventorySettings.id, settings.id));
  }

  return { opname: opnameData, journalEntryId: draft.id, journalNumber: draft.number };
}
