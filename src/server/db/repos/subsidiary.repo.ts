import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { contacts, invoices, invoicePayments } from "../schema/invoicing";
import { inventoryItems, inventoryTransactions, stockOpnames } from "../schema/inventory";
import { prepaidContracts, prepaidScheduleLines } from "../schema/prepaid";
import { fixedAssets, assetDepreciationLines } from "../schema/assets";
import { buildContactCard, type ContactLedgerInput } from "@/core/subledger/cards";
import { getSubledgerControls } from "./subledger.repo";
import type { SubledgerKind } from "../schema/subledger";

/** Kind kontrol untuk sebuah akun, atau null bila bukan akun kontrol. */
export async function getControlForAccount(
  q: Queryable, orgId: string, accountId: string,
): Promise<SubledgerKind | null> {
  const controls = await getSubledgerControls(q, orgId);
  return (controls.find((c) => c.controlAccountId === accountId)?.kind as SubledgerKind) ?? null;
}

export async function listItemCards(q: Queryable, orgId: string) {
  return q.select({
    id: inventoryItems.id,
    code: inventoryItems.code,
    name: inventoryItems.name,
    unit: inventoryItems.unit,
    category: inventoryItems.category,
    minStockAlert: inventoryItems.minStockAlert,
    currentQty: inventoryItems.currentQty,
    averageCostMinor: inventoryItems.averageCostMinor,
    totalCostMinor: inventoryItems.totalCostMinor,
  })
    .from(inventoryItems)
    .where(and(
      eq(inventoryItems.orgId, orgId),
      eq(inventoryItems.isActive, true),
      eq(inventoryItems.itemType, "BARANG"),
    ))
    .orderBy(asc(inventoryItems.code));
}

export interface ItemCardRow {
  date: string;
  desc: string;
  ref: string;
  inQty: string;
  outQty: string;
  unitCostMinor: bigint;
  totalCostMinor: bigint;
  resultingQty: string;
  resultingTotalCostMinor: bigint;
}

export async function getItemCard(q: Queryable, orgId: string, itemId: string) {
  const [item] = await q.select().from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
    .limit(1);
  if (!item) return null;

  const txs = await q.select().from(inventoryTransactions)
    .where(and(eq(inventoryTransactions.orgId, orgId), eq(inventoryTransactions.itemId, itemId)))
    .orderBy(asc(inventoryTransactions.date), asc(inventoryTransactions.createdAt));

  const invoiceIds = [...new Set(txs.filter((t) => t.sourceType === "INVOICE" && t.sourceId).map((t) => t.sourceId!))];
  const opnameIds = [...new Set(txs.filter((t) => t.sourceType === "OPNAME" && t.sourceId).map((t) => t.sourceId!))];
  const invRows = invoiceIds.length > 0
    ? await q.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber }).from(invoices)
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.id, invoiceIds)))
    : [];
  const opnRows = opnameIds.length > 0
    ? await q.select({ id: stockOpnames.id, number: stockOpnames.number }).from(stockOpnames)
      .where(and(eq(stockOpnames.orgId, orgId), inArray(stockOpnames.id, opnameIds)))
    : [];
  const invNo = new Map(invRows.map((r) => [r.id, r.invoiceNumber]));
  const opnNo = new Map(opnRows.map((r) => [r.id, r.number]));

  const rows: ItemCardRow[] = txs.map((t) => {
    const qty = Number(t.qty);
    return {
      date: t.date,
      desc: t.memo ?? (t.type === "IN" ? "Stok masuk" : t.type === "OUT" ? "Stok keluar" : "Penyesuaian"),
      ref: t.sourceType === "INVOICE" && t.sourceId
        ? (invNo.get(t.sourceId) ?? "Faktur")
        : t.sourceType === "OPNAME" && t.sourceId
          ? (opnNo.get(t.sourceId) ?? "Opname")
          : t.sourceType === "JOURNAL" ? "Jurnal" : "—",
      inQty: qty >= 0 && t.type !== "OUT" ? t.qty : "0",
      outQty: t.type === "OUT" || qty < 0 ? String(Math.abs(qty)) : "0",
      unitCostMinor: t.unitCostMinor,
      totalCostMinor: t.totalCostMinor < 0n ? -t.totalCostMinor : t.totalCostMinor,
      resultingQty: t.resultingQty,
      resultingTotalCostMinor: t.resultingTotalCostMinor,
    };
  });
  return { item, rows };
}

export interface ContactCardSummary {
  id: string;
  name: string;
  invoiceCount: number;
  totalMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
}

