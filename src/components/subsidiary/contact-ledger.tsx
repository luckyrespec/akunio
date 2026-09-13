import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Money } from "@/core/money/money";
import type { ContactCardSummary } from "@/server/db/repos/subsidiary.repo";
import type { ContactLedgerEntry } from "@/core/subledger/cards";

export function ContactListTable({
  rows, basePath, emptyHint, isFiltering = false, clearHref,
}: {
  rows: ContactCardSummary[];
  basePath: string;
  emptyHint: string;
  isFiltering?: boolean;
  clearHref?: string;
}) {
  const totals = rows.reduce(
    (a, r) => ({
      invoiceCount: a.invoiceCount + r.invoiceCount,
      totalMinor: a.totalMinor + r.totalMinor,
      paidMinor: a.paidMinor + r.paidMinor,
      outstandingMinor: a.outstandingMinor + r.outstandingMinor,
    }),
    { invoiceCount: 0, totalMinor: 0n, paidMinor: 0n, outstandingMinor: 0n },
  );
  return (
    <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left tnum" aria-label="Daftar kartu kontak">
          <thead>
            <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3 text-right" title="Jumlah faktur/tagihan (tanpa yang void)">Faktur</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Dibayar</th>
              <th className="px-4 py-3 text-right">Sisa</th>
              <th className="px-4 py-3"><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-soft">
                  {isFiltering && clearHref ? (
                    <>
                      <p className="font-medium text-ink text-sm">Tidak ada hasil yang cocok</p>
                      <p className="mt-1 text-xs">
                        Coba kata kunci lain atau{" "}
                        <Link href={clearHref} className="font-semibold text-terra hover:underline">
                          hapus filter
                        </Link>
                        .
                      </p>
                    </>
                  ) : (
                    <>
                      <FileText className="mx-auto mb-2 size-8 text-ink-soft/40" />
                      <p className="text-xs">{emptyHint}</p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={r.id}
                  data-testid="kontak-row"
                  className="row-enter hover:bg-canvas/40 transition-colors"
                  style={{ "--row-i": i } as CSSProperties}
                >
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.invoiceCount}</td>
                  <td className="px-4 py-3 text-right font-mono">{Money.formatIdr(r.totalMinor)}</td>
                  <td className="px-4 py-3 text-right font-mono">{Money.formatIdr(r.paidMinor)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{Money.formatIdr(r.outstandingMinor)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`${basePath}/${r.id}`}
                      aria-label={`Buka kartu ${r.name}`}
                      className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-semibold text-terra hover:underline"
                    >
                      <span>Lihat kartu</span>
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
                <td className="px-4 py-3.5 text-right text-[11px] uppercase tracking-wider text-ink-soft">
                  Total
                </td>
                <td className="px-4 py-3.5 text-right font-mono">{totals.invoiceCount}</td>
                <td className="px-4 py-3.5 text-right font-mono">{Money.formatIdr(totals.totalMinor)}</td>
                <td className="px-4 py-3.5 text-right font-mono">{Money.formatIdr(totals.paidMinor)}</td>
                <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                  {Money.formatIdr(totals.outstandingMinor)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function ContactCardTable({ entries }: { entries: ContactLedgerEntry[] }) {
  const last = entries.at(-1);
  return (
    <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left tnum" aria-label="Kartu mutasi kontak">
          <thead>
            <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Keterangan</th>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Kredit</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/60">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-soft">
                  Belum ada mutasi untuk kontak ini.
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <tr
                  key={`${e.date}-${e.ref}-${i}`}
                  data-testid="kartu-row"
                  className="row-enter hover:bg-canvas/40 transition-colors"
                  style={{ "--row-i": i } as CSSProperties}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">{e.date}</td>
                  <td className="px-4 py-2.5 text-ink max-w-60 truncate" title={e.desc}>{e.desc}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-soft whitespace-nowrap">{e.ref || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {e.debitMinor > 0n
                      ? <span className="text-debit font-medium">{Money.formatIdr(e.debitMinor)}</span>
                      : <span className="text-ink-soft/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {e.creditMinor > 0n
                      ? <span className="text-ink font-medium">{Money.formatIdr(e.creditMinor)}</span>
                      : <span className="text-ink-soft/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">{Money.formatIdr(e.balanceMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
          {last && (
            <tfoot>
              <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
                <td colSpan={5} className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft">
                  Sisa Akhir
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                  {Money.formatIdr(last.balanceMinor)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
