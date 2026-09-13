import { eq } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
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
import { cn } from "@/lib/utils";

export default async function CalkPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; refresh?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const forceRefresh = sp.refresh === "1" || sp.refresh === "true";

  const data = await withOrg(ctx.orgId, async (tx) => {
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
        <section className="space-y-6">
          <ReportSectionHeader title="4. RINCIAN AKUN SIGNIFIKAN" />

          {/* Rincian Kas & Bank */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between border-b border-rule/70 pb-1.5">
              <h3 className="font-bold text-ink text-xs sm:text-sm">4.1 Kas dan Setara Kas</h3>
              <span className="text-[11px] font-medium text-ink-soft">Likuiditas Lancar</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              {data.narrative.accountNotes.cashAndBank}
            </p>

            <div className="rounded-xl border border-rule overflow-hidden bg-paper shadow-2xs">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-rule bg-canvas/40 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                <span>Rincian Akun Kas &amp; Bank</span>
                <span className="text-right">Saldo (Rupiah)</span>
              </div>
              <div className="divide-y divide-rule/40">
                {cashAccounts.length === 0 ? (
                  <p className="p-3.5 text-xs italic text-ink-soft">Tidak ada saldo kas dan setara kas tercatat pada tanggal ini.</p>
                ) : (
                  cashAccounts.map((r) => (
                    <div key={r.code} className="flex items-center justify-between px-3.5 py-2 text-xs hover:bg-canvas/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-soft">{r.code}</span>
                        <span className="text-ink font-medium">{r.name}</span>
                      </div>
                      <span className={cn(
                        "font-mono tabular-nums text-right font-medium tnum",
                        r.movementMinor < 0n ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-ink"
                      )}>
                        {Money.fromMinor(r.movementMinor).formatIdr()}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 border-t-2 border-ink/40 bg-canvas/30 text-xs font-bold text-ink">
                <span>Total Kas dan Setara Kas</span>
                <span className="font-mono tabular-nums text-right tnum">
                  {Money.fromMinor(cashAccounts.reduce((s, r) => s + r.movementMinor, 0n)).formatIdr()}
                </span>
              </div>
            </div>
          </div>

          {/* Rincian Aset Tetap */}
          <div className="space-y-3 pt-2">
            <div className="flex items-baseline justify-between border-b border-rule/70 pb-1.5">
              <h3 className="font-bold text-ink text-xs sm:text-sm">4.2 Aset Tetap dan Akumulasi Penyusutan</h3>
              <span className="text-[11px] font-medium text-ink-soft">Biaya Perolehan Historis</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              {data.narrative.accountNotes.fixedAssets}
            </p>

            <div className="rounded-xl border border-rule overflow-hidden bg-paper shadow-2xs">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-rule bg-canvas/40 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                <span>Rincian Akun Aset Tetap</span>
                <span className="text-right">Nilai Buku (Rupiah)</span>
              </div>
              <div className="divide-y divide-rule/40">
                {bs.fixedAssetRows.length === 0 ? (
                  <p className="p-3.5 text-xs italic text-ink-soft">Tidak ada aset tetap tercatat.</p>
                ) : (
                  bs.fixedAssetRows.map((r) => (
                    <div key={r.code} className="flex items-center justify-between px-3.5 py-2 text-xs hover:bg-canvas/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-soft">{r.code}</span>
                        <span className="text-ink font-medium">{r.name}</span>
                      </div>
                      <span className={cn(
                        "font-mono tabular-nums text-right font-medium tnum",
                        r.movementMinor < 0n ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-ink"
                      )}>
                        {Money.fromMinor(r.movementMinor).formatIdr()}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 border-t-2 border-ink/40 bg-canvas/30 text-xs font-bold text-ink">
                <span>Nilai Buku Aset Tetap Neto</span>
                <span className="font-mono tabular-nums text-right tnum">
                  {Money.fromMinor(bs.totalFixedAssetsMinor).formatIdr()}
                </span>
              </div>
            </div>
          </div>

          {/* Rincian Liabilitas */}
          <div className="space-y-3 pt-2">
            <div className="flex items-baseline justify-between border-b border-rule/70 pb-1.5">
              <h3 className="font-bold text-ink text-xs sm:text-sm">4.3 Liabilitas (Kewajiban)</h3>
              <span className="text-[11px] font-medium text-ink-soft">Kewajiban Berjalan &amp; Panjang</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              {data.narrative.accountNotes.liabilities}
            </p>

            <div className="rounded-xl border border-rule overflow-hidden bg-paper shadow-2xs">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-rule bg-canvas/40 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                <span>Rincian Akun Liabilitas</span>
                <span className="text-right">Saldo (Rupiah)</span>
              </div>
              <div className="divide-y divide-rule/40">
                {bs.shortTermLiabilityRows.length === 0 && bs.longTermLiabilityRows.length === 0 ? (
                  <p className="p-3.5 text-xs italic text-ink-soft">Entitas tidak memiliki saldo kewajiban pada tanggal ini.</p>
                ) : (
                  <>
                    {bs.shortTermLiabilityRows.map((r) => (
                      <div key={r.code} className="flex items-center justify-between px-3.5 py-2 text-xs hover:bg-canvas/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-ink-soft">{r.code}</span>
                          <span className="text-ink font-medium">{r.name}</span>
                        </div>
                        <span className={cn(
                          "font-mono tabular-nums text-right font-medium tnum",
                          r.movementMinor < 0n ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-ink"
                        )}>
                          {Money.fromMinor(r.movementMinor).formatIdr()}
                        </span>
                      </div>
                    ))}
                    {bs.longTermLiabilityRows.map((r) => (
                      <div key={r.code} className="flex items-center justify-between px-3.5 py-2 text-xs hover:bg-canvas/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-ink-soft">{r.code}</span>
                          <span className="text-ink font-medium">{r.name}</span>
                        </div>
                        <span className={cn(
                          "font-mono tabular-nums text-right font-medium tnum",
                          r.movementMinor < 0n ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-ink"
                        )}>
                          {Money.fromMinor(r.movementMinor).formatIdr()}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 border-t-2 border-ink/40 bg-canvas/30 text-xs font-bold text-ink">
                <span>Total Liabilitas</span>
                <span className="font-mono tabular-nums text-right tnum">
                  {Money.fromMinor(bs.totalLiabilitiesMinor).formatIdr()}
                </span>
              </div>
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
