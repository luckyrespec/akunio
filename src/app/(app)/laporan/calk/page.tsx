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
import { generateCalkNarrative } from "@/server/reports/calk-ai";
import { getTaxSettings, getTaxSummariesByYear, type TaxSummaryView } from "@/server/db/repos/tax.repo";
import { BUSINESS_TYPE_LABELS, type BusinessType } from "@/core/accounts/business-types";
import { Money } from "@/core/money/money";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
} from "@/components/statement-parts";
import { CalkActions } from "@/components/calk/calk-actions";

export default async function CalkPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; refresh?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const forceRefresh = sp.refresh === "1" || sp.refresh === "true";

  const data = await db.transaction(async (tx) => {
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    const profile = await getProfile(tx, ctx.orgId);
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);
    const lines = await postedLinesThrough(tx, ctx.orgId, period.endsOn);
    const narrative = await generateCalkNarrative(tx, ctx.orgId, period.endsOn, { forceRefresh });

    const year = parseInt(period.endsOn.slice(0, 4), 10);
    const taxSettings = await getTaxSettings(tx, ctx.orgId);
    const taxSummaries = await getTaxSummariesByYear(tx, ctx.orgId, year);

    return { org, profile, accRows, period, options, lines, narrative, taxSettings, taxSummaries };
  });

  const entityName =
    data.profile?.businessName || data.org?.name || "Entitas Usaha Akunio";
  const businessTypeLabel =
    data.profile?.businessType && BUSINESS_TYPE_LABELS[data.profile.businessType as BusinessType]
      ? BUSINESS_TYPE_LABELS[data.profile.businessType as BusinessType]
      : "Usaha Mikro, Kecil, dan Menengah (UMKM)";

  const metas = reportMetaMap(data.accRows);
  const aggs = aggregateFromLines(data.lines, metas);
  const is = buildSakEmkmIncomeStatement(aggs);
  const bs = buildSakEmkmBalanceSheet(aggs, is.netIncomeMinor);

  // Rincian kas & bank
  const cashAccounts = bs.currentAssetRows.filter((r) => {
    const m = metas.get(data.accRows.find((a) => a.code === r.code)?.id || "");
    return m?.isCash || m?.isBank || r.code.startsWith("11");
  });

  // Agregasi Pajak Tahun Berjalan
  const totalGrossRevenueMinor = data.taxSummaries.reduce(
    (acc: bigint, s: TaxSummaryView) => acc + s.grossRevenueMinor,
    0n
  );
  const taxableRevenueMinor = data.taxSummaries.reduce(
    (acc: bigint, s: TaxSummaryView) => acc + s.taxableRevenueMinor,
    0n
  );
  const taxDueMinor = data.taxSummaries.reduce(
    (acc: bigint, s: TaxSummaryView) => acc + s.taxDueMinor,
    0n
  );
  const taxPaidMinor = data.taxSummaries.reduce(
    (acc: bigint, s: TaxSummaryView) => acc + (s.status === "PAID" ? s.taxDueMinor : 0n),
    0n
  );
  const ntpnList = data.taxSummaries
    .map((s: TaxSummaryView) => s.ntpn)
    .filter((n: string | null): n is string => Boolean(n));

  return (
    <StatementShell
      title="Catatan Atas Laporan Keuangan (CALK)"
      subtitle="Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (Bab 14 & 15 SAK EMKM)"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
      isBalanced={bs.isBalanced}
      hideTableHeader={true}
      actions={<CalkActions periodName={data.period.name} />}
    >
      <div className="space-y-9 text-xs sm:text-sm text-ink leading-relaxed">
        {/* BAB 1: INFORMASI UMUM ENTITAS */}
        <section className="space-y-3.5">
          <ReportSectionHeader title="1. INFORMASI UMUM ENTITAS" />
          <p className="leading-relaxed text-ink/90 sm:text-justify">
            {data.narrative.generalInfo}
          </p>
          <div className="rounded-2xl border border-rule/90 bg-canvas/40 p-4 sm:p-5 space-y-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pb-2 border-b border-rule/50">
              <span className="text-ink-soft">Nama Entitas Usaha:</span>
              <span className="sm:col-span-2 font-bold text-ink">{entityName}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pb-2 border-b border-rule/50">
              <span className="text-ink-soft">Bidang Usaha:</span>
              <span className="sm:col-span-2 font-medium text-ink">{businessTypeLabel}</span>
            </div>
            {data.profile?.city && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pb-2 border-b border-rule/50">
                <span className="text-ink-soft">Domisili / Kota:</span>
                <span className="sm:col-span-2 font-medium text-ink">{data.profile.city}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <span className="text-ink-soft">Mata Uang Pelaporan:</span>
              <span className="sm:col-span-2 font-semibold text-ink">Rupiah (IDR)</span>
            </div>
          </div>
        </section>

        {/* BAB 2: DASAR PENYUSUNAN LAPORAN KEUANGAN */}
        <section className="space-y-3.5">
          <ReportSectionHeader title="2. DASAR PENYUSUNAN LAPORAN KEUANGAN" />
          <p className="leading-relaxed text-ink/90 sm:text-justify">
            {data.narrative.accountingBasis}
          </p>
        </section>

        {/* BAB 3: IKHTISAR KEBIJAKAN AKUNTANSI PENTING */}
        <section className="space-y-4">
          <ReportSectionHeader title="3. IKHTISAR KEBIJAKAN AKUNTANSI PENTING" />
          <div className="grid grid-cols-1 gap-3.5">
            <div className="p-3.5 rounded-xl border border-rule/70 bg-paper">
              <h3 className="font-bold text-ink text-xs sm:text-sm">a. Kas dan Setara Kas</h3>
              <p className="text-ink-soft mt-1 leading-relaxed text-xs">
                {data.narrative.policies.cash}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-rule/70 bg-paper">
              <h3 className="font-bold text-ink text-xs sm:text-sm">b. Piutang Usaha</h3>
              <p className="text-ink-soft mt-1 leading-relaxed text-xs">
                {data.narrative.policies.receivables}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-rule/70 bg-paper">
              <h3 className="font-bold text-ink text-xs sm:text-sm">c. Persediaan</h3>
              <p className="text-ink-soft mt-1 leading-relaxed text-xs">
                {data.narrative.policies.inventory}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-rule/70 bg-paper">
              <h3 className="font-bold text-ink text-xs sm:text-sm">d. Aset Tetap</h3>
              <p className="text-ink-soft mt-1 leading-relaxed text-xs">
                {data.narrative.policies.fixedAssets}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-rule/70 bg-paper">
              <h3 className="font-bold text-ink text-xs sm:text-sm">e. Pengakuan Pendapatan dan Beban</h3>
              <p className="text-ink-soft mt-1 leading-relaxed text-xs">
                {data.narrative.policies.revenueExpense}
              </p>
            </div>
          </div>
        </section>

        {/* BAB 4: RINCIAN AKUN SIGNIFIKAN */}
        <section className="space-y-5">
          <ReportSectionHeader title="4. RINCIAN AKUN SIGNIFIKAN" />

          {/* Rincian Kas & Bank */}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold text-ink text-xs sm:text-sm">4.1 Kas dan Setara Kas</h3>
              <span className="text-[11px] font-medium text-ink-soft">Likuiditas Lancar</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              {data.narrative.accountNotes.cashAndBank}
            </p>
            <div className="rounded-2xl border border-rule overflow-hidden bg-paper shadow-2xs">
              {cashAccounts.length === 0 ? (
                <p className="p-4 text-xs italic text-ink-soft">Tidak ada saldo kas dan bank.</p>
              ) : (
                cashAccounts.map((r) => (
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
                label="Total Kas dan Setara Kas"
                minor={cashAccounts.reduce((s, r) => s + r.movementMinor, 0n)}
                variant="subtotal"
              />
            </div>
          </div>

          {/* Rincian Aset Tetap */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold text-ink text-xs sm:text-sm">4.2 Aset Tetap dan Akumulasi Penyusutan</h3>
              <span className="text-[11px] font-medium text-ink-soft">Biaya Perolehan Historis</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              {data.narrative.accountNotes.fixedAssets}
            </p>
            <div className="rounded-2xl border border-rule overflow-hidden bg-paper shadow-2xs">
              {bs.fixedAssetRows.length === 0 ? (
                <p className="p-4 text-xs italic text-ink-soft">Tidak ada aset tetap tercatat.</p>
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
                label="Nilai Buku Aset Tetap Neto"
                minor={bs.totalFixedAssetsMinor}
                variant="subtotal"
              />
            </div>
          </div>

          {/* Rincian Liabilitas */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold text-ink text-xs sm:text-sm">4.3 Liabilitas (Kewajiban)</h3>
              <span className="text-[11px] font-medium text-ink-soft">Kewajiban Berjalan &amp; Panjang</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              {data.narrative.accountNotes.liabilities}
            </p>
            <div className="rounded-2xl border border-rule overflow-hidden bg-paper shadow-2xs">
              {bs.shortTermLiabilityRows.length === 0 && bs.longTermLiabilityRows.length === 0 ? (
                <p className="p-4 text-xs italic text-ink-soft">Entitas tidak memiliki saldo kewajiban pada tanggal ini.</p>
              ) : (
                <>
                  {bs.shortTermLiabilityRows.map((r) => (
                    <ReportRowView
                      key={r.code}
                      indent={1}
                      code={r.code}
                      label={r.name}
                      minor={r.movementMinor}
                    />
                  ))}
                  {bs.longTermLiabilityRows.map((r) => (
                    <ReportRowView
                      key={r.code}
                      indent={1}
                      code={r.code}
                      label={r.name}
                      minor={r.movementMinor}
                    />
                  ))}
                </>
              )}
              <ReportRowView
                bold
                isTotal
                label="Total Liabilitas"
                minor={bs.totalLiabilitiesMinor}
                variant="subtotal"
              />
            </div>
          </div>
        </section>

        {/* BAB 5: PAJAK PENGHASILAN (BAB 15 SAK EMKM & PP 55/2022) */}
        <section className="space-y-3.5 pt-2">
          <ReportSectionHeader title="5. PAJAK PENGHASILAN (SAK EMKM BAB 15 &amp; PP 55 TAHUN 2022)" />
          <p className="leading-relaxed text-ink/90 sm:text-justify">
            {data.narrative.incomeTaxNote}
          </p>

          <div className="rounded-2xl border border-rule overflow-hidden bg-paper shadow-2xs text-xs">
            <div className="flex items-center justify-between px-4 py-3 border-b border-rule/70 bg-canvas/50">
              <span className="text-ink-soft font-medium">Jenis Wajib Pajak:</span>
              <span className="font-bold text-ink">
                {data.taxSettings.taxpayerType === "INDIVIDUAL" ? "Orang Pribadi (Fasilitas Bebas s.d. Rp 500 Juta)" : "Badan Usaha (Tarif 0,5% Penuh)"}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule/50">
              <span className="text-ink-soft">Nomor Pokok Wajib Pajak (NPWP):</span>
              <span className="font-mono font-semibold text-ink">{data.taxSettings.npwp || "Belum Terdaftar"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule/50">
              <span className="text-ink-soft">Akumulasi Peredaran Bruto (Omzet Tahunan):</span>
              <span className="font-mono font-bold text-ink tnum">{Money.fromMinor(totalGrossRevenueMinor).formatIdr()}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule/50">
              <span className="text-ink-soft">Dasar Pengenaan Pajak (DPP):</span>
              <span className="font-mono font-medium text-ink tnum">{Money.fromMinor(taxableRevenueMinor).formatIdr()}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule/50">
              <span className="text-ink-soft">Beban PPh Final Terutang (Tarif 0,5%):</span>
              <span className="font-mono font-bold text-terra tnum">{Money.fromMinor(taxDueMinor).formatIdr()}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule/50">
              <span className="text-ink-soft">Realisasi Pembayaran Disetor:</span>
              <span className="font-mono font-bold text-debit tnum">
                {Money.fromMinor(taxPaidMinor).formatIdr()}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-canvas/30">
              <span className="text-ink-soft font-medium">Bukti Setor Resmi (NTPN):</span>
              <span className="font-mono font-bold text-ink">
                {ntpnList.length > 0 ? ntpnList.join(", ") : "Belum Ada Setoran"}
              </span>
            </div>
          </div>
        </section>
      </div>
    </StatementShell>
  );
}
