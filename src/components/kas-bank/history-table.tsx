import Link from "next/link";
import { Money } from "@/core/money/money";
import { ScrollText } from "lucide-react";

export interface HistoryTableRow {
  entryId: string;
  entryDate: string;
  memo: string;
  number: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export function HistoryTable({
  lede,
  rows,
}: {
  lede: string;
  rows: HistoryTableRow[];
}) {
  let totalMasuk = 0n;
  let totalKeluar = 0n;
  for (const r of rows) {
    totalMasuk += r.debitMinor;
    totalKeluar += r.creditMinor;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft tnum">
        {lede} · Masuk {Money.formatIdr(totalMasuk)} · Keluar{" "}
        {Money.formatIdr(totalKeluar)}
      </p>
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText className="size-8 mx-auto mb-3 text-ink-soft/40" />
            <p className="text-sm font-medium text-ink">
              Tidak ada mutasi pada rentang ini
            </p>
            <p className="mt-1 text-xs text-ink-soft max-w-md mx-auto">
              Coba rentang tanggal yang lebih lebar, atau catat transaksi dulu
              di Pembayaran, Penerimaan, atau Transfer.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <thead className="border-b border-rule bg-canvas/50 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Nomor Bukti</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3 text-right">Masuk</th>
                  <th className="px-4 py-3 text-right">Keluar</th>
                  <th className="px-4 py-3 text-right">Saldo Berjalan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr
                    key={r.entryId}
                    className="hover:bg-canvas/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                      {r.entryDate}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <Link
                        href={`/jurnal/${r.entryId}`}
                        className="text-terra hover:underline underline-offset-2"
                      >
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{r.memo}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink whitespace-nowrap">
                      {r.debitMinor > 0n ? Money.formatIdr(r.debitMinor) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink whitespace-nowrap">
                      {r.creditMinor > 0n
                        ? Money.formatIdr(r.creditMinor)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink whitespace-nowrap">
                      {Money.formatIdr(r.balanceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
