import Link from "next/link";
import { Money } from "@/core/money/money";

export interface HistoryTableRow {
  entryId: string;
  entryDate: string;
  memo: string;
  number: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export function HistoryTable({ rows }: { rows: HistoryTableRow[] }) {
  let totalMasuk = 0n;
  let totalKeluar = 0n;
  for (const r of rows) {
    totalMasuk += r.debitMinor;
    totalKeluar += r.creditMinor;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Total masuk {Money.formatIdr(totalMasuk)} · Total keluar{" "}
        {Money.formatIdr(totalKeluar)}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-soft">
            <th className="py-2 pr-4 font-medium">Tanggal</th>
            <th className="py-2 pr-4 font-medium">Nomor</th>
            <th className="py-2 pr-4 font-medium">Keterangan</th>
            <th className="py-2 pr-4 font-medium text-right">Masuk</th>
            <th className="py-2 pr-4 font-medium text-right">Keluar</th>
            <th className="py-2 font-medium text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entryId} className="border-t border-rule">
              <td className="py-2 pr-4">{r.entryDate}</td>
              <td className="py-2 pr-4">
                <Link
                  href={`/jurnal/${r.entryId}`}
                  className="font-mono text-xs text-terra hover:underline"
                >
                  {r.number}
                </Link>
              </td>
              <td className="py-2 pr-4">{r.memo}</td>
              <td className="py-2 pr-4 text-right">
                {r.debitMinor > 0n ? Money.formatIdr(r.debitMinor) : "—"}
              </td>
              <td className="py-2 pr-4 text-right">
                {r.creditMinor > 0n ? Money.formatIdr(r.creditMinor) : "—"}
              </td>
              <td className="py-2 text-right">
                {Money.formatIdr(r.balanceMinor)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-rule">
              <td colSpan={6} className="py-6 text-center text-ink-soft">
                Tidak ada mutasi pada rentang ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
