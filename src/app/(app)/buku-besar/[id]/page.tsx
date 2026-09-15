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
import { LedgerTableClient } from "./ledger-table-client";
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
  searchParams: Promise<{ dari?: string; sampai?: string; preset?: string }>;
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

      {/* Transaction Mutation Table + Filter (client) */}
      <Reveal delay={0.1}>
        <LedgerTableClient
          initialPreset={sp.preset ?? ""}
          initialDari={sp.dari ?? ""}
          initialSampai={sp.sampai ?? ""}
          rows={rows.map((r) => ({
            number: r.number,
            entryDate: r.entryDate,
            memo: r.memo,
            debitMinor: r.debitMinor.toString(),
            creditMinor: r.creditMinor.toString(),
            balanceMinor: r.balanceMinor.toString(),
          }))}
          openingMinor={openingMinor.toString()}
          rangeFrom={range?.from ?? null}
        />
      </Reveal>
    </section>
  );
}
