import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import {
  changesInEquity, incomeStatement, movementByCode,
} from "@/core/reports/statements";
import { StatementShell, ReportRowView } from "@/components/statement-parts";

export default async function PerubahanEkuitasPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;

  const data = await db.transaction(async (tx) => {
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);
    const lines = await postedLinesBetween(tx, ctx.orgId, period.startsOn, period.endsOn);
    return { accRows, period, options, lines };
  });

  const metas = reportMetaMap(data.accRows);
  const periodAggs = aggregateFromLines(data.lines, metas);
  const is = incomeStatement(periodAggs);

  // v1: buku dimulai bersih; year-end close menyusul di milestone lanjutan.
  const cie = changesInEquity({
    openingRetainedEarningsMinor: 0n,
    contributionsMinor: movementByCode(periodAggs, "3100"),
    drawingsMinor: movementByCode(periodAggs, "3300"),
    netIncomeMinor: is.netIncomeMinor,
  });

  return (
    <StatementShell title="Laporan Perubahan Ekuitas" periodName={data.period.name}
                    options={data.options.map((p) => ({ name: p.name }))}>
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">
        Periode {data.period.name}
      </p>
      {cie.rows.map((r) => (
        <ReportRowView key={r.label} label={r.label} minor={r.movementMinor} />
      ))}
      <div className="mt-4 rule-double pt-2">
        <ReportRowView bold label="Laba Ditahan Akhir"
                       minor={cie.closingRetainedEarningsMinor} />
      </div>
    </StatementShell>
  );
}
