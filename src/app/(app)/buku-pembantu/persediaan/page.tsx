import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listItemCards } from "@/server/db/repos/subsidiary.repo";
import { stockStatus, formatQty } from "@/core/subledger/cards";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion";
import { Money } from "@/core/money/money";
import { FilterBar } from "@/components/subsidiary/filter-bar";

const STATUS_BADGE = {
  AMAN: "outline",
  MENIPIS: "secondary",
  HABIS: "destructive",
} as const;

const STATUS_OPTIONS = ["SEMUA", "AMAN", "MENIPIS", "HABIS"] as const;

export default async function PersediaanListPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; st?: string }>;
}) {
  const ctx = await requireContext();
  const items = await withOrg(ctx.orgId, (tx) => listItemCards(tx, ctx.orgId));
  const q = ((await searchParams)?.q ?? "").trim();
  const st = ((await searchParams)?.st ?? "SEMUA").toUpperCase();
  const activeSt = (STATUS_OPTIONS as readonly string[]).includes(st) ? st : "SEMUA";
  const ql = q.toLowerCase();
  const filtered = items.filter((it) => {
    if (ql && !`${it.code} ${it.name}`.toLowerCase().includes(ql)) return false;
    if (activeSt !== "SEMUA") {
      return stockStatus(Number(it.currentQty), Number(it.minStockAlert ?? "0")) === activeSt;
    }
    return true;
  });
  const isFiltering = q !== "" || activeSt !== "SEMUA";
  const totalNilai = filtered.reduce((a, it) => a + it.totalCostMinor, 0n);
  const hrefFor = (nextSt: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (nextSt !== "SEMUA") p.set("st", nextSt);
    const s = p.toString();
    return `/buku-pembantu/persediaan${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Persediaan"
        eyebrow="Saldo dan nilai tiap barang — klik untuk kartu mutasi per SKU"
      />
      <p className="text-xs text-ink-soft" role="status">
        {isFiltering ? `${filtered.length} dari ${items.length} barang` : `${items.length} barang`} · total nilai{" "}
        <AnimatedNumber minor={totalNilai} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
      </p>
      <FilterBar
        q={q}
        keepParams={activeSt !== "SEMUA" ? { st: activeSt } : {}}
        pills={STATUS_OPTIONS.map((s) => ({
          value: s,
          label: s === "SEMUA" ? "Semua" : s.charAt(0) + s.slice(1).toLowerCase(),
          href: hrefFor(s),
          active: s === activeSt,
        }))}
        searchPlaceholder="Cari kode atau nama barang…"
      />
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left tnum">
            <thead>
              <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Barang</th>
                <th className="px-4 py-3">Satuan</th>
                <th className="px-4 py-3 text-right">Saldo Unit</th>
                <th className="px-4 py-3 text-right">Harga Rata-rata</th>
                <th className="px-4 py-3 text-right">Saldo Nilai</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-ink-soft">
                    {isFiltering ? (
                      <>
                        <p className="font-medium text-ink text-sm">Tidak ada hasil yang cocok</p>
                        <p className="mt-1 text-xs">
                          Coba kata kunci lain atau{" "}
                          <Link href="/buku-pembantu/persediaan" className="font-semibold text-terra hover:underline">
                            hapus filter
                          </Link>
                          .
                        </p>
                      </>
                    ) : (
                      <>
                        <FileText className="mx-auto mb-2 size-8 text-ink-soft/40" />
                        <p className="text-xs">Belum ada barang. Tambahkan lewat Persediaan → Daftar Barang.</p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((it, i) => {
                  const status = stockStatus(Number(it.currentQty), Number(it.minStockAlert ?? "0"));
                  return (
                    <tr
                      key={it.id}
                      data-testid="persediaan-row"
                      className="row-enter hover:bg-canvas/40 transition-colors"
                      style={{ "--row-i": i } as CSSProperties}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-ink">{it.code}</td>
                      <td className="px-4 py-3 font-medium text-ink max-w-55 truncate" title={it.name}>{it.name}</td>
                      <td className="px-4 py-3 text-ink-soft">{it.unit}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatQty(it.currentQty)}</td>
                      <td className="px-4 py-3 text-right font-mono">{Money.formatIdr(it.averageCostMinor)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{Money.formatIdr(it.totalCostMinor)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/buku-pembantu/persediaan/${it.id}`}
                          aria-label={`Buka kartu ${it.code} ${it.name}`}
                          className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-semibold text-terra hover:underline"
                        >
                          <span>Lihat kartu</span>
                          <ChevronRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
                  <td colSpan={5} className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft">
                    Total Nilai Persediaan
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                    {Money.formatIdr(totalNilai)}
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
