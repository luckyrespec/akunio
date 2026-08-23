import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { StatementShell, ReportRowView } from "@/components/statement-parts";

export default async function LabaRugiPage({
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
  const is = incomeStatement(aggregateFromLines(data.lines, metas));

  return (
    <StatementShell title="Laporan Laba Rugi" periodName={data.period.name}
                    options={data.options.map((p) => ({ name: p.name }))}>
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Pendapatan</p>
      {is.revenueRows.length === 0 && (
        <p className="pl-4 text-sm text-ink-soft">Tidak ada.</p>
      )}
      {is.revenueRows.map((r) => (
        <ReportRowView key={r.code} indent label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}
      <ReportRowView bold label="Total Pendapatan" minor={is.revenueTotalMinor} />

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">Beban</p>
      {is.expenseRows.length === 0 && (
        <p className="pl-4 text-sm text-ink-soft">Tidak ada.</p>
      )}
      {is.expenseRows.map((r) => (
        <ReportRowView key={r.code} indent label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}
      <ReportRowView bold label="Total Beban" minor={is.expenseTotalMinor} />

      <div className="mt-4 rule-double pt-2">
        <ReportRowView bold label="Laba Bersih" minor={is.netIncomeMinor} />
      </div>
    </StatementShell>
  );
}
