import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/motion";
import { PlAccountTable } from "@/components/subsidiary/pl-account-table";
import { PlControls } from "@/components/subsidiary/pl-controls";
import { loadPlCards } from "../laba-rugi/pl-data";

export default async function KartuLabaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; mode?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const cumulative = sp.mode === "ytd";
  const data = await loadPlCards(ctx.orgId, sp.period, cumulative);

  const detailQuery = new URLSearchParams({ period: data.periodName });
  if (cumulative) detailQuery.set("mode", "ytd");
  const rangeLabel = cumulative
    ? `Kumulatif 1 Jan s.d. ${data.periodEndsOn}`
    : `Periode ${data.fromISO} s.d. ${data.periodEndsOn}`;

  return (
    <div className="space-y-4">
      <Link
        href="/buku-pembantu"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Laba"
        eyebrow="Rincian akun pendapatan usaha & lain-lain — mutasi periode, baris jurnal, dan saldo tiap akun"
      />
      <PlControls
        periodName={data.periodName}
        periodEndsOn={data.periodEndsOn}
        options={data.options}
        enableCumulative
      />
      <p className="text-xs text-ink-soft" role="status">
        {rangeLabel} · {data.movedRevenueCount} dari {data.revenueAccountCount} akun bermutasi · jumlah
        pendapatan{" "}
        <AnimatedNumber minor={data.totalRevenueMinor} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
      </p>
      {data.revenueSections.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-paper p-8 text-center text-xs text-ink-soft shadow-2xs">
          Belum ada akun pendapatan pada COA. Buka Pengaturan untuk melengkapi bagan akun.
        </div>
      ) : (
        <PlAccountTable
          sections={data.revenueSections}
          totalLabel="Jumlah Pendapatan"
          totalMinor={data.totalRevenueMinor}
          basePath="/buku-pembantu/laba-rugi"
          detailQuery={detailQuery.toString()}
          ariaLabel="Kartu akun pendapatan"
        />
      )}
    </div>
  );
}
