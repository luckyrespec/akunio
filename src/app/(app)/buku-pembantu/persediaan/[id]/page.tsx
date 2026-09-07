import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getItemCard } from "@/server/db/repos/subsidiary.repo";
import { stockStatus, formatQty, avgCost } from "@/core/subledger/cards";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { Reveal } from "@/components/motion";

interface ItemCardPageProps {
  params: Promise<{ id: string }>;
}

export default async function ItemCardPage({ params }: ItemCardPageProps) {
  const { id } = await params;
  const ctx = await requireContext();
  const card = await getItemCard(db, ctx.orgId, id);
  if (!card) notFound();

  const { item, rows } = card;
  const status = stockStatus(Number(item.currentQty), Number(item.minStockAlert ?? "0"));
  const curQty = Number(item.currentQty);
  const minQty = Number(item.minStockAlert ?? "0");
  const meterScale = Number.isFinite(curQty) && Number.isFinite(minQty) && minQty > 0
    ? Math.max(curQty, minQty * 1.5)
    : null;

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu/persediaan" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Kartu Persediaan</span>
      </Link>
      <PageHeader
        title={`Buku Pembantu — ${item.name}`}
        eyebrow={`Kode ${item.code} · Satuan ${item.unit} · Stok minimum ${formatQty(item.minStockAlert ?? "0")} ${item.unit}`}
      />

      <Reveal delay={0.05}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Status Stok</span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-canvas border border-rule text-terra">
                <Package className="size-4" />
              </span>
              <Badge variant={status === "AMAN" ? "outline" : status === "MENIPIS" ? "secondary" : "destructive"}>{status}</Badge>
            </div>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Saldo Unit</span>
            <p className="mt-1 font-mono text-base font-bold text-ink">{formatQty(item.currentQty)} {item.unit}</p>
            {meterScale !== null && (
              <div className="mt-2">
                <div className="relative h-1.5 rounded-full bg-canvas">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-terra"
                    style={{ width: `${Math.min(100, (curQty / meterScale) * 100)}%` }}
                  />
                  <div
                    className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-ink"
                    style={{ left: `${Math.min(100, (minQty / meterScale) * 100)}%` }}
                    title={`Minimum ${formatQty(item.minStockAlert ?? "0")}`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">{(curQty / minQty).toFixed(1)}× stok minimum</p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Harga Rata-rata</span>
            <p className="mt-1 font-mono text-base font-bold text-ink">{Money.formatIdr(item.averageCostMinor)}</p>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Saldo Nilai</span>
            <p className="mt-1 font-mono text-base font-bold text-ink">{Money.formatIdr(item.totalCostMinor)}</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="rounded-xl border border-rule overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left tnum">
              <thead>
                <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3 text-right" colSpan={2}>Masuk</th>
                  <th className="px-4 py-3 text-right" colSpan={2}>Keluar</th>
                  <th className="px-4 py-3 text-right" colSpan={3}>Saldo</th>
                </tr>
                <tr className="border-b border-rule bg-canvas/50 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-2" colSpan={3} />
                  <th className="px-4 py-2 text-right">Unit</th>
                  <th className="px-4 py-2 text-right">Harga</th>
                  <th className="px-4 py-2 text-right">Unit</th>
                  <th className="px-4 py-2 text-right">Harga</th>
                  <th className="px-4 py-2 text-right">Unit</th>
                  <th className="px-4 py-2 text-right">Harga</th>
                  <th className="px-4 py-2 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-ink-soft">
                      Belum ada mutasi untuk barang ini.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={`${r.date}-${i}`} data-testid="kartu-row" className="hover:bg-canvas/40 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">{r.date}</td>
                      <td className="px-4 py-2.5 text-ink max-w-60 truncate" title={r.desc}>{r.desc}</td>
                      <td className="px-4 py-2.5 font-mono text-ink-soft whitespace-nowrap">{r.ref}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.inQty !== "0" ? formatQty(r.inQty) : <span className="text-ink-soft/30">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.inQty !== "0" ? Money.formatIdr(r.unitCostMinor) : <span className="text-ink-soft/30">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.outQty !== "0" ? formatQty(r.outQty) : <span className="text-ink-soft/30">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.outQty !== "0" ? Money.formatIdr(r.unitCostMinor) : <span className="text-ink-soft/30">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatQty(r.resultingQty)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{Money.formatIdr(avgCost(r.resultingTotalCostMinor, r.resultingQty))}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">{Money.formatIdr(r.resultingTotalCostMinor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
