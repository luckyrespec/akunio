import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion";
import {
  ArrowLeft,
  Coins,
  CreditCard,
  Scale,
  TrendingUp,
  TrendingDown,
  FileText,
  BookOpen,
} from "lucide-react";

interface AccountLedgerDetailPageProps {
  params: Promise<{ id: string }>;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  ASET: Coins,
  LIABILITAS: CreditCard,
  EKUITAS: Scale,
  PENDAPATAN: TrendingUp,
  BEBAN: TrendingDown,
};

export default async function AccountLedgerDetailPage({
  params,
}: AccountLedgerDetailPageProps) {
  const { id } = await params;
  const ctx = await requireContext();

  let ledgerData;
  try {
    ledgerData = await db.transaction((tx) => getLedger(tx, ctx.orgId, id));
  } catch {
    notFound();
  }

  const { account, rows } = ledgerData;
  const isDebitNormal = account.normal === "D";
  const Icon = TYPE_ICONS[account.type] || FileText;

  const totalDebit = rows.reduce((acc, r) => acc + r.debitMinor, 0n);
  const totalCredit = rows.reduce((acc, r) => acc + r.creditMinor, 0n);
  const closingBalance = rows.at(-1)?.balanceMinor ?? 0n;

  return (
    <section className="space-y-6">
      {/* Page Header with Back Action */}
      <PageHeader
        title={`${account.code} · ${account.name}`}
        eyebrow={`Buku besar mutasi akun kategori ${account.type} (${isDebitNormal ? "Normal Debit" : "Normal Kredit"})`}
        actions={
          <div className="flex items-center gap-2.5">
            <Link href="/buku-besar">
              <Button
                variant="outline"
                size="sm"
                className="border-rule bg-paper hover:bg-canvas text-xs gap-1.5 shadow-2xs"
              >
                <ArrowLeft className="size-3.5" />
                <span>Kembali ke Daftar Akun</span>
              </Button>
            </Link>
            <Link href="/jurnal">
              <Button
                variant="outline"
                size="sm"
                className="border-rule bg-paper hover:bg-canvas text-xs gap-1.5 shadow-2xs"
              >
                <BookOpen className="size-3.5 text-ink-soft" />
                <span>Jurnal Umum</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Overview Stat Cards */}
      <Reveal delay={0.05}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Kategori & Sifat Akun
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-canvas border border-rule/80 text-terra">
                <Icon className="size-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-ink">{account.type}</span>
                <span className="text-[11px] text-ink-soft block font-mono">
                  Normal: {isDebitNormal ? "Debit (D)" : "Kredit (K)"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Mutasi Debit
            </span>
            <p className="mt-1 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
              {Money.fromMinor(totalDebit).formatIdr()}
            </p>
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Mutasi Kredit
            </span>
            <p className="mt-1 font-mono text-base font-bold text-terra">
              {Money.fromMinor(totalCredit).formatIdr()}
            </p>
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Saldo Akhir Buku Besar
            </span>
            <p className="mt-1 font-mono text-base font-bold text-ink">
              {Money.fromMinor(closingBalance).formatIdr()}
            </p>
          </div>
        </div>
      </Reveal>

      {/* Transaction Mutation Table */}
      <Reveal delay={0.1}>
        <div className="space-y-4">
          {/* Mobile Card List (< sm) */}
          <div className="space-y-3 sm:hidden">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-rule bg-paper p-8 text-center shadow-xs">
                <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
                <p className="font-display text-base font-medium text-ink">Belum ada mutasi</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Belum ada jurnal berstatus POSTED yang menggunakan akun ini.
                </p>
              </div>
            ) : (
              rows.map((r, i) => (
                <div
                  key={`${r.number}-${i}`}
                  className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-rule/50 pb-2">
                    <span className="font-mono font-bold text-xs text-ink">{r.number}</span>
                    <span className="text-xs text-ink-soft">{r.entryDate}</span>
                  </div>
                  {r.memo && <p className="text-xs text-ink-soft italic">“{r.memo}”</p>}
                  <div className="flex items-center justify-between text-xs pt-1 font-mono">
                    <div className="flex items-center gap-2">
                      {r.debitMinor > 0n && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          D: {Money.fromMinor(r.debitMinor).formatIdr()}
                        </span>
                      )}
                      {r.creditMinor > 0n && (
                        <span className="text-terra font-semibold">
                          K: {Money.fromMinor(r.creditMinor).formatIdr()}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-ink-soft mr-1">Saldo:</span>
                      <span className="font-bold text-ink">
                        {Money.fromMinor(r.balanceMinor).formatIdr()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop & Tablet Table (>= sm) */}
          <div className="hidden sm:block overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left tnum">
                <thead>
                  <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    <th className="px-4 py-3">Nomor Jurnal</th>
                    <th className="px-3.5 py-3">Tanggal</th>
                    <th className="px-4 py-3">Keterangan / Memo</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Kredit</th>
                    <th className="px-4 py-3 text-right">Saldo Berjalan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule/60">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-ink-soft">
                        <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
                        <p className="font-display text-base font-medium text-ink">
                          Belum ada transaksi
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Belum ada jurnal berstatus POSTED yang tercatat pada akun ini.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={`${r.number}-${i}`} className="hover:bg-canvas/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink">
                          {r.number}
                        </td>
                        <td className="px-3.5 py-3 text-ink-soft whitespace-nowrap">
                          {r.entryDate}
                        </td>
                        <td className="px-4 py-3 text-ink max-w-sm truncate" title={r.memo}>
                          {r.memo || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">
                          {r.debitMinor > 0n ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {Money.fromMinor(r.debitMinor).formatIdr()}
                            </span>
                          ) : (
                            <span className="text-ink-soft/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">
                          {r.creditMinor > 0n ? (
                            <span className="text-terra font-medium">
                              {Money.fromMinor(r.creditMinor).formatIdr()}
                            </span>
                          ) : (
                            <span className="text-ink-soft/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                          {Money.fromMinor(r.balanceMinor).formatIdr()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-rule bg-canvas/70 font-semibold">
                    <td colSpan={3} className="px-4 py-3.5 text-right uppercase text-[10px] tracking-wider text-ink-soft">
                      Total & Saldo Akhir
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {Money.fromMinor(totalDebit).formatIdr()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-terra">
                      {Money.fromMinor(totalCredit).formatIdr()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                      {Money.fromMinor(closingBalance).formatIdr()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
