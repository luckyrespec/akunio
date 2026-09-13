import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { buildSakEmkmIncomeStatement } from "@/core/reports/sak-emkm";
import type { AccountAggregate } from "@/core/reports/aggregates";
import type { ReportRow } from "@/core/reports/statements";

export interface PlCardRow {
  id: string;
  code: string;
  name: string;
  count: number;
  movementMinor: bigint;
}

export interface PlCardSection {
  label: string;
  rows: PlCardRow[];
  subtotalMinor: bigint;
}

export interface PlCardsData {
  periodName: string;
  periodEndsOn: string;
  fromISO: string;
  options: { name: string }[];
  revenueSections: PlCardSection[];
  expenseSections: PlCardSection[];
  totalRevenueMinor: bigint;
  totalExpenseMinor: bigint;
  movedRevenueCount: number;
  movedExpenseCount: number;
  revenueAccountCount: number;
  expenseAccountCount: number;
}

export async function loadPlCards(
  orgId: string,
  periodParam?: string,
  cumulative = false,
): Promise<PlCardsData> {
  const data = await db.transaction(async (tx) => {
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, orgId));
    const period = await loadPeriodOrDefault(tx, orgId, periodParam);
    const options = await listPeriods(tx, orgId);
    const fromISO = cumulative ? `${period.endsOn.slice(0, 4)}-01-01` : period.startsOn;
    const lines = await postedLinesBetween(tx, orgId, fromISO, period.endsOn);
    return { accRows, period, options, lines };
  });

  const stats = new Map<string, { debitMinor: bigint; creditMinor: bigint; count: number }>();
  for (const l of data.lines) {
    const s = stats.get(l.accountId) ?? { debitMinor: 0n, creditMinor: 0n, count: 0 };
    s.debitMinor += l.debitMinor;
    s.creditMinor += l.creditMinor;
    s.count += 1;
    stats.set(l.accountId, s);
  }

  const hasChildren = new Set(data.accRows.map((a) => a.parentCode).filter(Boolean));
  const metas = reportMetaMap(data.accRows);
  const showable = data.accRows.filter(
    (a) =>
      (a.type === "PENDAPATAN" || a.type === "BEBAN") &&
      !hasChildren.has(a.code) &&
      (!a.archivedAt || stats.has(a.id)),
  );

  const aggs: AccountAggregate[] = showable.map((a) => ({
    meta: metas.get(a.id)!,
    debitMinor: stats.get(a.id)?.debitMinor ?? 0n,
    creditMinor: stats.get(a.id)?.creditMinor ?? 0n,
  }));

  const is = buildSakEmkmIncomeStatement(aggs);
  const idByCode = new Map(showable.map((a) => [a.code, a.id]));

  const toRows = (rows: ReportRow[]): PlCardRow[] =>
    rows.map((r) => {
      const id = idByCode.get(r.code)!;
      return {
        id,
        code: r.code,
        name: r.name,
        count: stats.get(id)?.count ?? 0,
        movementMinor: r.movementMinor,
      };
    });

  const revenueSections: PlCardSection[] = [
    { label: "Pendapatan Usaha", rows: toRows(is.revenueRows), subtotalMinor: is.totalRevenueMinor },
    {
      label: "Pendapatan Lain-lain",
      rows: toRows(is.otherRevenueRows),
      subtotalMinor: is.totalOtherRevenueMinor,
    },
  ].filter((s) => s.rows.length > 0);

  const expenseSections: PlCardSection[] = [
    { label: "Beban Pokok Penjualan", rows: toRows(is.cogsRows), subtotalMinor: is.totalCogsMinor },
    {
      label: "Beban Operasional",
      rows: toRows(is.operatingExpenseRows),
      subtotalMinor: is.totalOperatingExpenseMinor,
    },
    { label: "Beban Pajak", rows: toRows(is.taxExpenseRows), subtotalMinor: is.totalTaxExpenseMinor },
    {
      label: "Beban Lain-lain",
      rows: toRows(is.otherExpenseRows),
      subtotalMinor: is.totalOtherExpenseMinor,
    },
  ].filter((s) => s.rows.length > 0);

  const movedCount = (sections: PlCardSection[]) =>
    sections.reduce((n, s) => n + s.rows.filter((r) => r.movementMinor !== 0n).length, 0);

  return {
    periodName: data.period.name,
    periodEndsOn: data.period.endsOn,
    fromISO: cumulative ? `${data.period.endsOn.slice(0, 4)}-01-01` : data.period.startsOn,
    options: data.options,
    revenueSections,
    expenseSections,
    totalRevenueMinor: is.totalRevenueMinor + is.totalOtherRevenueMinor,
    totalExpenseMinor:
      is.totalCogsMinor + is.totalOperatingExpenseMinor + is.totalTaxExpenseMinor + is.totalOtherExpenseMinor,
    movedRevenueCount: movedCount(revenueSections),
    movedExpenseCount: movedCount(expenseSections),
    revenueAccountCount: revenueSections.reduce((n, s) => n + s.rows.length, 0),
    expenseAccountCount: expenseSections.reduce((n, s) => n + s.rows.length, 0),
  };
}
