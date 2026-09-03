import { Db } from "@/server/db";
import { invoices, invoicePayments } from "@/server/db/schema/invoicing";
import { accounts } from "@/server/db/schema/org";
import { getInvoiceByIdRepo } from "@/server/db/repos/invoices.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { eq, and } from "drizzle-orm";

async function getAccountByCode(db: Db, orgId: string, code: string) {
  const [row] = await db
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
      // Penjualan (Piutang)
      const arAccount = await getAccountByCode(tx as Db, orgId, "1200"); // Piutang Usaha
      const revAccount = await getAccountByCode(tx as Db, orgId, "4100"); // Pendapatan Usaha

      // Debit: Piutang Usaha (Total)
      lines.push({
        accountId: arAccount.id,
        debitMinor: inv.totalMinor,
        creditMinor: 0n,
        memo: `Piutang ${inv.invoiceNumber}`,
      });

      // Kredit: Pendapatan Usaha (Net Subtotal)
      const netSubtotal = inv.subtotalMinor - inv.discountMinor;
      lines.push({
        accountId: revAccount.id,
        debitMinor: 0n,
        creditMinor: netSubtotal,
        memo: `Pendapatan ${inv.invoiceNumber}`,
      });

      // Kredit: PPN Keluaran (jika ada)
      if (inv.taxMinor > 0n) {
        const taxAccount = await getAccountByCode(tx as Db, orgId, "2200"); // PPN Keluaran
        lines.push({
          accountId: taxAccount.id,
          debitMinor: 0n,
          creditMinor: inv.taxMinor,
          memo: `PPN Keluaran ${inv.invoiceNumber}`,
        });
      }
    } else {
      // Pembelian (Utang)
      const apAccount = await getAccountByCode(tx as Db, orgId, "2100"); // Utang Usaha
      const expAccount = await getAccountByCode(tx as Db, orgId, "5100"); // Beban Pokok Penjualan

      const netSubtotal = inv.subtotalMinor - inv.discountMinor;
      lines.push({
        accountId: expAccount.id,
        debitMinor: netSubtotal,
        creditMinor: 0n,
        memo: `Beban/Pembelian ${inv.invoiceNumber}`,
      });

      if (inv.taxMinor > 0n) {
        const taxAccount = await getAccountByCode(tx as Db, orgId, "1400"); // PPN Masukan
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
      tx as Db,
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
      const arAccount = await getAccountByCode(tx as Db, orgId, "1200");

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
      const apAccount = await getAccountByCode(tx as Db, orgId, "2100");

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
      tx as Db,
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
