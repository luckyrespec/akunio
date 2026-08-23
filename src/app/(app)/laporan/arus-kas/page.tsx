import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import {
  cashFlowIndirect, incomeStatement, movementByCode,
} from "@/core/reports/statements";
import { StatementShell, ReportRowView } from "@/components/statement-parts";

export default async function ArusKasPage({
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

  const cf = cashFlowIndirect({
    netIncomeMinor: is.netIncomeMinor,
    deltaPiutangMinor: movementByCode(periodAggs, "1200"),
    deltaPersediaanMinor: movementByCode(periodAggs, "1300"),
    deltaUtangUsahaMinor: movementByCode(periodAggs, "2100"),
    depreciationMinor: movementByCode(periodAggs, "5600"),
    investingMinor: -movementByCode(periodAggs, "1500"),
    financingMinor:
      movementByCode(periodAggs, "3100") +
      movementByCode(periodAggs, "2400") -
      movementByCode(periodAggs, "3300"),
  });

  return (
    <StatementShell title="Laporan Arus Kas" periodName={data.period.name}
                    options={data.options.map((p) => ({ name: p.name }))}>
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">
        Aktivitas Operasi
      </p>
      {cf.rows.map((r) => (
        <ReportRowView key={r.code} indent label={r.name} minor={r.movementMinor} />
      ))}
      <ReportRowView bold label="Arus Kas Bersih dari Operasi" minor={cf.operatingMinor} />

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">
        Aktivitas Investasi
      </p>
      <ReportRowView indent label="Pengadaan Peralatan" minor={cf.investingMinor} />
      <ReportRowView bold label="Arus Kas Bersih dari Investasi" minor={cf.investingMinor} />

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">
        Aktivitas Pendanaan
      </p>
      <ReportRowView indent label="Setoran Modal dan Pinjaman Bersih" minor={cf.financingMinor} />
      <ReportRowView bold label="Arus Kas Bersih dari Pendanaan" minor={cf.financingMinor} />

      <div className="mt-4 rule-double pt-2">
        <ReportRowView bold label="Kenaikan (Penurunan) Netto Kas" minor={cf.netChangeMinor} />
      </div>
    </StatementShell>
  );
}
