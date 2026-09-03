import { Db } from "../index";
import {
  invoices,
  invoiceItems,
  invoicePayments,
  contacts,
  type InvoiceType,
  type InvoiceStatus,
} from "../schema/invoicing";
import { calculateInvoiceTotals, determineInvoiceStatus } from "@/core/invoicing/calculations";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface CreateInvoiceItemInput {
  description: string;
  quantity: number | string;
  unitPriceMinor: bigint;
  discountMinor?: bigint;
  taxRatePercent?: number | string;
}

export interface CreateInvoiceInput {
  type: InvoiceType;
  invoiceNumber?: string;
  contactId: string;
  issueDate: string;
  dueDate: string;
  currency?: string;
  notes?: string | null;
  status?: InvoiceStatus;
}

export interface RecordPaymentInput {
  invoiceId: string;
  paymentDate: string;
  amountMinor: bigint;
  paymentAccountId: string;
  referenceNumber?: string | null;
  notes?: string | null;
}

export async function getNextInvoiceNumberRepo(
  db: Db,
  orgId: string,
  type: InvoiceType,
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = type === "INVOICE" ? `INV-${year}-` : `BILL-${year}-`;
  const existing = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.type, type),
        sql`${invoices.invoiceNumber} LIKE ${prefix + "%"}`
      )
    );

  let maxSeq = 0;
  for (const row of existing) {
    const parts = row.invoiceNumber.split("-");
    const num = parseInt(parts[2], 10);
    if (!isNaN(num) && num > maxSeq) {
      maxSeq = num;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return `${prefix}${nextSeq}`;
}

export async function createInvoiceRepo(
  db: Db,
  orgId: string,
  invoiceData: CreateInvoiceInput,
  itemsData: CreateInvoiceItemInput[]
) {
  const calculated = calculateInvoiceTotals(
    itemsData.map((it) => ({
      quantity: it.quantity,
      unitPriceMinor: it.unitPriceMinor,
      discountMinor: it.discountMinor ?? 0n,
      taxRatePercent: it.taxRatePercent ?? 0,
    }))
  );

  const invoiceNumber =
    invoiceData.invoiceNumber ||
    (await getNextInvoiceNumberRepo(db, orgId, invoiceData.type));

  const status =
    invoiceData.status ??
    determineInvoiceStatus(calculated.totalMinor, 0n, invoiceData.dueDate);

  return db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoices)
      .values({
        orgId,
        type: invoiceData.type,
        invoiceNumber,
        contactId: invoiceData.contactId,
        issueDate: invoiceData.issueDate,
        dueDate: invoiceData.dueDate,
        currency: invoiceData.currency ?? "IDR",
        subtotalMinor: calculated.subtotalMinor,
        discountMinor: calculated.discountMinor,
        taxMinor: calculated.taxMinor,
        totalMinor: calculated.totalMinor,
        amountPaidMinor: 0n,
        status,
        notes: invoiceData.notes ?? null,
      })
      .returning();

    if (calculated.items.length > 0) {
      await tx.insert(invoiceItems).values(
        calculated.items.map((item, idx) => ({
          invoiceId: inv.id,
          description: itemsData[idx]?.description || "Item",
          quantity: String(item.quantityNum),
          unitPriceMinor: itemsData[idx]?.unitPriceMinor || 0n,
          discountMinor: item.discountMinor,
          taxRatePercent: String(item.taxRate),
          totalMinor: item.totalMinor,
        }))
      );
    }

    return inv;
  });
}

export async function getInvoiceByIdRepo(db: Db, orgId: string, id: string) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)));

  if (!inv) return null;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, inv.contactId), eq(contacts.orgId, orgId)));

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, inv.id));

  const payments = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, inv.id))
    .orderBy(desc(invoicePayments.paymentDate));

  return {
    ...inv,
    contact,
    items,
    payments,
  };
}

