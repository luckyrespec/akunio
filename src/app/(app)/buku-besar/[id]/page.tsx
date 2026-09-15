import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { resolveLedgerRange } from "@/lib/ledger-range";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { getControlForAccount } from "@/server/db/repos/subsidiary.repo";
import { SUBLEDGER_LIST_ROUTE } from "@/core/subledger/cards";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion";
import {
  ArrowLeft,
  CalendarRange,
  Coins,
  CreditCard,
  MoveRight,
  Scale,
  TrendingUp,
  TrendingDown,
  FileText,
  BookOpen,
} from "lucide-react";

interface AccountLedgerDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dari?: string; sampai?: string; preset?: string }>;
}

const PRESETS = [
  { value: "bulan-ini", label: "Bulan ini" },
  { value: "bulan-lalu", label: "Bulan lalu" },
  { value: "tahun-berjalan", label: "Tahun ini" },
  { value: "semua", label: "Semua" },
] as const;

function formatIdDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
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
  searchParams,
}: AccountLedgerDetailPageProps) {
  const { id } = await params;
  const ctx = await requireContext();
  const sp = await searchParams;
  const range = resolveLedgerRange({ dari: sp.dari, sampai: sp.sampai, preset: sp.preset });
  const isFiltered = range !== undefined;

  let ledgerData;
  try {
    ledgerData = await withOrg(ctx.orgId, (tx) => getLedger(tx, ctx.orgId, id, range));
  } catch {
    notFound();
  }

  const { account, rows, openingMinor } = ledgerData;
  const controlKind = await withOrg(ctx.orgId, (tx) => getControlForAccount(tx, ctx.orgId, id));
  const isDebitNormal = account.normal === "D";
  const Icon = TYPE_ICONS[account.type] || FileText;

  const totalDebit = rows.reduce((acc, r) => acc + r.debitMinor, 0n);
  const totalCredit = rows.reduce((acc, r) => acc + r.creditMinor, 0n);
  const closingBalance = rows.at(-1)?.balanceMinor ?? openingMinor;
  const filterHref = (preset?: string, dari?: string, sampai?: string) => {
    const p = new URLSearchParams();
    if (preset) p.set("preset", preset);
    if (dari) p.set("dari", dari);
    if (sampai) p.set("sampai", sampai);
    const s = p.toString();
    return `/buku-besar/${id}${s ? `?${s}` : ""}`;
  };

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
            {controlKind && (
              <Link href={SUBLEDGER_LIST_ROUTE[controlKind]}>
                <Button
                  size="sm"
                  className="bg-terra text-white hover:bg-terra/90 text-xs gap-1.5 shadow-xs"
                >
                  <FileText className="size-3.5" />
                  <span>Buku Pembantu</span>
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Filter Periode */}
      <form
        method="get"
        className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            <CalendarRange className="size-3.5" aria-hidden />
            Rentang Periode
          </span>
          <span className="tnum font-mono text-xs text-ink">
            {isFiltered && range?.from
              ? `${formatIdDate(range.from)} – ${range.to ? formatIdDate(range.to) : "…"}`
              : "Seluruh riwayat"}
            <span className="text-ink-soft"> · {rows.length} mutasi</span>
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <div className="inline-flex items-center rounded-xl border border-rule bg-canvas p-1 gap-1">
          {PRESETS.map((p) => {
            const active =
              (sp.preset ?? "") === p.value || (p.value === "semua" && !sp.preset && !sp.dari && !sp.sampai);
            return (
              <Link
                key={p.value}
                href={filterHref(p.value === "semua" ? undefined : p.value)}
                aria-current={active ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-terra font-semibold text-white shadow-2xs"
                    : "text-ink-soft hover:bg-paper hover:text-ink"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ledger-dari" className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Dari tanggal
          </label>
          <input
            id="ledger-dari"
            name="dari"
            type="date"
            defaultValue={sp.dari ?? ""}
            className="h-9 rounded-xl border border-rule bg-canvas px-2.5 text-sm tnum text-ink"
          />
        </div>
        <MoveRight className="size-4 shrink-0 text-ink-soft/60 mb-0.5 max-sm:hidden" aria-hidden />
        <div className="space-y-1.5">
          <label htmlFor="ledger-sampai" className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Sampai tanggal
          </label>
          <input
            id="ledger-sampai"
            name="sampai"
            type="date"
            defaultValue={sp.sampai ?? ""}
            className="h-9 rounded-xl border border-rule bg-canvas px-2.5 text-sm tnum text-ink"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-xl bg-terra px-4 text-xs font-semibold text-white shadow-none transition-all hover:bg-terra/90 active:translate-y-px"
        >
          Tampilkan
        </button>
        </div>
      </form>

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
            {isFiltered && range?.from && (
              <div className="rounded-2xl border border-rule bg-canvas/60 p-4 shadow-2xs flex items-center justify-between text-xs">
                <span className="font-semibold text-ink">
                  Saldo awal <span className="font-mono text-ink-soft">{range.from}</span>
                </span>
                <span className="font-mono font-bold text-ink">
                  {Money.fromMinor(openingMinor).formatIdr()}
                </span>
              </div>
            )}
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-rule bg-paper p-8 text-center shadow-xs">
                <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
                <p className="font-display text-base font-medium text-ink">
                  {isFiltered ? "Tidak ada mutasi pada periode ini" : "Belum ada mutasi"}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {isFiltered
                    ? "Coba rentang lain, atau lihat semua."
                    : "Belum ada jurnal berstatus POSTED yang menggunakan akun ini."}
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
                      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-soft mr-1">Saldo:</span>
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
                  {isFiltered && range?.from && (
                    <tr className="bg-canvas/50">
                      <td className="px-4 py-3 font-mono text-xs text-ink-soft">—</td>
                      <td className="px-3.5 py-3 text-xs text-ink-soft">{range.from}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-ink">
                        Saldo awal periode
                      </td>
                      <td className="px-4 py-3 text-right" />
                      <td className="px-4 py-3 text-right" />
                      <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                        {Money.fromMinor(openingMinor).formatIdr()}
                      </td>
                    </tr>
                  )}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-ink-soft">
                        <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
                        <p className="font-display text-base font-medium text-ink">
                          {isFiltered ? "Tidak ada mutasi pada periode ini" : "Belum ada transaksi"}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {isFiltered
                            ? "Coba rentang lain, atau lihat semua."
                            : "Belum ada jurnal berstatus POSTED yang tercatat pada akun ini."}
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
                    <td colSpan={3} className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft">
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
