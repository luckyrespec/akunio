"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  createInvoiceRepo,
  listInvoicesRepo,
  getInvoiceByIdRepo,
  recordInvoicePaymentRepo,
  getAgingReportRepo,
  type CreateInvoiceInput,
  type CreateInvoiceItemInput,
  type RecordPaymentInput,
} from "@/server/db/repos/invoices.repo";
import { postInvoiceToLedger, postInvoicePaymentToLedger } from "@/server/invoicing/posting";
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
    return { ok: true as const, journalEntryId };
  } catch (e) {
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
