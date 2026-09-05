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
import { BUSINESS_TYPE_LABELS, type BusinessType } from "@/core/accounts/business-types";
import { Money } from "@/core/money/money";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
} from "@/components/statement-parts";

export default async function CalkPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;

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
    return { org, profile, accRows, period, options, lines };
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

  return (
    <StatementShell
      title="Catatan Atas Laporan Keuangan (CALK)"
      subtitle="Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (Bab 14 SAK EMKM)"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
      isBalanced={bs.isBalanced}
      hideTableHeader={true}
    >
      <div className="space-y-8 text-xs sm:text-sm text-ink leading-relaxed">
        {/* BAB 1: INFORMASI UMUM ENTITAS */}
        <section className="space-y-3">
          <ReportSectionHeader title="1. INFORMASI UMUM ENTITAS" />
          <p>
            <strong>{entityName}</strong> (&ldquo;Entitas&rdquo;) didirikan di Indonesia dan bergerak dalam bidang kegiatan usaha <strong>{businessTypeLabel}</strong>.
          </p>
          <div className="rounded-xl border border-rule bg-canvas/40 p-4 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-ink-soft">Nama Entitas Usaha:</span>
              <span className="sm:col-span-2 font-medium text-ink">{entityName}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-ink-soft">Bidang Usaha:</span>
              <span className="sm:col-span-2 font-medium text-ink">{businessTypeLabel}</span>
            </div>
            {data.profile?.city && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                <span className="text-ink-soft">Domisili / Kota:</span>
                <span className="sm:col-span-2 font-medium text-ink">{data.profile.city}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-ink-soft">Mata Uang Pelaporan:</span>
              <span className="sm:col-span-2 font-medium text-ink">Rupiah (IDR)</span>
            </div>
          </div>
        </section>

        {/* BAB 2: DASAR PENYUSUNAN LAPORAN KEUANGAN */}
        <section className="space-y-3">
          <ReportSectionHeader title="2. DASAR PENYUSUNAN LAPORAN KEUANGAN" />
          <p>
            Laporan keuangan Entitas disusun dan disajikan sesuai dengan <strong>Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)</strong> yang diterbitkan oleh Dewan Standar Akuntansi Keuangan Ikatan Akuntan Indonesia (DSAK IAI).
          </p>
          <p>
            Dasar pengukuran dalam penyusunan laporan keuangan adalah <em>biaya historis (historical cost)</em>. Penyusunan laporan keuangan disusun menggunakan dasar akrual, kecuali untuk laporan arus kas.
          </p>
        </section>

        {/* BAB 3: IKHTISAR KEBIJAKAN AKUNTANSI PENTING */}
        <section className="space-y-3">
          <ReportSectionHeader title="3. IKHTISAR KEBIJAKAN AKUNTANSI PENTING" />
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-ink">a. Kas dan Setara Kas</h3>
              <p className="text-ink-soft mt-0.5">
                Kas dan setara kas mencakup kas tunai di brankas/kasir dan saldo rekening giro atau tabungan pada bank yang dapat segera ditarik tanpa batasan.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-ink">b. Piutang Usaha</h3>
              <p className="text-ink-soft mt-0.5">
                Piutang usaha dicatat sebesar jumlah tagihan neto yang diharapkan dapat ditagih sesuai dengan bukti faktur penjualan barang atau penyerahan jasa kepada pelanggan.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-ink">c. Persediaan</h3>
              <p className="text-ink-soft mt-0.5">
                Persediaan diukur berdasarkan biaya perolehan dengan metode FIFO (First-In, First-Out) atau rata-rata tertimbang (weighted average), mencakup harga pembelian dan biaya perolehan terkait.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-ink">d. Aset Tetap</h3>
              <p className="text-ink-soft mt-0.5">
                Aset tetap diakui sebesar biaya perolehan dikurangi akumulasi penyusutan. Penyusutan dihitung dengan metode garis lurus (straight-line method) selama masa manfaat ekonomis aset.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-ink">e. Pengakuan Pendapatan dan Beban</h3>
              <p className="text-ink-soft mt-0.5">
                Pendapatan dari penjualan barang atau jasa diakui ketika hak dan manfaat signifikan telah berpindah kepada pelanggan. Beban diakui pada saat terjadinya transaksi (basis akrual).
              </p>
            </div>
          </div>
        </section>

        {/* BAB 4: RINCIAN AKUN SIGNIFIKAN */}
        <section className="space-y-4">
          <ReportSectionHeader title="4. RINCIAN AKUN SIGNIFIKAN" />

          {/* Rincian Kas & Bank */}
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">4.1 Kas dan Setara Kas</h3>
            <p className="text-xs text-ink-soft">
              Rincian saldo kas dan simpanan pada bank pada tanggal pelaporan adalah sebagai berikut:
            </p>
            <div className="rounded-xl border border-rule overflow-hidden bg-paper">
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
          <div className="space-y-2 pt-3">
            <h3 className="font-semibold text-ink">4.2 Aset Tetap dan Akumulasi Penyusutan</h3>
            <div className="rounded-xl border border-rule overflow-hidden bg-paper">
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
          <div className="space-y-2 pt-3">
            <h3 className="font-semibold text-ink">4.3 Liabilitas (Kewajiban)</h3>
            <div className="rounded-xl border border-rule overflow-hidden bg-paper">
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
      </div>
    </StatementShell>
  );
}