export async function listContactCards(
  q: Queryable, orgId: string, type: "INVOICE" | "BILL",
): Promise<ContactCardSummary[]> {
  const rows = await q.select({
    contact: contacts,
    invoice: invoices,
  })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .where(and(eq(invoices.orgId, orgId), eq(invoices.type, type), ne(invoices.status, "VOID")));
  const byId = new Map<string, ContactCardSummary>();
  for (const r of rows) {
    const cur = byId.get(r.contact.id) ?? {
      id: r.contact.id, name: r.contact.name,
      invoiceCount: 0, totalMinor: 0n, paidMinor: 0n, outstandingMinor: 0n,
    };
    cur.invoiceCount += 1;
    cur.totalMinor += r.invoice.totalMinor;
    cur.paidMinor += r.invoice.amountPaidMinor;
    cur.outstandingMinor += r.invoice.totalMinor - r.invoice.amountPaidMinor;
    byId.set(r.contact.id, cur);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getContactCard(
  q: Queryable, orgId: string, contactId: string, type: "INVOICE" | "BILL",
) {
  const [contact] = await q.select().from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  if (!contact) return null;
  const invs = await q.select().from(invoices)
    .where(and(
      eq(invoices.orgId, orgId), eq(invoices.contactId, contactId),
      eq(invoices.type, type), ne(invoices.status, "VOID"),
    ))
    .orderBy(asc(invoices.issueDate));
  const invNo = new Map(invs.map((i) => [i.id, i.invoiceNumber]));
  const pays = invs.length > 0
    ? await q.select().from(invoicePayments)
      .where(inArray(invoicePayments.invoiceId, invs.map((i) => i.id)))
      .orderBy(asc(invoicePayments.paymentDate))
    : [];
  const bills: ContactLedgerInput[] = invs.map((i) => ({
    side: "BILL",
    date: i.issueDate,
    desc: type === "INVOICE" ? `Faktur ${i.invoiceNumber}` : `Tagihan ${i.invoiceNumber}`,
    ref: i.invoiceNumber,
    amountMinor: i.totalMinor,
  }));
  const payments: ContactLedgerInput[] = pays.map((p) => ({
    side: "PAYMENT",
    date: p.paymentDate,
    desc: type === "INVOICE"
      ? `Bayar ${invNo.get(p.invoiceId) ?? ""}`.trim()
      : `Lunas ${invNo.get(p.invoiceId) ?? ""}`.trim(),
    ref: invNo.get(p.invoiceId) ?? "",
    amountMinor: p.amountMinor,
  }));
  return { contact, entries: buildContactCard(type === "INVOICE" ? "PIUTANG" : "UTANG", bills, payments) };
}

export async function listPrepaidCards(q: Queryable, orgId: string) {
  return q.select().from(prepaidContracts)
    .where(eq(prepaidContracts.orgId, orgId))
    .orderBy(asc(prepaidContracts.code));
}

export async function getPrepaidCard(q: Queryable, orgId: string, contractId: string) {
  const [contract] = await q.select().from(prepaidContracts)
    .where(and(eq(prepaidContracts.orgId, orgId), eq(prepaidContracts.id, contractId)))
    .limit(1);
  if (!contract) return null;
  const lines = await q.select().from(prepaidScheduleLines)
    .where(and(eq(prepaidScheduleLines.orgId, orgId), eq(prepaidScheduleLines.contractId, contractId)))
    .orderBy(asc(prepaidScheduleLines.periodName));
  return { contract, lines };
}

export interface AssetCardSummary {
  id: string;
  code: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCostMinor: bigint;
  accumulatedMinor: bigint;
  bookValueMinor: bigint;
  status: string;
  depreciationMethod: string;
}

/** Kartu aset per unit dengan nilai buku dari susut yang SUDAH diposting. */
export async function listAssetCards(q: Queryable, orgId: string): Promise<AssetCardSummary[]> {
  const assets = await q.select().from(fixedAssets)
    .where(eq(fixedAssets.orgId, orgId))
    .orderBy(desc(fixedAssets.createdAt));
  if (assets.length === 0) return [];
  const posted = await q.select({
    assetId: assetDepreciationLines.assetId,
    total: assetDepreciationLines.depreciationAmountMinor,
  }).from(assetDepreciationLines)
    .where(and(
      eq(assetDepreciationLines.orgId, orgId),
      eq(assetDepreciationLines.status, "POSTED"),
      inArray(assetDepreciationLines.assetId, assets.map((a) => a.id)),
    ));
  const accumByAsset = new Map<string, bigint>();
  for (const p of posted) {
    accumByAsset.set(p.assetId, (accumByAsset.get(p.assetId) ?? 0n) + p.total);
  }
  return assets.map((a) => {
    const accumulatedMinor = accumByAsset.get(a.id) ?? 0n;
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      category: a.category,
      acquisitionDate: a.acquisitionDate,
      acquisitionCostMinor: a.acquisitionCostMinor,
      accumulatedMinor,
      bookValueMinor: a.acquisitionCostMinor - accumulatedMinor,
      status: a.status,
      depreciationMethod: a.depreciationMethod,
    };
  });
}
