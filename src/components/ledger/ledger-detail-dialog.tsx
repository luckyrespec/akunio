"use client";

import * as React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import {
  ExternalLink,
  Loader2,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  Coins,
  Scale,
  TrendingDown,
} from "lucide-react";
import {
  getAccountLedgerAction,
  type LedgerDetailItem,
} from "@/server/actions/ledger.actions";
import { cn } from "@/lib/utils";

interface LedgerDetailDialogProps {
  accountId: string | null;
  accountInfo?: {
    code: string;
    name: string;
    type: string;
    normal: "D" | "K";
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  ASET: Coins,
  LIABILITAS: CreditCard,
  EKUITAS: Scale,
  PENDAPATAN: TrendingUp,
  BEBAN: TrendingDown,
};

export function LedgerDetailDialog({
  accountId,
  accountInfo,
  open,
  onOpenChange,
}: LedgerDetailDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState(accountInfo);
  const [rows, setRows] = React.useState<LedgerDetailItem[]>([]);
  const [closingBalanceMinor, setClosingBalanceMinor] = React.useState<string>("0");

  React.useEffect(() => {
    if (!open || !accountId) {
      return;
    }

    if (accountInfo) {
      setAccount(accountInfo);
    }

    let active = true;
    setLoading(true);
    setError(null);

    getAccountLedgerAction(accountId)
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          if (res.account) {
            setAccount({
              code: res.account.code,
              name: res.account.name,
              type: res.account.type,
              normal: res.account.normal as "D" | "K",
            });
          }
          setRows(res.rows ?? []);
          setClosingBalanceMinor(res.closingBalanceMinor ?? "0");
        } else {
          setError(res.error || "Gagal memuat rincian transaksi.");
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, accountId, accountInfo]);

  const closingBigInt = BigInt(closingBalanceMinor || "0");
  const isDebitNormal = account?.normal === "D";
  const Icon = account?.type ? TYPE_ICONS[account.type] || FileText : FileText;

  // Calculate totals
  const totalDebitMinor = rows.reduce(
    (acc, r) => acc + BigInt(r.debitMinor || "0"),
    0n,
  );
  const totalCreditMinor = rows.reduce(
    (acc, r) => acc + BigInt(r.creditMinor || "0"),
    0n,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-paper border-rule shadow-xl">
        {/* Modal Header */}
        <div className="p-6 border-b border-rule bg-canvas/40 shrink-0">
          <DialogHeader className="gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-canvas border border-rule/80 text-terra shadow-2xs">
                  <Icon className="size-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-terra">
                      {account?.code || "..."}
                    </span>
                    <Badge variant="outline" className="text-[11px] py-0 px-2 uppercase font-medium bg-canvas">
                      {account?.type || "Akun"}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] py-0 px-2 bg-canvas/70 text-ink-soft">
                      Normal: {isDebitNormal ? "Debit (D)" : "Kredit (K)"}
                    </Badge>
                  </div>
                  <DialogTitle className="font-display text-lg font-bold text-ink mt-0.5">
                    {account?.name || "Rincian Transaksi Akun"}
                  </DialogTitle>
                </div>
              </div>
            </div>
            <DialogDescription className="text-xs text-ink-soft">
              Daftar seluruh mutasi jurnal umum yang telah diposting pada akun ini beserta saldo berjalan.
            </DialogDescription>
          </DialogHeader>

          {/* Quick Stat Highlights */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-rule bg-paper p-2.5 shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Total Debit</span>
              <p className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {Money.fromMinor(totalDebitMinor).formatIdr()}
              </p>
            </div>
            <div className="rounded-xl border border-rule bg-paper p-2.5 shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Total Kredit</span>
              <p className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-terra">
                {Money.fromMinor(totalCreditMinor).formatIdr()}
              </p>
            </div>
            <div className="rounded-xl border border-rule bg-paper p-2.5 shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Saldo Akhir</span>
              <p className="mt-0.5 font-mono text-xs sm:text-sm font-bold text-ink">
                {Money.fromMinor(closingBigInt).formatIdr()}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body - Scrollable Transaction Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 paper-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-soft gap-2.5">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs font-medium">Memuat mutasi transaksi...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => {
                  if (accountId) {
                    setLoading(true);
                    getAccountLedgerAction(accountId).then((res) => {
                      setLoading(false);
                      if (res.ok) {
                        setRows(res.rows ?? []);
                        setClosingBalanceMinor(res.closingBalanceMinor ?? "0");
                      }
                    });
                  }
                }}
              >
                Coba Lagi
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-canvas border border-rule text-ink-soft/40 mb-3">
                <FileText className="size-6" />
              </div>
              <p className="font-display text-sm font-medium text-ink">Belum ada transaksi</p>
              <p className="mt-1 text-xs text-ink-soft max-w-xs">
                Belum ada jurnal berstatus POSTED yang memuat mutasi untuk akun {account?.code}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mobile Card List (< sm) */}
              <div className="space-y-2.5 sm:hidden">
                {rows.map((r, i) => {
                  const dMinor = BigInt(r.debitMinor || "0");
                  const cMinor = BigInt(r.creditMinor || "0");
                  const bMinor = BigInt(r.balanceMinor || "0");

                  return (
                    <div
                      key={`${r.number}-${i}`}
                      className="rounded-xl border border-rule bg-canvas/50 p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-rule/50 pb-1.5">
                        <span className="font-semibold text-ink font-mono">{r.number}</span>
                        <span className="text-ink-soft text-[11px]">{r.entryDate}</span>
                      </div>
                      {r.memo && <p className="text-ink-soft italic text-[11px]">“{r.memo}”</p>}
                      <div className="flex items-center justify-between pt-1 font-mono">
                        <div className="flex gap-2 text-[11px]">
                          {dMinor > 0n && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              D: {Money.fromMinor(dMinor).formatIdr()}
                            </span>
                          )}
                          {cMinor > 0n && (
                            <span className="text-terra font-semibold">
                              K: {Money.fromMinor(cMinor).formatIdr()}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-ink-soft uppercase mr-1">Saldo:</span>
                          <span className="font-bold text-ink">{Money.fromMinor(bMinor).formatIdr()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block overflow-hidden rounded-xl border border-rule bg-canvas/30 shadow-2xs">
                <table className="w-full text-xs tnum text-left">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <th className="px-3.5 py-2.5">No. Jurnal</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3.5 py-2.5">Keterangan</th>
                      <th className="px-3.5 py-2.5 text-right">Debit</th>
                      <th className="px-3.5 py-2.5 text-right">Kredit</th>
                      <th className="px-3.5 py-2.5 text-right">Saldo Berjalan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60">
                    {rows.map((r, i) => {
                      const dMinor = BigInt(r.debitMinor || "0");
                      const cMinor = BigInt(r.creditMinor || "0");
                      const bMinor = BigInt(r.balanceMinor || "0");

                      return (
                        <tr key={`${r.number}-${i}`} className="hover:bg-paper/70 transition-colors">
                          <td className="px-3.5 py-2.5 font-mono font-semibold text-ink">
                            {r.number}
                          </td>
                          <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">
                            {r.entryDate}
                          </td>
                          <td className="px-3.5 py-2.5 text-ink max-w-[220px] truncate" title={r.memo}>
                            {r.memo || "—"}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                            {dMinor > 0n ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {Money.fromMinor(dMinor).formatIdr()}
                              </span>
                            ) : (
                              <span className="text-ink-soft/30">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                            {cMinor > 0n ? (
                              <span className="text-terra font-medium">
                                {Money.fromMinor(cMinor).formatIdr()}
                              </span>
                            ) : (
                              <span className="text-ink-soft/30">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-ink">
                            {Money.fromMinor(bMinor).formatIdr()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-rule bg-canvas/70 font-semibold">
                      <td colSpan={3} className="px-3.5 py-3 text-right uppercase text-[11px] tracking-wider text-ink-soft">
                        Saldo Akhir
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {Money.fromMinor(totalDebitMinor).formatIdr()}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-terra">
                        {Money.fromMinor(totalCreditMinor).formatIdr()}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-base font-bold text-ink">
                        {Money.fromMinor(closingBigInt).formatIdr()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-rule bg-canvas/40 flex items-center justify-between shrink-0">
          <span className="text-xs text-ink-soft">
            Total {rows.length} entri transaksi
          </span>
          <div className="flex items-center gap-2">
            <Link href={`/jurnal`} target="_blank">
              <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-ink-soft hover:text-ink">
                Buka Jurnal <ExternalLink className="size-3" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-rule bg-paper hover:bg-canvas"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
