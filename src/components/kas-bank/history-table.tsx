import Link from "next/link";
import { Money } from "@/core/money/money";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  History,
  Landmark,
  ReceiptText,
  RotateCcw,
  SearchX,
  Wallet,
} from "lucide-react";

export interface HistoryTableRow {
  entryId: string;
  entryDate: string;
  memo: string;
  number: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export interface HistorySummary {
  openingMinor: bigint;
  totalMasuk: bigint;
  totalKeluar: bigint;
  closingMinor: bigint;
}

const STAT_CAPTION =
  "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft";
const STAT_VALUE = "mt-1.5 text-base font-semibold tnum tabular-nums sm:text-lg";
const RESET_LINK =
  "inline-flex h-8 items-center gap-1.5 rounded-xl border border-rule bg-paper px-3 text-xs font-medium text-ink transition-colors hover:bg-canvas/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra/50";

export function HistoryTable({
  accountCode,
  accountName,
  periodLabel,
  summary,
  rows,
  hasActiveFilter,
  filterTitle,
  resetHref,
}: {
  accountCode: string;
  accountName: string;
  periodLabel: string;
  summary: HistorySummary;
  rows: HistoryTableRow[];
  hasActiveFilter: boolean;
  filterTitle: string;
  resetHref: string;
}) {
  return (
    <div className="space-y-3">
      <section
        aria-label={`Ringkasan mutasi ${accountCode} ${accountName}`}
        className="overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs"
      >
        <div className="border-b border-rule/60 px-4 pt-3.5 pb-3">
          <p className="text-sm font-semibold text-ink">
            {accountCode} · {accountName}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">{periodLabel}</p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-rule/60">
          <div className="bg-paper px-4 py-3.5">
            <dt className={STAT_CAPTION}>
              <Wallet className="size-3.5" aria-hidden />
              Saldo awal
            </dt>
            <dd className={`${STAT_VALUE} text-ink`}>
              {Money.formatIdr(summary.openingMinor)}
            </dd>
          </div>
          <div className="bg-paper px-4 py-3.5">
            <dt className={STAT_CAPTION}>
              <ArrowDownLeft className="size-3.5" aria-hidden />
              Masuk
            </dt>
            <dd className={`${STAT_VALUE} text-debit`}>
              {Money.formatIdr(summary.totalMasuk)}
            </dd>
          </div>
          <div className="bg-paper px-4 py-3.5">
            <dt className={STAT_CAPTION}>
              <ArrowUpRight className="size-3.5" aria-hidden />
              Keluar
            </dt>
            <dd className={`${STAT_VALUE} text-ink`}>
              {Money.formatIdr(summary.totalKeluar)}
            </dd>
          </div>
          <div className="bg-paper px-4 py-3.5">
            <dt className={STAT_CAPTION}>
              <Landmark className="size-3.5" aria-hidden />
              Saldo akhir
            </dt>
            <dd className={`${STAT_VALUE} text-ink`}>
              <span className="rule-double pb-0.5">
                {Money.formatIdr(summary.closingMinor)}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            {hasActiveFilter ? (
              <>
                <SearchX
                  className="size-8 mx-auto mb-3 text-ink-soft/40"
                  aria-hidden
                />
                <p className="text-sm font-medium text-ink">{filterTitle}</p>
                <p className="mt-1 text-xs text-ink-soft max-w-md mx-auto">
                  Coba kata kunci lain, ubah arah mutasi, atau atur ulang
                  filter.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Link href={resetHref} className={RESET_LINK}>
                    <RotateCcw className="size-3.5 text-terra" aria-hidden />
                    Atur ulang filter
                  </Link>
                </div>
              </>
            ) : (
              <>
                <History
                  className="size-8 mx-auto mb-3 text-ink-soft/40"
                  aria-hidden
                />
                <p className="text-sm font-medium text-ink">
                  Tidak ada mutasi pada rentang ini
                </p>
                <p className="mt-1 text-xs text-ink-soft max-w-md mx-auto">
                  Coba rentang tanggal yang lebih lebar, atau catat transaksi
                  dulu di Pembayaran, Penerimaan, atau Transfer.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Link
                    href="/kas-bank/pembayaran/baru"
                    className={RESET_LINK}
                  >
                    <ArrowUpRight
                      className="size-3.5 text-terra"
                      aria-hidden
                    />
                    Catat pembayaran
                  </Link>
                  <Link
                    href="/kas-bank/penerimaan/baru"
                    className={RESET_LINK}
                  >
                    <ArrowDownLeft
                      className="size-3.5 text-terra"
                      aria-hidden
                    />
                    Catat penerimaan
                  </Link>
                  <Link href="/kas-bank/transfer/baru" className={RESET_LINK}>
                    <ArrowLeftRight
                      className="size-3.5 text-terra"
                      aria-hidden
                    />
                    Catat transfer
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <caption className="sr-only">
                Mutasi {accountCode} {accountName} periode {periodLabel}
              </caption>
              <thead className="border-b border-rule bg-canvas/50 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Tanggal
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Nomor Bukti
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Keterangan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Masuk
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Keluar
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Saldo Berjalan
                  </th>
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
                    <td className="px-4 py-3 font-mono whitespace-nowrap">
                      <Link
                        href={`/jurnal/${r.entryId}`}
                        title={`Buka jurnal ${r.number}`}
                        className="inline-flex items-center gap-1.5 text-terra hover:underline underline-offset-2"
                      >
                        <ReceiptText
                          className="size-3.5 opacity-60"
                          aria-hidden
                        />
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{r.memo}</td>
                    <td className="px-4 py-3 text-right font-medium text-debit whitespace-nowrap">
                      {r.debitMinor > 0n ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <ArrowDownLeft
                            className="size-3.5"
                            aria-hidden
                          />
                          {Money.formatIdr(r.debitMinor)}
                        </span>
                      ) : (
                        <span className="text-ink-soft/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink whitespace-nowrap">
                      {r.creditMinor > 0n ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <ArrowUpRight
                            className="size-3.5 text-ink-soft"
                            aria-hidden
                          />
                          {Money.formatIdr(r.creditMinor)}
                        </span>
                      ) : (
                        <span className="text-ink-soft/50">—</span>
                      )}
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
