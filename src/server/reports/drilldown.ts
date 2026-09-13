import { eq, and, gte, lte } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { accounts } from "@/server/db/schema/org";
import { toMinor } from "@/server/db/repos/journals.repo";
import { Money } from "@/core/money/money";

export interface DrilldownLineItem {
  id: string;
  entryDate: string;
  memo: string;
  entryNumber: string;
  amountFormatted: string;
  amountMinor: string;
}

export interface DrilldownResult {
  accountCode: string;
  accountName: string;
  currentPeriod: string;
  currentPeriodTotal: string;
  comparePeriod?: string;
  comparePeriodTotal?: string;
  deltaAmount?: string;
  deltaPercentage?: string;
  items: DrilldownLineItem[];
  newExpenses: DrilldownLineItem[];
}

function getPeriodDates(period: string) {
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const start = `${period}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${period}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function drilldownAccountDetails(
  orgId: string,
  accountCode: string,
  periodStr: string,
  comparePeriodStr?: string
): Promise<DrilldownResult> {
  return withOrg(orgId, async (tx) => {
  // 1. Fetch account info
  const [acc] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, accountCode)));
  const accountName = acc?.name ?? accountCode;
  const accountId = acc?.id;

  if (!accountId) {
    return {
      accountCode,
      accountName,
      currentPeriod: periodStr,
      currentPeriodTotal: "Rp 0",
      items: [],
      newExpenses: [],
    };
  }

  // 2. Fetch lines for current period
  const curr = getPeriodDates(periodStr);
  const currRows = await tx
    .select({
      id: journalLines.id,
      entryDate: journalEntries.entryDate,
      entryNumber: journalEntries.number,
      memo: journalEntries.memo,
      lineMemo: journalLines.memo,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.status, "POSTED"),
        eq(journalLines.accountId, accountId),
        gte(journalEntries.entryDate, curr.start),
        lte(journalEntries.entryDate, curr.end)
      )
    );

  let currTotalMinor = 0n;
  const items: DrilldownLineItem[] = currRows.map((r) => {
    const debit = toMinor(r.debit);
    const credit = toMinor(r.credit);
    // For normal debit accounts (expenses/assets), net debit > 0
    const net = debit > 0n ? debit : credit;
    currTotalMinor += net;
    return {
      id: r.id,
      entryDate: r.entryDate,
      memo: r.lineMemo || r.memo,
      entryNumber: r.entryNumber || "",
      amountFormatted: Money.fromMinor(net).formatIdr(),
      amountMinor: net.toString(),
    };
  });

  // 3. Fetch compare period if provided
  let comparePeriodTotalFormatted: string | undefined;
  let deltaAmountFormatted: string | undefined;
  let deltaPercentage: string | undefined;
  const newExpenses: DrilldownLineItem[] = [];

  if (comparePeriodStr) {
    const comp = getPeriodDates(comparePeriodStr);
    const compRows = await tx
      .select({
        memo: journalEntries.memo,
        lineMemo: journalLines.memo,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalEntries.orgId, orgId),
          eq(journalEntries.status, "POSTED"),
          eq(journalLines.accountId, accountId),
          gte(journalEntries.entryDate, comp.start),
          lte(journalEntries.entryDate, comp.end)
        )
      );

    let compTotalMinor = 0n;
    const compMemos = new Set<string>();
    for (const r of compRows) {
      const debit = toMinor(r.debit);
      const credit = toMinor(r.credit);
      compTotalMinor += debit > 0n ? debit : credit;
      const m = (r.lineMemo || r.memo).toLowerCase().trim();
      compMemos.add(m);
    }

    comparePeriodTotalFormatted = Money.fromMinor(compTotalMinor).formatIdr();
    const deltaMinor = currTotalMinor - compTotalMinor;
    deltaAmountFormatted = Money.fromMinor(deltaMinor).formatIdr();

    if (compTotalMinor > 0n) {
      const pct = (Number(deltaMinor) / Number(compTotalMinor)) * 100;
      deltaPercentage = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    } else {
      deltaPercentage = "+100.0%";
    }

    for (const item of items) {
      if (!compMemos.has(item.memo.toLowerCase().trim())) {
        newExpenses.push(item);
      }
    }
  }

  return {
    accountCode,
    accountName,
    currentPeriod: periodStr,
    currentPeriodTotal: Money.fromMinor(currTotalMinor).formatIdr(),
    comparePeriod: comparePeriodStr,
    comparePeriodTotal: comparePeriodTotalFormatted,
    deltaAmount: deltaAmountFormatted,
    deltaPercentage,
    items,
    newExpenses,
  };
  });
}
