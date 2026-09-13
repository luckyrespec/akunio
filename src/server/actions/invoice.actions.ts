"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db, type Db } from "@/server/db";
import { getEntryWithLines } from "@/server/db/repos/journals.repo";
import {
  createInvoiceRepo,
  listInvoicesRepo,
  getInvoiceByIdRepo,
  recordInvoicePaymentRepo,
  getAgingReportRepo,
  updateInvoiceRepo,
  type CreateInvoiceInput,
  type CreateInvoiceItemInput,
  type RecordPaymentInput,
} from "@/server/db/repos/invoices.repo";
import { postInvoiceToLedger, postInvoicePaymentToLedger } from "@/server/invoicing/posting";
import { PostingError } from "@/server/db/repos/journals.repo";
import { issueToMessage } from "@/core/journals/messages";
import { type InvoiceType, type InvoiceStatus } from "@/server/db/schema/invoicing";

export async function createInvoiceAction(
  invoiceData: CreateInvoiceInput,
  itemsData: CreateInvoiceItemInput[]
) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const invoice = await createInvoiceRepo(db, ctx.orgId, invoiceData, itemsData);
    revalidatePath("/faktur");
    return { ok: true as const, data: invoice };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat faktur." };
  }
}

export async function createInvoiceWithPostingAction(
  invoiceData: CreateInvoiceInput,
  itemsData: CreateInvoiceItemInput[],
  postToLedger: boolean,
) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const invoice = await createInvoiceRepo(db, ctx.orgId, invoiceData, itemsData);

    let journalEntryId: string | null = null;
    let postWarning: string | null = null;
    if (postToLedger) {
      try {
        journalEntryId = await postInvoiceToLedger(db, ctx.orgId, invoice.id, ctx.userEmail);
      } catch (e) {
        // Faktur tetap tersimpan sebagai belum-terposting; user bisa posting dari daftar.
        postWarning = e instanceof Error ? e.message : "Gagal memposting faktur ke jurnal.";
      }
    }

    revalidatePath("/faktur");
    revalidatePath("/jurnal");
    revalidatePath("/buku-besar");
    revalidatePath("/persediaan/daftar");
    return { ok: true as const, data: { invoice, journalEntryId, postWarning } };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat faktur." };
  }
}

export async function postInvoiceToJournalAction(invoiceId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const journalEntryId = await postInvoiceToLedger(db, ctx.orgId, invoiceId, ctx.userEmail);
    revalidatePath("/faktur");
    revalidatePath("/jurnal");
    revalidatePath("/buku-besar");
    revalidatePath("/persediaan/daftar");
    return { ok: true as const, journalEntryId };
  } catch (e) {
    // PostingError hanya membawa kode VALIDASI_GAGAL — uraikan isunya agar user tahu sebabnya.
    if (e instanceof PostingError) {
      return { ok: false as const, error: e.issues.map((i) => issueToMessage(i)).join("; ") };
    }
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memposting faktur ke jurnal." };
  }
}

export async function recordInvoicePaymentAction(
  input: RecordPaymentInput,
  autoPostToLedger: boolean = true
) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await recordInvoicePaymentRepo(db, ctx.orgId, input);

    let journalEntryId: string | undefined = undefined;
    if (autoPostToLedger) {
      journalEntryId = await postInvoicePaymentToLedger(db, ctx.orgId, res.payment.id, ctx.userEmail);
    }

    revalidatePath("/faktur");
    revalidatePath("/jurnal");
    revalidatePath("/buku-besar");
    return { ok: true as const, data: { ...res, journalEntryId } };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mencatat pembayaran faktur." };
  }
}

export async function listInvoicesAction(filter?: {
  type?: InvoiceType;
  status?: InvoiceStatus;
  contactId?: string;
}) {
  try {
    const ctx = await requireContext();
    const data = await listInvoicesRepo(db, ctx.orgId, filter);
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat daftar faktur." };
  }
}

export async function getInvoiceAction(id: string) {
  try {
    const ctx = await requireContext();
    const data = await getInvoiceByIdRepo(db, ctx.orgId, id);
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat faktur." };
  }
}

export async function getAgingReportAction(type: InvoiceType = "INVOICE") {
  try {
    const ctx = await requireContext();
    const data = await getAgingReportRepo(db, ctx.orgId, type);
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat laporan umur piutang/utang." };
  }
}

