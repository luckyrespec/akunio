import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts, organizations } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import {
  cashFlowIndirect, incomeStatement, movementByCode,
} from "@/core/reports/statements";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
} from "@/components/statement-parts";

export default async function ArusKasPage({
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

  const deltaKasMinor = periodAggs
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((sum, a) => sum + signed(a.meta, a), 0n);
  const lainLainMinor =
    deltaKasMinor - cf.operatingMinor - cf.investingMinor - cf.financingMinor;
  const netChangeTiedMinor =
    cf.operatingMinor + cf.investingMinor + cf.financingMinor + lainLainMinor;

  return (
    <StatementShell
      title="Laporan Arus Kas"
      subtitle="Metode Tidak Langsung · Sesuai Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
    >
      <div className="space-y-6">
        {/* 1. AKTIVITAS OPERASI */}
        <section className="space-y-2">
          <ReportSectionHeader title="ARUS KAS DARI AKTIVITAS OPERASI" />
          {cf.rows.map((r) => (
            <ReportRowView key={r.code} indent={1} label={r.name} minor={r.movementMinor} />
          ))}
          <ReportRowView
            bold
            isTotal
            label="Arus Kas Bersih yang Diperoleh dari Aktivitas Operasi"
            minor={cf.operatingMinor}
            variant="subtotal"
          />
        </section>

        {/* 2. AKTIVITAS INVESTASI */}
        <section className="space-y-2">
          <ReportSectionHeader title="ARUS KAS DARI AKTIVITAS INVESTASI" />
          <ReportRowView indent={1} label="Perolehan / Pengadaan Aset Tetap" minor={cf.investingMinor} />
          <ReportRowView
            bold
            isTotal
            label="Arus Kas Bersih yang Digunakan untuk Aktivitas Investasi"
            minor={cf.investingMinor}
            variant="subtotal"
          />
        </section>

        {/* 3. AKTIVITAS PENDANAAN */}
        <section className="space-y-2">
          <ReportSectionHeader title="ARUS KAS DARI AKTIVITAS PENDANAAN" />
          <ReportRowView indent={1} label="Setoran Modal &amp; Pinjaman Bersih" minor={cf.financingMinor} />
          <ReportRowView
            bold
            isTotal
            label="Arus Kas Bersih yang Diperoleh dari Aktivitas Pendanaan"
            minor={cf.financingMinor}
            variant="subtotal"
          />
        </section>

        {lainLainMinor !== 0n && (
          <section className="space-y-2">
            <ReportSectionHeader title="PENYESUAIAN KAS LAINNYA" />
            <ReportRowView indent={1} label="Penyesuaian Mutasi Kas Lainnya" minor={lainLainMinor} />
          </section>
        )}

        {/* KENAIKAN / PENURUNAN NETTO KAS */}
        <div className="pt-4">
          <ReportRowView
            bold
            isGrandTotal
            label="KENAIKAN (PENURUNAN) NETTO KAS DAN SETARA KAS"
            minor={netChangeTiedMinor}
            variant="grand-total"
          />
        </div>
      </div>
    </StatementShell>
  );
}