export async function listInvoicesRepo(
  db: Db,
  orgId: string,
  filter?: {
    type?: InvoiceType;
    status?: InvoiceStatus;
    contactId?: string;
  }
) {
  const conditions = [eq(invoices.orgId, orgId)];

  if (filter?.type) {
    conditions.push(eq(invoices.type, filter.type));
  }
  if (filter?.status) {
    conditions.push(eq(invoices.status, filter.status));
  }
  if (filter?.contactId) {
    conditions.push(eq(invoices.contactId, filter.contactId));
  }

  const rows = await db
    .select({
      invoice: invoices,
      contact: contacts,
    })
    .from(invoices)
    .innerJoin(contacts, eq(invoices.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));

  return rows.map((r) => ({
    ...r.invoice,
    contactName: r.contact.name,
    contactPhone: r.contact.phone,
  }));
}

export async function recordInvoicePaymentRepo(
  db: Db,
  orgId: string,
  input: RecordPaymentInput
) {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, orgId)));

    if (!inv) {
      throw new Error(`Faktur dengan ID ${input.invoiceId} tidak ditemukan.`);
    }

    const [payment] = await tx
      .insert(invoicePayments)
      .values({
        invoiceId: inv.id,
        paymentDate: input.paymentDate,
        amountMinor: input.amountMinor,
        paymentAccountId: input.paymentAccountId,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    const newAmountPaid = inv.amountPaidMinor + input.amountMinor;
    const newStatus = determineInvoiceStatus(
      inv.totalMinor,
      newAmountPaid,
      inv.dueDate
    );

    const [updatedInvoice] = await tx
      .update(invoices)
      .set({
        amountPaidMinor: newAmountPaid,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, inv.id))
      .returning();

    return {
      payment,
      updatedInvoice,
    };
  });
}

export interface AgingReportBucket {
  currentMinor: bigint;
  days1To30Minor: bigint;
  days31To60Minor: bigint;
  daysOver60Minor: bigint;
  totalOutstandingMinor: bigint;
}

export async function getAgingReportRepo(
  db: Db,
  orgId: string,
  type: InvoiceType = "INVOICE",
  asOfDate: Date = new Date()
) {
  const activeInvoices = await db
    .select({
      invoice: invoices,
      contact: contacts,
    })
    .from(invoices)
    .innerJoin(contacts, eq(invoices.contactId, contacts.id))
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.type, type),
        inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      )
    );

  const asOfDay = new Date(
    asOfDate.getFullYear(),
    asOfDate.getMonth(),
    asOfDate.getDate()
  ).getTime();

  let currentMinor = 0n;
  let days1To30Minor = 0n;
  let days31To60Minor = 0n;
  let daysOver60Minor = 0n;
  let totalOutstandingMinor = 0n;

  const itemized: Array<{
    invoiceId: string;
    invoiceNumber: string;
    contactName: string;
    dueDate: string;
    daysOverdue: number;
    outstandingMinor: bigint;
    bucket: "CURRENT" | "1_30" | "31_60" | "OVER_60";
  }> = [];

  for (const { invoice, contact } of activeInvoices) {
    const outstanding = invoice.totalMinor - invoice.amountPaidMinor;
    if (outstanding <= 0n) continue;

    totalOutstandingMinor += outstanding;

    const dueTime = new Date(invoice.dueDate).getTime();
    const diffDays = Math.floor((asOfDay - dueTime) / (1000 * 60 * 60 * 24));

    let bucket: "CURRENT" | "1_30" | "31_60" | "OVER_60";
    if (diffDays <= 0) {
      currentMinor += outstanding;
      bucket = "CURRENT";
    } else if (diffDays <= 30) {
      days1To30Minor += outstanding;
      bucket = "1_30";
    } else if (diffDays <= 60) {
      days31To60Minor += outstanding;
      bucket = "31_60";
    } else {
      daysOver60Minor += outstanding;
      bucket = "OVER_60";
    }

    itemized.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      contactName: contact.name,
      dueDate: invoice.dueDate,
      daysOverdue: Math.max(0, diffDays),
      outstandingMinor: outstanding,
      bucket,
    });
  }

  return {
    totalOutstandingMinor,
    buckets: {
      currentMinor,
      days1To30Minor,
      days31To60Minor,
      daysOver60Minor,
    },
    itemized,
  };
}
