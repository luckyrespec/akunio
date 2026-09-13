import { Package } from "lucide-react";
import { Money } from "@/core/money/money";

export interface CostHistoryPoint {
  id: string;
  date: string;
  referenceType: "PURCHASE" | "OPENING_BALANCE" | "ADJUSTMENT";
  initialQty: string;
  unitCostMinor: bigint;
}

const SOURCE_LABEL: Record<CostHistoryPoint["referenceType"], string> = {
  OPENING_BALANCE: "Saldo Awal",
  PURCHASE: "Pembelian",
  ADJUSTMENT: "Penyesuaian",
};

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Riwayat harga modal dari lapis masuk + chart batang CSS murni.
 *  Yang di-chart adalah harga beli per barang masuk; rata-rata historis
 *  tidak direkonstruksi — rata-rata saat ini tampil sebagai acuan. */
export function ItemCostHistory({
  history,
  unit,
  averageCostMinor,
}: {
  history: CostHistoryPoint[];
  unit: string;
  averageCostMinor: bigint;
}) {
  if (history.length === 0) {
    return (
      <div className="py-8 text-center text-[var(--color-ink-muted)]">
        <Package className="size-8 mx-auto text-[var(--color-ink-muted)]/40 mb-2" />
        <p className="font-serif text-base text-[var(--color-tinta)] font-medium">
          Belum ada riwayat harga
        </p>
        <p className="text-xs mt-1">
          Harga modal tercatat setiap ada barang masuk (saldo awal, pembelian, penyesuaian).
        </p>
      </div>
    );
  }

  const points = history.slice(-20);
  const max = points.reduce((m, p) => (p.unitCostMinor > m ? p.unitCostMinor : m), 0n);

  return (
    <div className="space-y-5">
      <div>
        <div
          className="mt-1 flex h-40 items-stretch gap-2"
          role="img"
          aria-label={`Riwayat harga modal per ${unit}: ${points.map((p) => `${shortDate(p.date)} ${Money.fromMinor(p.unitCostMinor).formatIdr()}`).join(", ")}`}
        >
          {points.map((p, i) => {
            const pct = max > 0n ? Number((p.unitCostMinor * 100n) / max) : 0;
            const latest = i === points.length - 1;
            return (
              <div key={p.id} className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div
                    title={`${shortDate(p.date)} · ${SOURCE_LABEL[p.referenceType]} · ${Money.fromMinor(p.unitCostMinor).formatIdr()}/${unit}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    className={`w-full rounded-t-md ${latest ? "bg-terra" : "bg-ink/40"}`}
                  />
                </div>
                <span className="tnum mt-1.5 text-[10px] text-[var(--color-ink-muted)]">{shortDate(p.date)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">
          Batang = harga beli per barang masuk (maks 20 terakhir, batang{" "}
          <span className="font-semibold text-terra">terra</span> = terbaru). Rata-rata saat ini{" "}
          <strong className="tnum text-[var(--color-tinta)]">
            {Money.fromMinor(averageCostMinor).formatIdr()}
          </strong>
          /{unit}.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase font-mono tracking-wider text-[var(--color-ink-muted)] bg-[var(--color-kanvas)]/50 border-y border-[var(--color-border)]">
            <tr>
              <th className="py-2.5 px-4">Tanggal</th>
              <th className="py-2.5 px-4">Sumber</th>
              <th className="py-2.5 px-4 text-right">Qty Masuk</th>
              <th className="py-2.5 px-4 text-right">Harga/Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {[...points].reverse().map((p) => (
              <tr key={p.id} className="hover:bg-[var(--color-kanvas)]/30">
                <td className="py-2.5 px-4 font-mono text-xs">{p.date}</td>
                <td className="py-2.5 px-4 text-xs text-[var(--color-ink-muted)]">
                  {SOURCE_LABEL[p.referenceType]}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tnum text-xs">
                  {Number(p.initialQty).toLocaleString("id-ID")} {unit}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tnum text-xs font-semibold text-[var(--color-tinta)]">
                  {Money.fromMinor(p.unitCostMinor).formatIdr()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
