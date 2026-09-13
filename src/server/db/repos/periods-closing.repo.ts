import { and, eq, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { fiscalPeriods, accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import { aiDrafts } from "../schema/ai";
import { bankReconciliations } from "../schema/reconciliation";
import { assetDepreciationLines, fixedAssets } from "../schema/assets";
import { invoices } from "../schema/invoicing";
import { postJournalEntry, toMinor } from "./journals.repo";
import {
  evaluatePreClosingChecklist,
  type PreClosingChecklistResult,
} from "@/core/periods/closing-checklist";
import { generateYearEndClosingLines } from "@/core/periods/closing-journal";

export async function evaluatePeriodReadiness(
  q: Queryable,
  orgId: string,
  periodName: string, // YYYY-MM
): Promise<PreClosingChecklistResult> {
  const [period] = await q
    .select()
    .from(fiscalPeriods)
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, periodName)))
    .limit(1);

  if (!period) {
    throw new Error(`PERIODE_TIDAK_DITEMUKAN: ${periodName}`);
  }

  // 1. Unreconciled bank sessions: any reconciliation session in this period date range that is not COMPLETED or has difference != 0
  const unreconciledSessions = await q
    .select({ id: bankReconciliations.id })
    .from(bankReconciliations)
    .where(
      and(
        eq(bankReconciliations.orgId, orgId),
        sql`${bankReconciliations.statementDate} >= ${period.startsOn} AND ${bankReconciliations.statementDate} <= ${period.endsOn}`,
        sql`(${bankReconciliations.status} != 'COMPLETED' OR ${bankReconciliations.differenceMinor} != 0)`,
      ),
    );

  // 2. Pending drafts in this org
  const pendingDrafts = await q
    .select({ id: aiDrafts.id })
    .from(aiDrafts)
    .where(
      and(
        eq(aiDrafts.orgId, orgId),
        eq(aiDrafts.status, "PENDING"),
      ),
    );

  // 3. Unposted depreciation for active assets in this period
  const unpostedDep = await q
    .select({ id: assetDepreciationLines.id })
    .from(assetDepreciationLines)
    .innerJoin(fixedAssets, eq(assetDepreciationLines.assetId, fixedAssets.id))
    .where(
      and(
        eq(assetDepreciationLines.orgId, orgId),
        eq(assetDepreciationLines.periodName, periodName),
        eq(assetDepreciationLines.status, "SCHEDULED"),
        eq(fixedAssets.status, "ACTIVE"),
        sql`${assetDepreciationLines.depreciationAmountMinor} > 0`,
      ),
    );

  // 4. Unposted invoices: DRAFT invoices within this period
  const unpostedInvs = await q
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.status, "DRAFT"),
        sql`${invoices.issueDate} >= ${period.startsOn} AND ${invoices.issueDate} <= ${period.endsOn}`,
      ),
    );

  // 5. Trial balance check for this period (sum of all POSTED journal entries)
  const tbRes = await q
    .select({
      totalDebit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
      totalCredit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.orgId, orgId),
        eq(journalEntries.status, "POSTED"),
        eq(journalEntries.periodId, period.id),
      ),
    );

  const totalDebit = toMinor(tbRes[0]?.totalDebit ?? "0");
  const totalCredit = toMinor(tbRes[0]?.totalCredit ?? "0");
  const diffMinor = totalDebit > totalCredit ? totalDebit - totalCredit : totalCredit - totalDebit;

  return evaluatePreClosingChecklist({
    unreconciledBankSessionsCount: unreconciledSessions.length,
    pendingDraftsCount: pendingDrafts.length,
    unpostedDepreciationAssetsCount: unpostedDep.length,
    unpostedInvoicesCount: unpostedInvs.length,
    trialBalanceDiffMinor: diffMinor,
  });
}

export async function closePeriod(
  q: Queryable,
  params: {
    orgId: string;
    periodName: string; // YYYY-MM
    actorEmail: string;
    isYearEnd?: boolean;
    incomeSummaryAccountId?: string;
    retainedEarningsAccountId?: string;
  },
) {
  const {
    orgId,
    periodName,
    actorEmail,
    isYearEnd = periodName.endsWith("-12"),
    incomeSummaryAccountId,
    retainedEarningsAccountId,
  } = params;

  const [period] = await q
    .select()
    .from(fiscalPeriods)
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, periodName)))
    .limit(1);

  if (!period) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  if (period.status !== "OPEN") throw new Error("PERIODE_SUDAH_DITUTUP");

  let closingJournalId: string | null = null;

  // If year-end, generate and post closing entries to Retained Earnings
  if (isYearEnd && retainedEarningsAccountId) {
    // Find all revenues and expenses for the entire year
    const yearPrefix = periodName.slice(0, 4);

    const revRows = await q
      .select({
        accountId: journalLines.accountId,
        creditTotal: sql<string>`COALESCE(SUM(${journalLines.credit} - ${journalLines.debit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, orgId),
          eq(accounts.type, "PENDAPATAN"),
          eq(journalEntries.status, "POSTED"),
          sql`${journalEntries.entryDate} LIKE ${`${yearPrefix}%`}`,
        ),
      )
      .groupBy(journalLines.accountId);

    const expRows = await q
      .select({
        accountId: journalLines.accountId,
        debitTotal: sql<string>`COALESCE(SUM(${journalLines.debit} - ${journalLines.credit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, orgId),
          eq(accounts.type, "BEBAN"),
          eq(journalEntries.status, "POSTED"),
          sql`${journalEntries.entryDate} LIKE ${`${yearPrefix}%`}`,
        ),
      )
      .groupBy(journalLines.accountId);

    const revenueBalances = revRows.map((r) => ({
      accountId: r.accountId,
      balanceCreditMinor: toMinor(r.creditTotal),
    }));

    const expenseBalances = expRows.map((e) => ({
      accountId: e.accountId,
      balanceDebitMinor: toMinor(e.debitTotal),
    }));

    const closingLines = generateYearEndClosingLines({
      revenueBalances,
      expenseBalances,
      incomeSummaryAccountId: incomeSummaryAccountId ?? retainedEarningsAccountId,
      retainedEarningsAccountId,
    });

    if (closingLines.length >= 2) {
      const je = await postJournalEntry(q, orgId, actorEmail, {
        dateISO: period.endsOn,
        memo: `Jurnal Penutup Akhir Tahun Fiskal ${yearPrefix}`,
        source: "AI",
        idempotencyKey: `closing-${orgId}-${yearPrefix}`,
        lines: closingLines.map((l) => ({
          accountId: l.accountId,
          debitMinor: l.debitMinor,
          creditMinor: l.creditMinor,
        })),
      });
      closingJournalId = je.id;
    }
  }

  // Set period to CLOSED
  const [updatedPeriod] = await q
    .update(fiscalPeriods)
    .set({ status: "CLOSED" })
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.id, period.id)))
    .returning();

  // Tahun buku selesai → kebijakan metode persediaan dibuka lagi sampai
  // mutasi stok pertama tahun berikutnya.
  if (isYearEnd) {
    const { inventorySettings } = await import("../schema/inventory");
    await q.update(inventorySettings)
      .set({ isLocked: false })
      .where(and(eq(inventorySettings.orgId, orgId), eq(inventorySettings.isLocked, true)));
  }

  return { period: updatedPeriod, closingJournalId };
}
