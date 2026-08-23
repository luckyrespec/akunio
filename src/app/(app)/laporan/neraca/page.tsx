import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { balanceSheet, incomeStatement } from "@/core/reports/statements";
import { StatementShell, ReportRowView } from "@/components/statement-parts";

export default async function NeracaPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;

  const data = await db.transaction(async (tx) => {
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);
    const lines = await postedLinesThrough(tx, ctx.orgId, period.endsOn);
    return { accRows, period, options, lines };
  });

  const metas = reportMetaMap(data.accRows);
  const aggs = aggregateFromLines(data.lines, metas);
  // Cumulative NI: books start fresh, no year-end close yet.
  const ni = incomeStatement(aggs).netIncomeMinor;
  const bs = balanceSheet(aggs, ni);

  return (
    <StatementShell title="Neraca" periodName={data.period.name}
                    options={data.options.map((p) => ({ name: p.name }))}>
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Aset</p>
      {bs.assetRows.length === 0 && (
        <p className="pl-4 text-sm text-ink-soft">Tidak ada.</p>
      )}
      {bs.assetRows.map((r) => (
        <ReportRowView key={r.code} indent label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}
      <ReportRowView bold label="Total Aset" minor={bs.totalAssetsMinor} />

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">Liabilitas</p>
      {bs.liabilityRows.length === 0 && (
        <p className="pl-4 text-sm text-ink-soft">Tidak ada.</p>
      )}
      {bs.liabilityRows.map((r) => (
        <ReportRowView key={r.code} indent label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">Ekuitas</p>
      {bs.equityRows.map((r) => (
        <ReportRowView key={r.code} indent label={r.name} minor={r.movementMinor} />
      ))}
      <div className="mt-4 rule-double pt-2">
        <ReportRowView bold label="Liabilitas + Ekuitas"
                       minor={bs.totalEquityAndLiabilitiesMinor} />
      </div>
    </StatementShell>
  );
}
