"use client";

import { Wallet, TrendingUp } from "lucide-react";

/**
 * Strip KPI untuk hasil tool get_financial_kpis di bubble chat.
 * Dua kartu ringkas (kas & laba) — tanpa dependensi grafik.
 */
export function KpiStrip({ cashAndBank, ytdNetIncome }: { cashAndBank: string; ytdNetIncome: string }) {
  const items = [
    { icon: Wallet, label: "Kas & Bank", value: cashAndBank },
    { icon: TrendingUp, label: "Laba Tahun Ini", value: ytdNetIncome },
  ];
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-rule bg-canvas/60 px-3 py-2.5"
        >
          <p className="flex items-center gap-1 text-[11px] font-medium text-ink-soft">
            <it.icon className="size-3 text-terra" />
            {it.label}
          </p>
          <p className="tnum mt-0.5 truncate font-display text-sm font-semibold text-ink" title={it.value}>
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/** Kembalikan <KpiStrip/> bila hasil tool adalah KPI keuangan yang dikenali. */
export function kpiStripFor(toolName: string, result: unknown): React.ReactNode {
  if (toolName !== "get_financial_kpis") return null;
  const data = asRecord(result);
  const payload = asRecord(data?.data) ?? data;
  if (!payload) return null;
  const cash = typeof payload.cashAndBank === "string" ? payload.cashAndBank : null;
  const laba = typeof payload.ytdNetIncome === "string" ? payload.ytdNetIncome : null;
  if (!cash || !laba) return null;
  return <KpiStrip cashAndBank={cash} ytdNetIncome={laba} />;
}
