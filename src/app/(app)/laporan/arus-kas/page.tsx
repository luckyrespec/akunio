import { eq } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { requireContext } from "@/server/auth/guard";
import { organizations } from "@/server/db/schema/org";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { loadPeriodOrDefault } from "@/server/reports/build";
import { buildCashFlow } from "@/server/reports/cash-flow";
import {
  StatementShell,
  ReportRowView,
  ReportSectionHeader,
} from "@/components/statement-parts";

export default async function ArusKasPage({
  searchParams,
}: { searchParams: Promise<{ period?: string; mode?: string }> }) {
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
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);
    const fromISO = cumulative ? `${period.endsOn.slice(0, 4)}-01-01` : period.startsOn;
    // Komposisi via helper bersama @/server/reports/cash-flow (dipakai juga
    // test D4) — halaman tidak memodel ulang bucket prefix.
    const cf = await buildCashFlow(tx, ctx.orgId, fromISO, period.endsOn);
    return { org, profile, period, options, cf };
  });

  const entityName =
    data.profile?.businessName || data.org?.name || "Entitas Usaha Akunio";

  const cf = data.cf;

  return (
    <StatementShell
      title="Laporan Arus Kas"
      subtitle="Metode Tidak Langsung · Sesuai Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah"
      entityName={entityName}
      periodName={data.period.name}
      options={data.options.map((p) => ({ name: p.name }))}
      periodDateRange={{ startsOn: data.period.startsOn, endsOn: data.period.endsOn }}
      enableCumulative
    >
      <div className="space-y-6">
        {/* 1. AKTIVITAS OPERASI */}
        <section className="space-y-2">
          <ReportSectionHeader title="ARUS KAS DARI AKTIVITAS OPERASI" />
          {cf.rows.map((r) => {
            const tooltips: Record<string, string> = {
              "NI": "Laba atau rugi bersih dari Laporan Laba Rugi periode berjalan sebagai titik awal rekonsiliasi.",
              "ADJ.PIUTANG": "Kenaikan piutang mengurangi kas (karena penjualan belum diterima tunai), sedangkan penurunan piutang menambah kas.",
              "ADJ.PERSEDIAAN": "Kenaikan persediaan mengurangi kas (dana terikat pada stok belanja barang), sedangkan penurunan persediaan menambah kas.",
              "ADJ.DIMUKA": "Kenaikan beban dibayar di muka mengurangi kas (dana keluar sebelum beban diakui), sedangkan amortisasi menambah kembali kas operasi.",
              "ADJ.UTANG": "Kenaikan utang usaha menahan kas keluar (pembayaran ke pemasok ditangguhkan), sehingga diperlakukan sebagai penambah kas.",
              "ADJ.UTANGPAJAK": "Kenaikan utang pajak menahan kas keluar (pajak terutang belum dibayar), sehingga diperlakukan sebagai penambah kas operasi.",
              "ADJ.PENYUSUTAN": "Penyusutan merupakan beban non-kas sehingga ditambahkan kembali ke laba bersih.",
            };
            return (
              <ReportRowView
                key={r.code}
                indent={1}
                label={r.name}
                minor={r.movementMinor}
                tooltip={tooltips[r.code]}
              />
            );
          })}
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
          <ReportRowView
            indent={1}
            label="Perolehan / Pengadaan Aset Tetap"
            minor={cf.investingMinor}
            tooltip="Arus kas keluar untuk belanja modal aset fisik (peralatan, mesin, kendaraan) atau penerimaan dari pelepasan aset."
          />
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
          <ReportRowView
            indent={1}
            label="Setoran Modal & Pinjaman Bersih"
            minor={cf.financingMinor}
            tooltip="Penerimaan dari penambahan modal pemilik, pencairan pinjaman bank, dikurangi penarikan prive pemilik."
          />
          <ReportRowView
            bold
            isTotal
            label="Arus Kas Bersih yang Diperoleh dari Aktivitas Pendanaan"
            minor={cf.financingMinor}
            variant="subtotal"
          />
        </section>

        {cf.pajakMinor !== 0n && (
          <section className="space-y-2">
            <ReportSectionHeader title="KETERBUKAAN PAJAK DIBAYAR" />
            <ReportRowView
              indent={1}
              label="Pajak Penghasilan Dibayar (kas)"
              minor={cf.pajakMinor}
              tooltip="Kas neto untuk pajak dengan metode tidak langsung: perubahan utang pajak (23xx) dikurangi beban pajak (57xx). Bukan penambah total — sudah tercakup di aktivitas operasi."
            />
          </section>
        )}

        {cf.residualMinor !== 0n && (
          <section className="space-y-2">
            <ReportSectionHeader title="PENYESUAIAN KAS LAINNYA" />
            <ReportRowView
              indent={1}
              label="Mutasi kas lainnya (unmapped)"
              minor={cf.residualMinor}
              tooltip="Selisih mutasi kas yang belum terpetakan ke kategori operasi, investasi, atau pendanaan. Bila material (lebih dari 1% delta kas), Doctor mencatat temuan untuk ditelaah."
            />
          </section>
        )}

        {/* KENAIKAN / PENURUNAN NETTO KAS */}
        <div className="pt-4">
          <ReportRowView
            bold
            isGrandTotal
            label="KENAIKAN (PENURUNAN) NETTO KAS DAN SETARA KAS"
            minor={cf.netChangeTiedMinor}
            variant="grand-total"
          />
        </div>
      </div>
    </StatementShell>
  );
}
