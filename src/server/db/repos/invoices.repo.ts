import { Db } from "../index";
import type { Queryable } from "./queryable";
import {
  invoices,
  invoiceItems,
  invoicePayments,
  contacts,
  type InvoiceType,
  type InvoiceStatus,
} from "../schema/invoicing";
import { accounts } from "../schema/org";
import { calculateInvoiceTotals, determineInvoiceStatus } from "@/core/invoicing/calculations";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface CreateInvoiceItemInput {
  description: string;
  quantity: number | string;
  unitPriceMinor: bigint;
  discountMinor?: bigint;
  taxRatePercent?: number | string;
  catalogItemId?: string | null;
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
  // Kunci idempotency client per dialog (Ruling R8): key sama → record sama,
  // unik per (invoice_id, key). Absen = perilaku lama (tanpa dedup).
  idempotencyKey?: string | null;
}

export async function getNextInvoiceNumberRepo(
  q: Queryable,
  orgId: string,
  type: InvoiceType,
  year: number = new Date().getFullYear()
): Promise<string> {
  // WAJIB dalam transaksi pemanggil: xact lock menyerikan upsert counter
  // per org-tahun-tipe (pola pos_sale_seq_counters).
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inv:${orgId}:${year}:${type}`}))`);
  const res = await q.execute(sql`
    INSERT INTO invoice_seq_counters (org_id, year, type, last_seq)
    VALUES (${orgId}, ${year}, ${type}, 1)
    ON CONFLICT (org_id, year, type)
    DO UPDATE SET last_seq = invoice_seq_counters.last_seq + 1
    RETURNING last_seq
  `);
  const seq = Number((res.rows?.[0] as { last_seq: number } | undefined)?.last_seq ?? 1);
  const prefix = type === "INVOICE" ? `INV-${year}-` : `BILL-${year}-`;
  return `${prefix}${String(seq).padStart(4, "0")}`;
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

  return db.transaction(async (tx) => {
    // Penomoran di DALAM transaksi agar lock+counter anti-race berlaku.
    const issueYear =
      Number(invoiceData.issueDate.slice(0, 4)) || new Date().getFullYear();
    const invoiceNumber =
      invoiceData.invoiceNumber ||
      (await getNextInvoiceNumberRepo(tx, orgId, invoiceData.type, issueYear));

    const status =
      invoiceData.status ??
      determineInvoiceStatus(calculated.totalMinor, 0n, invoiceData.dueDate);

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
          catalogItemId: itemsData[idx]?.catalogItemId ?? null,
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

/** Cari pembayaran existing berdasar kunci idempotency (kontrak: key sama → record sama, unik per invoice). */
export async function findPaymentByIdempotencyKey(
  q: Queryable,
  invoiceId: string,
  key: string,
) {
  const [dupe] = await q
    .select()
    .from(invoicePayments)
    .where(and(eq(invoicePayments.invoiceId, invoiceId), eq(invoicePayments.idempotencyKey, key)))
    .limit(1);
  return dupe ?? null;
}

/** True bila error adalah pelanggaran unik invoice_payments_inv_idem_uq (jendela race double-submit). */
function isPaymentIdemConflict(e: unknown): boolean {
  const pg = e as { code?: unknown; constraint?: unknown } | null;
  if (!pg || typeof pg !== "object" || pg.code !== "23505") return false;
  if (pg.constraint === "invoice_payments_inv_idem_uq") return true;
  return e instanceof Error && e.message.includes("invoice_payments_inv_idem_uq");
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

    // Isolasi org via invoice terverifikasi di atas (tanpa kolom org_id —
    // Ruling R8): semua pre-check difilter invoice_id milik org ini.
    const idemKey = input.idempotencyKey ?? null;
    if (idemKey) {
      // Serikan double-submit konkuren per invoice+key: yang kalah menunggu
      // lock, lalu pre-check di bawah melihat baris pemenang yang sudah komit.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`invpay:${inv.id}:${idemKey}`}))`);
      const dupe = await findPaymentByIdempotencyKey(tx, inv.id, idemKey);
      if (dupe) {
        const [fresh] = await tx.select().from(invoices).where(eq(invoices.id, inv.id));
        return { payment: dupe, updatedInvoice: fresh ?? inv };
      }
    }

    // Guard nilai pelunasan (di repo, bukan hanya UI): nominal positif,
    // akun kas/bank wajib, dan tak boleh melebihi sisa tagihan.
    // Berjalan SETELAH dedup idempotency di atas agar retry double-submit
    // (nominal lama yang kini melebihi sisa) tetap kembali ke record existing.
    if (input.amountMinor <= 0n) {
      throw new Error("NOMINAL_HARUS_POSITIF: jumlah pelunasan harus lebih dari Rp 0.");
    }
    if (!input.paymentAccountId) {
      throw new Error("AKUN_KAS_WAJIB: pilih akun kas atau bank untuk pelunasan.");
    }
    const [payAccount] = await tx
      .select({ id: accounts.id, isCash: accounts.isCash, isBank: accounts.isBank })
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, input.paymentAccountId)))
      .limit(1);
    if (!payAccount || (!payAccount.isCash && !payAccount.isBank)) {
      throw new Error("BUKAN_AKUN_KAS: akun pelunasan harus akun kas atau bank.");
    }
    if (inv.amountPaidMinor + input.amountMinor > inv.totalMinor) {
      throw new Error(
        `MELEBIHI_SISA: jumlah pelunasan melebihi sisa tagihan faktur ${inv.invoiceNumber}.`
      );
    }

    let payment: typeof invoicePayments.$inferSelect;
    try {
      [payment] = await tx
        .insert(invoicePayments)
        .values({
          invoiceId: inv.id,
          paymentDate: input.paymentDate,
          amountMinor: input.amountMinor,
          paymentAccountId: input.paymentAccountId,
          referenceNumber: input.referenceNumber ?? null,
          idempotencyKey: idemKey,
          notes: input.notes ?? null,
        })
        .returning();
    } catch (e) {
      // Jendela race sisa (key ditulis jalur lain tanpa lock): kembalikan
      // record existing, bukan error mentah. Di dalam transaksi yang sudah
      // abort, SELECT ikut gagal — jatuhkan error asli bila begitu.
      if (idemKey && isPaymentIdemConflict(e)) {
        try {
          const existing = await findPaymentByIdempotencyKey(tx, inv.id, idemKey);
          if (existing) {
            const [fresh] = await tx.select().from(invoices).where(eq(invoices.id, inv.id));
            return { payment: existing, updatedInvoice: fresh ?? inv };
          }
        } catch {}
      }
      throw e;
    }

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

