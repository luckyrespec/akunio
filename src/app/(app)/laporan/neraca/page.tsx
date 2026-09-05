import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts, organizations } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { buildSakEmkmBalanceSheet, buildSakEmkmIncomeStatement } from "@/core/reports/sak-emkm";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
  ReportEmptyState,
} from "@/components/statement-parts";

export default async function NeracaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
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
    const lines = await postedLinesThrough(tx, ctx.orgId, period.endsOn);
    return { org, profile, accRows, period, options, lines };
  });

  const entityName =
    data.profile?.businessName || data.org?.name || "Entitas Usaha Akunio";

  const metas = reportMetaMap(data.accRows);
  const aggs = aggregateFromLines(data.lines, metas);
  // Cumulative Net Income
  const is = buildSakEmkmIncomeStatement(aggs);
  const bs = buildSakEmkmBalanceSheet(aggs, is.netIncomeMinor);

  return (
    <StatementShell
      title="Laporan Posisi Keuangan"
      subtitle="Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
      isBalanced={bs.isBalanced}
    >
      {/* 1. BAGIAN ASET (AKTIVA) */}
      <section className="space-y-4">
        <ReportSectionHeader title="ASET" />

        {/* 1.A ASET LANCAR */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider pl-2">
            Aset Lancar
          </p>
          {bs.currentAssetRows.length === 0 ? (
            <ReportEmptyState message="Tidak ada saldo aset lancar tercatat." actionHref="/jurnal/baru" actionLabel="Catat Saldo Awal" />
          ) : (
            bs.currentAssetRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
              />
            ))
          )}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Aset Lancar"
            minor={bs.totalCurrentAssetsMinor}
            variant="subtotal"
          />
        </div>

        {/* 1.B ASET TIDAK LANCAR / ASET TETAP */}
        <div className="space-y-1.5 pt-3">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider pl-2">
            Aset Tidak Lancar (Aset Tetap)
          </p>
          {bs.fixedAssetRows.length === 0 ? (
            <ReportEmptyState message="Tidak ada saldo aset tidak lancar (aset tetap) tercatat." actionHref="/aset/baru" actionLabel="Tambah Aset" />
          ) : (
            bs.fixedAssetRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
              />
            ))
          )}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Aset Tidak Lancar"
            minor={bs.totalFixedAssetsMinor}
            variant="subtotal"
          />
        </div>

        {/* TOTAL ASET */}
        <div className="pt-2">
          <ReportRowView
            bold
            isGrandTotal
            label="JUMLAH ASET"
            minor={bs.totalAssetsMinor}
            variant="grand-total"
          />
        </div>
      </section>

      {/* 2. BAGIAN LIABILITAS & EKUITAS (PASIVA) */}
      <section className="space-y-4 pt-6">
        <ReportSectionHeader title="LIABILITAS DAN EKUITAS" />

        {/* 2.A LIABILITAS JANGKA PENDEK */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider pl-2">
            Liabilitas Jangka Pendek
          </p>
          {bs.shortTermLiabilityRows.length === 0 ? (
            <ReportEmptyState message="Tidak ada saldo liabilitas jangka pendek (utang usaha) tercatat." actionHref="/jurnal/baru" actionLabel="Catat Liabilitas" />
          ) : (
            bs.shortTermLiabilityRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
              />
            ))
          )}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Liabilitas Jangka Pendek"
            minor={bs.totalShortTermLiabilitiesMinor}
            variant="subtotal"
          />
        </div>

        {/* 2.B LIABILITAS JANGKA PANJANG */}
        {bs.longTermLiabilityRows.length > 0 && (
          <div className="space-y-1.5 pt-3">
            <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider pl-2">
              Liabilitas Jangka Panjang
            </p>
            {bs.longTermLiabilityRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
              />
            ))}
            <ReportRowView
              bold
              isTotal
              label="Jumlah Liabilitas Jangka Panjang"
              minor={bs.totalLongTermLiabilitiesMinor}
              variant="subtotal"
            />
          </div>
        )}

        {/* JUMLAH LIABILITAS */}
        <div className="pt-1">
          <ReportRowView
            bold
            label="Jumlah Liabilitas"
            minor={bs.totalLiabilitiesMinor}
            variant="subtotal"
          />
        </div>

        {/* 2.C EKUITAS */}
        <div className="space-y-1.5 pt-4">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider pl-2">
            Ekuitas
          </p>
          {bs.equityRows.map((r) => (
            <ReportRowView
              key={r.code}
              indent={1}
              code={r.code}
              label={r.name}
              minor={r.movementMinor}
            />
          ))}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Ekuitas"
            minor={bs.totalEquityMinor}
            variant="subtotal"
          />
        </div>

        {/* TOTAL LIABILITAS DAN EKUITAS */}
        <div className="pt-2">
          <ReportRowView
            bold
            isGrandTotal
            label="JUMLAH LIABILITAS DAN EKUITAS"
            minor={bs.totalLiabilitiesAndEquityMinor}
            variant="grand-total"
          />
        </div>
      </section>
    </StatementShell>
  );
}
