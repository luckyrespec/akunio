import { Fragment } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Money } from "@/core/money/money";

export interface PlTableRow {
  id: string;
  code: string;
  name: string;
  count: number;
  movementMinor: bigint;
}

export interface PlTableSection {
  label: string;
  rows: PlTableRow[];
  subtotalMinor: bigint;
}

export function PlAccountTable({
  sections,
  totalLabel,
  totalMinor,
  basePath,
  detailQuery = "",
  ariaLabel,
}: {
  sections: PlTableSection[];
  totalLabel: string;
  totalMinor: bigint;
  basePath: string;
  detailQuery?: string;
  ariaLabel: string;
}) {
  const suffix = detailQuery ? `?${detailQuery}` : "";
  return (
    <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left tnum" aria-label={ariaLabel}>
          <thead>
            <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Akun</th>
              <th className="px-4 py-3 text-right">Baris Jurnal</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/60">
            {sections.map((s) => (
              <Fragment key={s.label}>
                <tr className="bg-canvas/50">
                  <td colSpan={3} className="px-4 py-2">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <span className="inline-block size-1.5 rounded-full bg-terra" />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-[11px] font-semibold text-ink">
                    {Money.formatIdr(s.subtotalMinor)}
                  </td>
                  <td />
                </tr>
                {s.rows.map((r, i) => (
                  <tr
                    key={r.id}
                    data-testid="pl-account-row"
                    className="row-enter hover:bg-canvas/40 transition-colors"
                    style={{ "--row-i": i } as CSSProperties}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-terra">{r.code}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.count}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {r.movementMinor === 0n ? (
                        <span className="text-ink-soft/40">—</span>
                      ) : (
                        Money.formatIdr(r.movementMinor)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`${basePath}/${r.id}${suffix}`}
                        aria-label={`Buka kartu ${r.name}`}
                        className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-semibold text-terra hover:underline"
                      >
                        <span>Lihat kartu</span>
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
              <td
                colSpan={3}
                className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft"
              >
                {totalLabel}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                {Money.formatIdr(totalMinor)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