/**
 * Rincian satu faktur/tagihan untuk sheet drawer (dipakai chat Akunio + reusable).
 * Lookup per nomor. BigInt diserialkan ke string.
 */
export async function getInvoiceDetailAction(number: string) {
  try {
    const ctx = await requireContext();
    const clean = number.trim().toUpperCase();
    if (!clean) return { ok: false as const, error: "Nomor faktur kosong." };
    const { invoices } = await import("@/server/db/schema/invoicing");
    const { eq, and } = await import("drizzle-orm");
    const [head] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.invoiceNumber, clean)))
      .limit(1);
    if (!head) return { ok: false as const, error: `Faktur ${clean} tidak ditemukan.` };
    const full = await getInvoiceByIdRepo(db, ctx.orgId, head.id);
    if (!full) return { ok: false as const, error: `Faktur ${clean} tidak ditemukan.` };
    return {
      ok: true as const,
      data: {
        id: full.id,
        invoiceNumber: full.invoiceNumber,
        type: full.type,
        status: full.status,
        issueDate: full.issueDate,
        dueDate: full.dueDate,
        contactName: full.contact?.name ?? null,
        subtotalMinor: full.subtotalMinor.toString(),
        discountMinor: full.discountMinor.toString(),
        taxMinor: full.taxMinor.toString(),
        totalMinor: full.totalMinor.toString(),
        amountPaidMinor: full.amountPaidMinor.toString(),
        notes: full.notes,
        items: full.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPriceMinor: it.unitPriceMinor.toString(),
          discountMinor: it.discountMinor.toString(),
          taxRatePercent: it.taxRatePercent,
          totalMinor: it.totalMinor.toString(),
        })),
        payments: full.payments.map((p) => ({
          paymentDate: p.paymentDate,
          amountMinor: p.amountMinor.toString(),
          referenceNumber: p.referenceNumber,
        })),
      },
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memuat faktur." };
  }
}

/**
 * Koreksi faktur via app: jatuh tempo/catatan kapan pun.
 * Rincian barang dikunci bila sudah diposting (repo menolak dengan pesan jelas).
 */
export async function updateInvoiceAction(input: { id: string; dueDate?: string; notes?: string | null }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const patch: { dueDate?: string; notes?: string | null } = {};
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.notes !== undefined) patch.notes = input.notes;
    const updated = await updateInvoiceRepo(db, ctx.orgId, input.id, patch);
    revalidatePath("/faktur");
    revalidatePath(`/faktur/${input.id}`);
    return { ok: true as const, data: { id: updated.id, dueDate: updated.dueDate, status: updated.status } };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengoreksi faktur." };
  }
}

/** Pembawa hasil dry-run keluar dari transaksi yang sengaja di-rollback. */
class PreviewAbort {
  constructor(
    readonly payload: {
      number: string;
      memo: string;
      lines: Array<{
        accountCode: string;
        accountName: string;
        debitMinor: string;
        creditMinor: string;
        memo: string | null;
      }>;
    },
  ) {}
}

/**
 * Draf jurnal hasil posting faktur TANPA menyimpan apa pun.
 * Menjalankan pipeline posting asli di dalam transaksi yang selalu
 * di-rollback — pratinjau tak pernah drift dari eksekusi nyata.
 * Gagal validasi dikembalikan sebagai error berpesan (bukan exception buta).
 */
export async function previewInvoiceJournalAction(invoiceId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      const entryId = await postInvoiceToLedger(tx as unknown as Db, ctx.orgId, invoiceId, ctx.userEmail);
      const entry = await getEntryWithLines(tx, ctx.orgId, entryId);
      if (!entry) throw new Error("Gagal membaca draf jurnal.");
      throw new PreviewAbort({
        number: entry.number,
        memo: entry.memo,
        lines: entry.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debitMinor: l.debitMinor.toString(),
          creditMinor: l.creditMinor.toString(),
          memo: l.memo,
        })),
      });
    });
    return { ok: false as const, error: "Pratinjau gagal dibuat." };
  } catch (e) {
    if (e instanceof PreviewAbort) return { ok: true as const, data: e.payload };
    if (e instanceof PostingError) {
      return { ok: false as const, error: e.issues.map((i) => issueToMessage(i)).join("; ") };
    }
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat pratinjau jurnal." };
  }
}
