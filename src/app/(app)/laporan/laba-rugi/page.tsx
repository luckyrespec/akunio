import { eq } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { requireContext } from "@/server/auth/guard";
import { accounts, organizations } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { postedLinesBetween, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { buildSakEmkmIncomeStatement } from "@/core/reports/sak-emkm";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
  ReportEmptyState,
} from "@/components/statement-parts";

export default async function LabaRugiPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; mode?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const cumulative = sp.mode === "ytd";

  const data = await withOrg(ctx.orgId, async (tx) => {
    const [org] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    const profile = await getProfile(tx, ctx.orgId);
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);
    const fromISO = cumulative ? `${period.endsOn.slice(0, 4)}-01-01` : period.startsOn;
    const lines = await postedLinesBetween(tx, ctx.orgId, fromISO, period.endsOn);
    return { org, profile, accRows, period, options, lines };
  });

  const entityName =
    data.profile?.businessName || data.org?.name || "Entitas Usaha Akunio";

  const metas = reportMetaMap(data.accRows);
  const idByCode = new Map(data.accRows.map((a) => [a.code, a.id]));
  const is = buildSakEmkmIncomeStatement(aggregateFromLines(data.lines, metas));

  const periodYear = data.period.endsOn.slice(0, 4);
  const shortMonth = new Intl.DateTimeFormat("id-ID", { month: "short" }).format(
    new Date(`${data.period.endsOn}T00:00:00`),
  );
  const periodLabel = cumulative ? `Jan–${shortMonth} ${periodYear}` : `${shortMonth} ${periodYear}`;

  const cardParams = new URLSearchParams({ period: data.period.name });
  if (cumulative) cardParams.set("mode", "ytd");
  const cardHref = (code: string) => {
    const id = idByCode.get(code);
    return id ? `/buku-pembantu/laba-rugi/${id}?${cardParams.toString()}` : undefined;
  };

  return (
    <StatementShell
      title="Laporan Laba Rugi"
      subtitle="Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
      enableCumulative
    >
      <div className="space-y-6">
        {/* 1. PENDAPATAN USAHA */}
        <section className="space-y-2">
          <ReportSectionHeader title="PENDAPATAN USAHA" />
          {is.revenueRows.length === 0 ? (
            <ReportEmptyState message="Tidak ada pendapatan usaha pada periode ini." actionHref="/faktur/baru?tipe=invoice" actionLabel="Buat Faktur Penjualan" />
          ) : (
            is.revenueRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
                href={cardHref(r.code)}
              />
            ))
          )}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Pendapatan Usaha"
            minor={is.totalRevenueMinor}
            variant="subtotal"
          />
        </section>

        {/* 2. BEBAN POKOK PENJUALAN / BEBAN USAHA LANGSUNG */}
        <section className="space-y-2">
          <ReportSectionHeader title="BEBAN POKOK PENJUALAN" />
          {is.cogsRows.length === 0 ? (
            <ReportEmptyState message="Tidak ada beban pokok penjualan tercatat." actionHref="/faktur/baru?tipe=bill" actionLabel="Catat Tagihan Pembelian" />
          ) : (
            is.cogsRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
                href={cardHref(r.code)}
              />
            ))
          )}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Beban Pokok Penjualan"
            minor={is.totalCogsMinor}
            variant="subtotal"
          />

          {/* LABA KOTOR */}
          <div className="pt-2">
            <ReportRowView
              bold
              label="LABA KOTOR"
              minor={is.grossProfitMinor}
              variant="subtotal"
            />
          </div>
        </section>

        {/* 3. BEBAN OPERASIONAL / UMUM & ADMINISTRASI */}
        <section className="space-y-2">
          <ReportSectionHeader title="BEBAN OPERASIONAL" />
          {is.operatingExpenseRows.length === 0 ? (
            <ReportEmptyState message="Tidak ada beban operasional pada periode ini." actionHref="/jurnal/baru" actionLabel="Catat Beban Operasional" />
          ) : (
            is.operatingExpenseRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
                href={cardHref(r.code)}
              />
            ))
          )}
          <ReportRowView
            bold
            isTotal
            label="Jumlah Beban Operasional"
            minor={is.totalOperatingExpenseMinor}
            variant="subtotal"
          />

          {/* LABA OPERASIONAL */}
          <div className="pt-2">
            <ReportRowView
              bold
              label="LABA OPERASIONAL"
              minor={is.operatingIncomeMinor}
              variant="subtotal"
            />
          </div>
        </section>

        {/* 4. PENDAPATAN & BEBAN LAIN-LAIN */}
        {(is.otherRevenueRows.length > 0 || is.otherExpenseRows.length > 0) && (
          <section className="space-y-2">
            <ReportSectionHeader title="PENDAPATAN &amp; BEBAN LAIN-LAIN" />
            {is.otherRevenueRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
                href={cardHref(r.code)}
              />
            ))}
            {is.otherExpenseRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={-r.movementMinor}
                href={cardHref(r.code)}
              />
            ))}
          </section>
        )}

        {/* 5. BEBAN PAJAK PENGHASILAN */}
        {is.taxExpenseRows.length > 0 && (
          <section className="space-y-2">
            <ReportSectionHeader title="BEBAN PAJAK" />
            {is.taxExpenseRows.map((r) => (
              <ReportRowView
                key={r.code}
                indent={1}
                code={r.code}
                label={r.name}
                minor={r.movementMinor}
                href={cardHref(r.code)}
              />
            ))}
            <ReportRowView
              bold
              isTotal
              label="Jumlah Beban Pajak"
              minor={is.totalTaxExpenseMinor}
              variant="subtotal"
            />
          </section>
        )}

        {/* 6. LABA (RUGI) BERSIH PERIODE TERPILIH */}
        <div className="pt-4">
          <ReportRowView
            bold
            isGrandTotal
            label={`LABA (RUGI) BERSIH — ${periodLabel}`}
            minor={is.netIncomeMinor}
            variant="grand-total"
          />
        </div>
      </div>
    </StatementShell>
  );
}
