"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  createReconciliationRepo,
  getReconciliationByIdRepo,
  listReconciliationsRepo,
  saveStatementLinesRepo,
  linkMatchedLineRepo,
  unlinkMatchedLineRepo,
  finalizeReconciliationRepo,
  getUnmatchedLedgerLinesRepo,
} from "@/server/db/repos/reconciliation.repo";
import { extractBankStatement } from "@/server/ai/bank-statement-extractor";
import { matchBankTransactions } from "@/core/reconciliation/matcher";
import { createBankFeeJournal, createBankInterestJournal } from "@/server/reconciliation/quick-journal";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { listInvoicesRepo } from "@/server/db/repos/invoices.repo";
import { toMinor } from "@/server/db/repos/journals.repo";

export async function startReconciliationSessionAction(formData: FormData) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const bankAccountId = formData.get("bankAccountId") as string;
    const statementDate = formData.get("statementDate") as string;
    const file = formData.get("file") as File | null;
    const manualClosingBalanceStr = formData.get("closingBalance") as string | null;

    if (!bankAccountId || !statementDate) {
      return { ok: false as const, error: "Akun bank dan tanggal cut-off wajib diisi." };
    }

    let closingBalanceMinor = 0n;
    let linesToInsert: Array<{
      transactionDate: string;
      description: string;
      type: "CR" | "DB";
      amountMinor: bigint;
      referenceNumber?: string | null;
    }> = [];

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractBankStatement(buffer, file.type, file.name);
      closingBalanceMinor = extracted.closingBalanceMinor;
      linesToInsert = extracted.transactions.map((tx) => ({
        transactionDate: tx.date,
        description: tx.description,
        type: tx.type,
        amountMinor: tx.amountMinor,
        referenceNumber: tx.referenceNumber ?? null,
      }));
    } else if (manualClosingBalanceStr) {
      closingBalanceMinor = toMinor(manualClosingBalanceStr);
    }

    const session = await createReconciliationRepo(db, ctx.orgId, {
      bankAccountId,
      statementDate,
      statementBalanceMinor: closingBalanceMinor,
    });

    if (linesToInsert.length > 0) {
      await saveStatementLinesRepo(db, session.id, linesToInsert);
    }

    revalidatePath("/kas-bank/rekonsiliasi");
    return { ok: true as const, data: session };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memulai sesi rekonsiliasi." };
  }
}

export async function runAutoMatchAction(reconciliationId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const session = await getReconciliationByIdRepo(db, ctx.orgId, reconciliationId);
    if (!session) {
      return { ok: false as const, error: "Sesi rekonsiliasi tidak ditemukan." };
    }

    const unmatchedStatementLines = session.lines
      .filter((l) => l.matchStatus === "UNMATCHED")
      .map((l) => ({
        id: l.id,
        date: l.transactionDate,
        type: l.type as "CR" | "DB",
        amountMinor: l.amountMinor,
        description: l.description,
        referenceNumber: l.referenceNumber,
      }));

    const unmatchedLedgerLines = await getUnmatchedLedgerLinesRepo(
      db,
      ctx.orgId,
      session.bankAccountId,
      session.statementDate
    );

    const [contacts, invoices] = await Promise.all([
      listContactsRepo(db, ctx.orgId),
      listInvoicesRepo(db, ctx.orgId),
    ]);

    const result = matchBankTransactions(
      unmatchedStatementLines,
      unmatchedLedgerLines,
      contacts.map((c) => ({ id: c.id, name: c.name })),
      invoices.map((inv) => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, contactId: inv.contactId }))
    );

    // Apply exact matches directly
    for (const match of result.exactMatches) {
      await linkMatchedLineRepo(db, match.statementLineId, match.journalLineId, 100);
    }

    // Save AI suggestions (with status UNMATCHED and aiNotes)
    for (const sugg of result.aiSuggestions) {
      await linkMatchedLineRepo(
        db,
        sugg.statementLineId,
        sugg.journalLineId,
        sugg.confidenceScore,
        sugg.aiNotes
      );
    }

    revalidatePath(`/kas-bank/rekonsiliasi/${reconciliationId}`);
    revalidatePath("/kas-bank/rekonsiliasi");
    return { ok: true as const, data: result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menjalankan auto-match." };
  }
}

export async function confirmMatchAction(statementLineId: string, journalLineId: string) {
  try {
    await requireContext(["OWNER", "ACCOUNTANT"]);
    await linkMatchedLineRepo(db, statementLineId, journalLineId, 100);
    revalidatePath("/kas-bank/rekonsiliasi");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mencocokkan baris." };
  }
}

export async function unlinkMatchAction(statementLineId: string) {
  try {
    await requireContext(["OWNER", "ACCOUNTANT"]);
    await unlinkMatchedLineRepo(db, statementLineId);
    revalidatePath("/kas-bank/rekonsiliasi");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membatalkan pencocokan." };
  }
}

export async function createQuickAdjustmentAction(
  statementLineId: string,
  kind: "FEE" | "INTEREST"
) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    let journalId = "";
    if (kind === "FEE") {
      journalId = await createBankFeeJournal(db, ctx.orgId, statementLineId, ctx.userEmail);
    } else {
      journalId = await createBankInterestJournal(db, ctx.orgId, statementLineId, ctx.userEmail);
    }

    revalidatePath("/kas-bank/rekonsiliasi");
    revalidatePath("/jurnal");
    revalidatePath("/buku-besar");
    return { ok: true as const, journalId };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat jurnal penyesuaian." };
  }
}

export async function finalizeReconciliationAction(reconciliationId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const session = await getReconciliationByIdRepo(db, ctx.orgId, reconciliationId);
    if (!session) {
      return { ok: false as const, error: "Sesi rekonsiliasi tidak ditemukan." };
    }

    // Check if difference is 0 or all lines matched
    const completed = await finalizeReconciliationRepo(db, ctx.orgId, reconciliationId, ctx.userEmail);
    revalidatePath("/kas-bank/rekonsiliasi");
    revalidatePath(`/kas-bank/rekonsiliasi/${reconciliationId}`);
    return { ok: true as const, data: completed };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menyelesaikan rekonsiliasi." };
  }
}
