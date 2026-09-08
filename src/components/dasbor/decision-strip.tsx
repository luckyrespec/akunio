import Link from "next/link";
import { ArrowRight, ShieldCheck, ShieldAlert, OctagonAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Money } from "@/core/money/money";
import type { CashSafetyStatus } from "@/core/dasbor/decisions";

export interface DecisionStripProps {
  cash: {
    status: CashSafetyStatus;
    runwayDays: number | null;
    note: string;
    cashText: string;
    due7Text: string;
    due7Count: number;
  };
  collect: {
    topOverdueText: string;
    overdueCount: number;
    topName: string;
    href: string;
  };
  health: {
    direction: "naik" | "turun" | "sama";
    pct: number | null;
    curText: string;
    prevLabel: string;
  };
}

const CASH_STYLE: Record<CashSafetyStatus, { badge: string; Icon: typeof ShieldCheck; label: string }> = {
  AMAN: { badge: "bg-debit/10 text-debit", Icon: ShieldCheck, label: "Aman keluar uang" },
  WASPADA: { badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: ShieldAlert, label: "Waspada" },
  KRITIS: { badge: "bg-credit/10 text-credit", Icon: OctagonAlert, label: "Kritis" },
};

export function DecisionStrip({ cash, collect, health }: DecisionStripProps) {
  const cashStyle = CASH_STYLE[cash.status];
  const HealthIcon = health.direction === "naik" ? TrendingUp : health.direction === "turun" ? TrendingDown : Minus;
  const healthTint =
    health.direction === "naik"
      ? "bg-debit/10 text-debit"
      : health.direction === "turun"
        ? "bg-credit/10 text-credit"
        : "bg-canvas text-ink-soft";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="dasbor-decisions">
      {/* 1. Aman keluar uang? */}
      <div className="flex h-full flex-col rounded-2xl border border-rule bg-paper p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Aman keluar uang?</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cashStyle.badge}`}>
            <cashStyle.Icon className="size-3" />
            {cashStyle.label}
          </span>
        </div>
        <p className="tnum mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">{cash.cashText}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {cash.due7Count > 0
            ? `Kewajiban 7 hari: ${cash.due7Text} (${cash.due7Count} item)`
            : "Tanpa kewajiban 7 hari ke depan."}{" "}
          {cash.runwayDays !== null ? `· runway ±${cash.runwayDays} hari.` : ""}
        </p>
        <p className="mt-1 text-[11px] text-ink-soft">{cash.note}</p>
        <Link href="/faktur" className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-semibold text-terra hover:underline">
          Lihat kewajiban <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* 2. Tagih / bayar duluan */}
      <div className="flex h-full flex-col rounded-2xl border border-rule bg-paper p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Tagih duluan</p>
          <span className="rounded-full bg-terra/10 px-2 py-0.5 text-[11px] font-bold text-terra">
            {collect.overdueCount > 0 ? `${collect.overdueCount} overdue` : "Beres"}
          </span>
        </div>
        <p className="tnum mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">
          {collect.overdueCount > 0 ? collect.topOverdueText : "Tidak ada tunggakan"}
        </p>
        <p className="mt-1 truncate text-xs text-ink-soft">
          {collect.overdueCount > 0 ? `Prioritas: ${collect.topName}` : "Piutang & utang lancar."}
        </p>
        <Link href={collect.href} className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-semibold text-terra hover:underline">
          {collect.overdueCount > 0 ? "Ke daftar tagihan" : "Ke faktur"} <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* 3. Sehat vs bulan lalu */}
      <div className="flex h-full flex-col rounded-2xl border border-rule bg-paper p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Sehat vs {health.prevLabel}?</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${healthTint}`}>
            <HealthIcon className="size-3" />
            {health.direction === "sama" ? "Stabil" : `Laba ${health.direction}${health.pct !== null ? ` ${health.pct > 0 ? "+" : ""}${health.pct}%` : ""}`}
          </span>
        </div>
        <p className="tnum mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">{health.curText}</p>
        <p className="mt-1 text-xs text-ink-soft">Laba bersih bulan berjalan vs {health.prevLabel}.</p>
        <Link href="/laporan/laba-rugi" className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-semibold text-terra hover:underline">
          Buka laba rugi <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export { Money };
