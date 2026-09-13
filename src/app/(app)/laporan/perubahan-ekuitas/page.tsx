import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts, organizations } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { postedLinesBetween, postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import {
  changesInEquity, incomeStatement, movementByPrefix,
} from "@/core/reports/statements";
import { buildSakEmkmIncomeStatement } from "@/core/reports/sak-emkm";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
} from "@/components/statement-parts";

export default async function PerubahanEkuitasPage({
  searchParams,
}: { searchParams: Promise<{ period?: string; mode?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const cumulative = sp.mode === "ytd";

  const data = await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    const profile = await getProfile(tx, ctx.orgId);
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);

    // Tanggal sebelum rentang mulai untuk menghitung saldo awal ekuitas
    const fromISO = cumulative ? `${period.endsOn.slice(0, 4)}-01-01` : period.startsOn;
    const prevDate = new Date(new Date(fromISO).getTime() - 86400000).toISOString().slice(0, 10);
    const [priorLines, periodLines] = await Promise.all([
      postedLinesThrough(tx, ctx.orgId, prevDate),
      postedLinesBetween(tx, ctx.orgId, fromISO, period.endsOn),
    ]);

    return { org, profile, accRows, period, options, priorLines, periodLines };
  });

  const entityName =
    data.profile?.businessName || data.org?.name || "Entitas Usaha Akunio";

  const metas = reportMetaMap(data.accRows);
  
  // Saldo awal ekuitas sebelum periode berjalan
  const priorAggs = aggregateFromLines(data.priorLines, metas);
  const priorIS = buildSakEmkmIncomeStatement(priorAggs);
  const priorContributions = movementByPrefix(priorAggs, "31");
  const priorDrawings = movementByPrefix(priorAggs, "33");
  const priorRetained = movementByPrefix(priorAggs, "32");
  const openingEquityMinor = priorContributions - priorDrawings + priorRetained + priorIS.netIncomeMinor;

  // Mutasi ekuitas selama periode berjalan
  const periodAggs = aggregateFromLines(data.periodLines, metas);
  const is = incomeStatement(periodAggs);

  const cie = changesInEquity({
    openingRetainedEarningsMinor: 0n,
    contributionsMinor: movementByPrefix(periodAggs, "31"),
    drawingsMinor: movementByPrefix(periodAggs, "33"),
    netIncomeMinor: is.netIncomeMinor,
  });

  const endingEquityMinor = openingEquityMinor + cie.rows.reduce((s, r) => s + r.movementMinor, 0n);

  return (
    <StatementShell
      title="Laporan Perubahan Ekuitas"
      subtitle="Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
      enableCumulative
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <ReportSectionHeader title="REKONSILIASI EKUITAS PEMILIK" />
          <ReportRowView
            indent={1}
            label="Saldo Ekuitas Awal Periode"
            minor={openingEquityMinor}
          />
          {cie.rows.map((r) => (
            <ReportRowView
              key={r.label}
              indent={1}
              label={r.label}
              minor={r.movementMinor}
            />
          ))}
          <div className="pt-4">
            <ReportRowView
              bold
              isGrandTotal
              label="SALDO EKUITAS AKHIR PERIODE"
              minor={endingEquityMinor}
              variant="grand-total"
            />
          </div>
        </section>
      </div>
    </StatementShell>
  );
}
