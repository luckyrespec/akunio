import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { loadPeriodOrDefault } from "@/server/reports/build";
import { AnimatedNumber } from "@/components/motion";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlControls } from "@/components/subsidiary/pl-controls";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KartuAkunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; mode?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const ctx = await requireContext();
  const sp = await searchParams;
  const cumulative = sp.mode === "ytd";

  const data = await db
    .transaction(async (tx) => {
      const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
      const options = await listPeriods(tx, ctx.orgId);
      const fromISO = cumulative ? `${period.endsOn.slice(0, 4)}-01-01` : period.startsOn;
      const ledger = await getLedger(tx, ctx.orgId, id, { from: fromISO, to: period.endsOn });
      return { period, options, ledger, fromISO };
    })
    .catch(() => null);

  if (!data) notFound();
  const { account, rows, openingMinor } = data.ledger;
  if (account.type !== "PENDAPATAN" && account.type !== "BEBAN") notFound();

  const isDebitNormal = account.normal === "D";
  const totalDebit = rows.reduce((a, r) => a + r.debitMinor, 0n);
  const totalCredit = rows.reduce((a, r) => a + r.creditMinor, 0n);
  const closingMinor = rows.at(-1)?.balanceMinor ?? openingMinor;
  const isRevenue = account.type === "PENDAPATAN";
  const HeadIcon = isRevenue ? TrendingUp : TrendingDown;
  const backHref = isRevenue ? "/buku-pembantu/laba" : "/buku-pembantu/beban";

  const backParams = new URLSearchParams({ period: data.period.name });
  if (cumulative) backParams.set("mode", "ytd");

  const rangeLabel = cumulative
    ? `Kumulatif 1 Jan s.d. ${data.period.endsOn}`
    : `Periode ${data.period.startsOn} s.d. ${data.period.endsOn}`;

  return (
    <div className="space-y-4">
      <Link
        href={`${backHref}?${backParams.toString()}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Kartu {isRevenue ? "Laba" : "Beban"}</span>
      </Link>
      <PageHeader
        title={`${account.code} · ${account.name}`}
        eyebrow="Kartu akun — rincian transaksi jurnal, saldo berjalan, dan saldo akhir periode"
        actions={
          <div className="flex items-center gap-2.5">
            <Link href={`/buku-besar/${account.id}`}>
              <Button
                variant="outline"
                size="sm"
                className="border-rule bg-paper hover:bg-canvas text-xs gap-1.5 shadow-2xs"
              >
                <BookOpen className="size-3.5 text-ink-soft" />
                <span>Semua Riwayat (Buku Besar)</span>
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <Badge variant="outline" className="gap-1">
          <HeadIcon className="size-3" />
          {account.type === "PENDAPATAN" ? "Pendapatan" : "Beban"}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Scale className="size-3" />
          Normal {isDebitNormal ? "Debit" : "Kredit"}
        </Badge>
        <span role="status">{rangeLabel}</span>
      </div>

      <PlControls
        periodName={data.period.name}
        periodEndsOn={data.period.endsOn}
        options={data.options}
        enableCumulative
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Saldo Awal</span>
          <p className="mt-1.5 font-mono text-base font-bold text-ink tnum">{Money.formatIdr(openingMinor)}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Total Debit</span>
          <p className="mt-1.5 font-mono text-base font-bold text-debit tnum">{Money.formatIdr(totalDebit)}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Total Kredit</span>
          <p className="mt-1.5 font-mono text-base font-bold text-ink tnum">{Money.formatIdr(totalCredit)}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Saldo Akhir</span>
          <AnimatedNumber
            minor={closingMinor}
            className={cn(
              "mt-1 block font-display text-xl font-semibold tracking-tight tnum",
              closingMinor < 0n ? "text-rose-600 dark:text-rose-400" : "text-ink",
            )}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left tnum" aria-label="Kartu transaksi akun">
            <thead>
              <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-3.5 py-3">No. Jurnal</th>
                <th className="px-4 py-3">Keterangan</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Kredit</th>
                <th className="px-4 py-3 text-right">Saldo Berjalan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-ink-soft">
                    <FileText className="mx-auto mb-2 size-8 text-ink-soft/40" />
                    <p className="font-display text-base font-medium text-ink">Belum ada mutasi periode ini</p>
                    <p className="mt-1 text-xs">
                      {openingMinor !== 0n
                        ? "Akun ini hanya membawa saldo awal tanpa transaksi baru pada rentang terpilih."
                        : "Tidak ada jurnal POSTED pada akun ini untuk rentang terpilih."}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={`${r.number}-${r.entryId}`}
                    data-testid="kartu-akun-row"
                    className="row-enter transition-colors hover:bg-canvas/40"
                    style={{ "--row-i": i } as CSSProperties}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{r.entryDate}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <Link href={`/jurnal/${r.entryId}`} className="focus-ring rounded-md font-mono font-bold text-terra hover:underline">
                        {r.number}
                      </Link>
                    </td>
                    <td className="max-w-sm truncate px-4 py-2.5 text-ink" title={r.memo}>
                      {r.memo || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {r.debitMinor > 0n ? (
                        <span className="font-medium text-debit">{Money.formatIdr(r.debitMinor)}</span>
                      ) : (
                        <span className="text-ink-soft/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {r.creditMinor > 0n ? (
                        Money.formatIdr(r.creditMinor)
                      ) : (
                        <span className="text-ink-soft/30">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono font-bold",
                        r.balanceMinor < 0n ? "text-rose-600 dark:text-rose-400" : "text-ink",
                      )}
                    >
                      {Money.formatIdr(r.balanceMinor)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
                  <td colSpan={3} className="px-4 py-3.5 text-right text-[11px] uppercase tracking-wider text-ink-soft">
                    Total &amp; Saldo Akhir
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-debit">{Money.formatIdr(totalDebit)}</td>
                  <td className="px-4 py-3.5 text-right font-mono">{Money.formatIdr(totalCredit)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                    {Money.formatIdr(closingMinor)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
