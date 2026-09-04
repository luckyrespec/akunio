import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts, organizations } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import {
  changesInEquity, incomeStatement, movementByCode,
} from "@/core/reports/statements";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
} from "@/components/statement-parts";

export default async function PerubahanEkuitasPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;

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
    const lines = await postedLinesBetween(tx, ctx.orgId, period.startsOn, period.endsOn);
    return { org, profile, accRows, period, options, lines };
  });

  const entityName =
    data.profile?.businessName || data.org?.name || "Entitas Usaha Akunio";

  const metas = reportMetaMap(data.accRows);
  const periodAggs = aggregateFromLines(data.lines, metas);
  const is = incomeStatement(periodAggs);

  const cie = changesInEquity({
    openingRetainedEarningsMinor: 0n,
    contributionsMinor: movementByCode(periodAggs, "3100"),
    drawingsMinor: movementByCode(periodAggs, "3300"),
    netIncomeMinor: is.netIncomeMinor,
  });

  return (
    <StatementShell
      title="Laporan Perubahan Ekuitas"
      subtitle="Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <ReportSectionHeader title="REKONSILIASI EKUITAS PEMILIK" />
          <ReportRowView
            indent={1}
            label="Saldo Saldo Laba / Ekuitas Awal Periode"
            minor={0n}
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
              minor={cie.closingRetainedEarningsMinor + cie.rows.reduce((s, r) => r.label === "Modal Disetor" ? s + r.movementMinor : s, 0n)}
              variant="grand-total"
            />
          </div>
        </section>
      </div>
    </StatementShell>
  );
}
