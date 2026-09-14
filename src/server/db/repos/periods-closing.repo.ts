import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { fiscalPeriods, accounts, organizations } from "../schema/org";
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
    retainedEarningsAccountId?: string;
  },
) {
  const {
    orgId,
    periodName,
    actorEmail,
    isYearEnd = periodName.endsWith("-12"),
    retainedEarningsAccountId,
  } = params;

  const [org] = await q
    .select({ fiscalYearStartMonth: organizations.fiscalYearStartMonth })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Engine tutup tahun berasumsi tahun kalender Jan–Des (agregat 12 periode
  // "YYYY-01".."YYYY-12", penutup di Desember). Fiskal non-Januari di luar
  // lingkup: tolak eksplisit, bukan tutup diam-diam yang salah.
  if (isYearEnd && (org?.fiscalYearStartMonth ?? 1) !== 1) {
    throw new Error("FISKAL_NON_KALENDER_BELUM_DIDUKUNG");
  }

  const [period] = await q
    .select()
    .from(fiscalPeriods)
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, periodName)))
    .limit(1);

  if (!period) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  if (period.status !== "OPEN") throw new Error("PERIODE_SUDAH_DITUTUP");

  // Guard server: periode yang belum siap (draf menggantung, rekonsiliasi
  // belum klop, dsb.) tidak boleh ditutup walau UI sudah me-disable tombol.
  const readiness = await evaluatePeriodReadiness(q, orgId, periodName);
  if (!readiness.isReady) {
    const blockers = Object.values(readiness.items)
      .filter((i) => !i.passed)
      .map((i) => i.title)
      .join("; ");
    throw new Error(`BELUM_SIAP: ${blockers}`);
  }

  let closingJournalId: string | null = null;

  // Tutup tahun tanpa akun Laba Ditahan = jurnal penutup tak terbentuk dan
  // nominal tak di-nol-kan: tolak eksplisit, bukan tutup diam-diam (I3).
  if (isYearEnd && !retainedEarningsAccountId) {
    throw new Error("LABA_DITAHAN_WAJIB: tutup tahun wajib menyertakan akun Laba Ditahan.");
  }

  // If year-end, generate and post closing entries to Retained Earnings
  if (isYearEnd && retainedEarningsAccountId) {
    // Agregat seluruh akun nominal setahun via periode fiskal tahun itu
    // (bukan LIKE pada kolom date — tak ada operator LIKE untuk date di PG).
    const yearPrefix = periodName.slice(0, 4);

    const yearPeriods = await q
      .select({ id: fiscalPeriods.id })
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.orgId, orgId),
          sql`left(${fiscalPeriods.name}, 4) = ${yearPrefix}`,
        ),
      );
    const yearPeriodIds = yearPeriods.map((p) => p.id);

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
          inArray(journalEntries.periodId, yearPeriodIds),
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
          inArray(journalEntries.periodId, yearPeriodIds),
        ),
      )
      .groupBy(journalLines.accountId);

    // Prive pemilik (EKUITAS 33xx, normal debit) ikut ditutup ke Laba Ditahan.
    const priveRows = await q
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
          eq(accounts.type, "EKUITAS"),
          sql`${accounts.code} LIKE '33%'`,
          eq(journalEntries.status, "POSTED"),
          inArray(journalEntries.periodId, yearPeriodIds),
        ),
      )
      .groupBy(journalLines.accountId);

    const closingLines = generateYearEndClosingLines({
      revenueBalances: revRows.map((r) => ({
        accountId: r.accountId,
        balanceMinor: toMinor(r.creditTotal),
      })),
      expenseBalances: expRows.map((e) => ({
        accountId: e.accountId,
        balanceMinor: toMinor(e.debitTotal),
      })),
      drawingsBalances: priveRows.map((p) => ({
        accountId: p.accountId,
        balanceMinor: toMinor(p.debitTotal),
      })),
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