export interface UpdateInvoiceInput {
  dueDate?: string;
  notes?: string | null;
  items?: CreateInvoiceItemInput[];
}

/**
 * Koreksi faktur: jatuh tempo/catatan kapan pun; rincian barang HANYA
 * selama belum diposting (sudah masuk jurnal → tolak dengan pesan jelas,
 * koreksi lewat pembalik/kredit).
 */
export async function updateInvoiceRepo(
  db: Db,
  orgId: string,
  invoiceId: string,
  patch: UpdateInvoiceInput,
) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)));
  if (!inv) throw new Error("FAKTUR_TIDAK_DITEMUKAN");
  const posted = Boolean(inv.journalEntryId);

  if (patch.items !== undefined && posted) {
    throw new Error(
      "FAKTUR_SUDAH_DIPOSTING: rincian barang tak bisa diubah karena sudah masuk jurnal. Buat jurnal pembalik/koreksi sebagai gantinya.",
    );
  }

  return db.transaction(async (tx) => {
    const values: Partial<typeof invoices.$inferInsert> = {};
    if (patch.dueDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) throw new Error("TANGGAL_TIDAK_VALID: gunakan YYYY-MM-DD.");
      values.dueDate = patch.dueDate;
    }
    if (patch.notes !== undefined) values.notes = patch.notes;

    if (patch.items !== undefined) {
      if (patch.items.length === 0) throw new Error("ITEM_FAKTUR_KOSONG: minimal satu baris barang/jasa.");
      for (const [idx, it] of patch.items.entries()) {
        const qty = Number(it.quantity);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`ITEM_KE_${idx + 1}_QTY_TIDAK_VALID`);
        if (it.unitPriceMinor < 0n) throw new Error(`ITEM_KE_${idx + 1}_HARGA_TIDAK_VALID`);
      }
      const calculated = calculateInvoiceTotals(
        patch.items.map((it) => ({
          quantity: it.quantity,
          unitPriceMinor: it.unitPriceMinor,
          discountMinor: it.discountMinor ?? 0n,
          taxRatePercent: it.taxRatePercent ?? 0,
        })),
      );
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
      await tx.insert(invoiceItems).values(
        calculated.items.map((item, idx) => ({
          invoiceId: inv.id,
          description: patch.items![idx]?.description || "Item",
          catalogItemId: patch.items![idx]?.catalogItemId ?? null,
          quantity: String(item.quantityNum),
          unitPriceMinor: patch.items![idx]?.unitPriceMinor || 0n,
          discountMinor: item.discountMinor,
          taxRatePercent: String(item.taxRate),
          totalMinor: item.totalMinor,
        })),
      );
      values.subtotalMinor = calculated.subtotalMinor;
      values.discountMinor = calculated.discountMinor;
      values.taxMinor = calculated.taxMinor;
      values.totalMinor = calculated.totalMinor;
    }

    const dueDate = (values.dueDate as string | undefined) ?? inv.dueDate;
    const totalMinor = (values.totalMinor as bigint | undefined) ?? inv.totalMinor;
    values.status = determineInvoiceStatus(totalMinor, inv.amountPaidMinor, dueDate);

    const [updated] = await tx
      .update(invoices)
      .set(values)
      .where(and(eq(invoices.id, inv.id), eq(invoices.orgId, orgId)))
      .returning();
    return updated;
  });
}
