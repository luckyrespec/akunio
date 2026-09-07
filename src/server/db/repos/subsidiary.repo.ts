import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { contacts, invoices, invoicePayments } from "../schema/invoicing";
import { inventoryItems, inventoryTransactions, stockOpnames } from "../schema/inventory";
import { buildContactCard, type ContactLedgerInput } from "@/core/subledger/cards";
import { getSubledgerControls, type SubledgerKind } from "./subledger.repo";

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
