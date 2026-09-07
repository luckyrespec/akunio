import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
  return (
    <div className="rounded-xl border border-rule overflow-hidden">
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
                    emptyHint
                  )}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} data-testid="kontak-row" className="hover:bg-canvas/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.invoiceCount}</td>
                  <td className="px-4 py-3 text-right font-mono">{Money.formatIdr(r.totalMinor)}</td>
                  <td className="px-4 py-3 text-right font-mono">{Money.formatIdr(r.paidMinor)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{Money.formatIdr(r.outstandingMinor)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`${basePath}/${r.id}`}
                      aria-label={`Buka kartu ${r.name}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
                    >
                      <span>Lihat kartu</span>
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContactCardTable({ entries }: { entries: ContactLedgerEntry[] }) {
  const last = entries.at(-1);
  return (
    <div className="rounded-xl border border-rule overflow-hidden">
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
                <tr key={`${e.date}-${e.ref}-${i}`} data-testid="kartu-row" className="hover:bg-canvas/40 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">{e.date}</td>
                  <td className="px-4 py-2.5 text-ink max-w-60 truncate" title={e.desc}>{e.desc}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-soft whitespace-nowrap">{e.ref || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {e.debitMinor > 0n
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{Money.formatIdr(e.debitMinor)}</span>
                      : <span className="text-ink-soft/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {e.creditMinor > 0n
                      ? <span className="text-terra font-medium">{Money.formatIdr(e.creditMinor)}</span>
                      : <span className="text-ink-soft/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">{Money.formatIdr(e.balanceMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
          {last && (
            <tfoot>
              <tr className="border-t-2 border-rule bg-canvas/70 font-semibold">
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
