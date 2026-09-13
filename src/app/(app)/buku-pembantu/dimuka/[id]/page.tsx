import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getPrepaidCard } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion";
import { MeterFill } from "@/components/subsidiary/animated";
import { Money } from "@/core/money/money";
import { PostAmortButton } from "../post-button";

export default async function DimukaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const card = await getPrepaidCard(db, ctx.orgId, id);
  if (!card) notFound();
  const { contract: c, lines } = card;
  const nextLine = lines.find((l) => l.status === "SCHEDULED");
  const pct = c.totalMinor > 0n ? Number((c.accumulatedMinor * 100n) / c.totalMinor) : 0;

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu/dimuka" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Kartu Dimuka</span>
      </Link>
      <PageHeader
        title={`${c.code} · ${c.name}`}
        eyebrow={c.vendor ? `Penerima: ${c.vendor} · Mulai ${c.startDate} · ${c.months} bulan` : `Mulai ${c.startDate} · ${c.months} bulan`}
        actions={nextLine ? <PostAmortButton contractId={c.id} periodName={nextLine.periodName} /> : undefined}
      />
      <div className="grid gap-3 rounded-xl border border-rule bg-paper p-4 shadow-2xs sm:grid-cols-3 text-xs tnum">
        <div>
          <p className="text-ink-soft">Total kontrak</p>
          <p className="mt-1 font-mono font-bold text-ink text-sm">{Money.formatIdr(c.totalMinor)}</p>
        </div>
        <div>
          <p className="text-ink-soft">Sudah diakui</p>
          <p className="mt-1 font-mono text-ink text-sm">{Money.formatIdr(c.accumulatedMinor)}</p>
        </div>
        <div>
          <p className="text-ink-soft">Sisa ({Math.min(pct, 100)}% diakui)</p>
          <AnimatedNumber
            minor={c.remainingMinor}
            className="mt-1 block font-display text-xl font-semibold tracking-tight text-ink tnum"
          />
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
            <MeterFill fill={Math.max(Math.min(pct, 100), 2)} title={`Terakui ${Math.min(pct, 100)}%`} />
          </div>
        </div>
      </div>
      {nextLine && (
        <p className="text-xs text-ink-soft">
          Jadwal berikutnya: <strong className="font-mono text-ink">{nextLine.periodName}</strong> sebesar{" "}
          <strong className="font-mono text-ink">{Money.formatIdr(nextLine.amountMinor)}</strong>.
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tnum">
            <thead className="border-b border-rule bg-canvas/80 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3 text-right">Akumulasi</th>
                <th className="px-4 py-3 text-right">Sisa</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Jurnal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 text-ink">
              {lines.map((l, i) => (
                <tr
                  key={l.id}
                  className="row-enter hover:bg-canvas/40 transition-colors"
                  style={{ "--row-i": i } as CSSProperties}
                >
                  <td className="px-4 py-3 font-mono font-semibold">{l.periodName}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{l.amortDate}</td>
                  <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(l.amountMinor)}</td>
                  <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(l.accumulatedMinor)}</td>
                  <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(l.remainingMinor)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={l.status === "POSTED"
                        ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                        : "border-rule text-ink-soft"}
                    >
                      {l.status === "POSTED" ? "Terposting" : "Terjadwal"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {l.journalEntryId ? (
                      <Link href={`/jurnal/${l.journalEntryId}`} className="focus-ring rounded-md font-medium text-terra hover:underline">
                        Lihat jurnal
                      </Link>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
                  <td colSpan={2} className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft">
                    Total kontrak
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(c.totalMinor)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(c.accumulatedMinor)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink tnum">
                    {Money.formatIdr(c.remainingMinor)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
