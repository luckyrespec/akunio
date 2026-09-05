import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getTaxSettings, getTaxSummariesByYear } from "@/server/db/repos/tax.repo";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { TaxDashboard } from "@/components/tax/tax-dashboard";
import { PageHeader } from "@/components/page-header";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function PajakPage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const selectedYear = params.year ? parseInt(params.year, 10) || currentYear : currentYear;

  const { settings, summaries, bankAccounts } = await db.transaction(async (tx) => {
    const settings = await getTaxSettings(tx, ctx.orgId);
    const summaries = await getTaxSummariesByYear(tx, ctx.orgId, selectedYear);
    const allAccounts = await listAccounts(tx, ctx.orgId);
    const bankAccounts = allAccounts
      .filter((a) => (a.isCash || a.isBank || a.type === "ASET") && !a.archivedAt)
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
      }));

    return { settings, summaries, bankAccounts };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pajak & SPT Masa UMKM"
        eyebrow="Kepatuhan perpajakan otomatis berbasis PP No. 55 Tahun 2022 jo. UU HPP dan SAK EMKM Bab 15."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/laporan/calk?year=${selectedYear}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-xl border border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-2xs"
            >
              <span>Lampiran CALK</span>
            </Link>
            <Link
              href="/pengaturan?tab=pajak"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-xl bg-terra text-white hover:bg-terra/90 transition-colors shadow-2xs"
            >
              <span>Pengaturan Pajak</span>
            </Link>
          </div>
        }
      />

      <TaxDashboard
        settings={settings}
        summaries={summaries}
        bankAccounts={bankAccounts}
        currentYear={selectedYear}
        userRole={ctx.role}
      />
    </div>
  );
}
