import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";

export interface StockTx {
  id: string;
  date: string;
  type: string;
  memo: string | null;
  qty: string;
  unitCostMinor: bigint;
  totalCostMinor: bigint;
  resultingQty: string;
}

/** Tabel Kartu Stok (mutasi barang) — isi section sidebar "Kartu Stok". */
export function ItemStockHistory({
  transactions,
  unit,
}: {
  transactions: StockTx[];
  unit: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-xs">
      <div className="flex items-center justify-between border-b border-rule p-4">
        <h2 className="font-display text-base font-semibold text-ink">Kartu Stok</h2>
        <span className="text-xs text-ink-soft">{transactions.length} mutasi tercatat</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-rule bg-canvas/50 font-mono text-xs uppercase tracking-wider text-ink-soft">
            <tr>
              <th className="py-2.5 px-4">Tanggal</th>
              <th className="py-2.5 px-4">Tipe</th>
              <th className="py-2.5 px-4">Keterangan</th>
              <th className="py-2.5 px-4 text-right">Kuantitas</th>
              <th className="py-2.5 px-4 text-right">Biaya/Unit</th>
              <th className="py-2.5 px-4 text-right">Total Mutasi</th>
              <th className="py-2.5 px-4 text-right">Saldo Akhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/60">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-ink-soft">
                  Belum ada riwayat mutasi kartu stok untuk barang ini.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="transition-colors hover:bg-canvas/40">
                  <td className="py-2.5 px-4 font-mono text-xs">{tx.date}</td>
                  <td className="py-2.5 px-4">
                    <Badge
                      variant={tx.type === "IN" ? "default" : tx.type === "OUT" ? "destructive" : "outline"}
                      className="font-mono text-xs"
                    >
                      {tx.type}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 text-ink-soft">{tx.memo || "-"}</td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {tx.type === "OUT" ? `-${tx.qty}` : `+${tx.qty}`}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-ink-soft">
                    {Money.fromMinor(tx.unitCostMinor).formatIdr()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-medium">
                    {Money.fromMinor(tx.totalCostMinor).formatIdr()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-ink">
                    {tx.resultingQty} {unit}
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
