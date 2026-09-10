"use client";

import * as React from "react";
import { Landmark } from "lucide-react";
import { Money } from "@/core/money/money";
import { useEntitySheet } from "@/components/ai-elements/entity-sheet";
import { cn } from "@/lib/utils";

type Row = { code: string; name?: string; label?: string; movementMinor: string };

function amount(v: string): string {
  try {
    return Money.formatIdr(v);
  } catch {
    return v;
  }
}

function isNegative(v: string): boolean {
  return v.trim().startsWith("-");
}

function AccountCell({ code, name }: { code: string; name: string }) {
  const sheet = useEntitySheet();
  const isAccount = /^\d/.test(code.trim());
  if (!isAccount || !sheet) {
    return (
      <span>
        <span className="font-mono font-semibold text-terra">{code}</span>{" "}
        <span className="text-ink-soft">{name}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => sheet.openAccount(code.trim())}
      className="text-left hover:underline"
      title={`Buka rincian akun ${code}`}
    >
      <span className="font-mono font-semibold text-terra">{code}</span>{" "}
      <span className="text-ink-soft">{name}</span>
    </button>
  );
}

function Section({
  title,
  rows,
  total,
  totalLabel = "Total",
}: {
  title: string;
  rows: Row[];
  total?: string;
  totalLabel?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
        {title}
      </p>
      <table className="w-full text-left text-xs">
        <tbody className="divide-y divide-rule/60 text-ink">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5">
                <AccountCell code={r.code} name={r.name ?? r.label ?? ""} />
              </td>
              <td
                className={cn(
                  "px-3 py-1.5 text-right font-mono tnum",
                  isNegative(r.movementMinor) && "text-destructive",
                )}
              >
                {amount(r.movementMinor)}
              </td>
            </tr>
          ))}
          {total !== undefined && (
            <tr className="bg-canvas/60 font-semibold">
              <td className="px-3 py-1.5">{totalLabel}</td>
              <td className="px-3 py-1.5 text-right font-mono tnum">{amount(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  balanced,
  children,
}: {
  title: string;
  subtitle: string;
  balanced?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
      <div className="flex items-center gap-2 border-b border-rule bg-canvas/60 px-3 py-2">
        <Landmark className="size-3.5 text-terra" />
        <p className="text-xs font-bold text-ink">{title}</p>
        {balanced !== undefined && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold",
              balanced
                ? "bg-debit/10 text-debit"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {balanced ? "Seimbang" : "Tidak seimbang"}
          </span>
        )}
      </div>
      <p className="px-3 pt-1.5 text-[11px] text-ink-soft">{subtitle}</p>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function asRows(v: unknown): Row[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => asRecord(r) && typeof (r as Record<string, unknown>).movementMinor === "string")
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        code: String(o.code ?? ""),
        name: typeof o.name === "string" ? o.name : undefined,
        label: typeof o.label === "string" ? o.label : undefined,
        movementMinor: o.movementMinor as string,
      };
    });
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Tabel laporan keuangan terstruktur dari hasil tool get_report —
 * angka persis dari mesin (bukan susunan model), bentuk neraca/laba rugi
 * baku: seksi + subtotal + total + status seimbang.
 */
export function statementWidgetFor(toolName: string, result: unknown): React.ReactNode {
  if (toolName !== "get_report") return null;
  const data = asRecord(result);
  const d = asRecord(data?.data) ?? data;
  if (!d) return null;

  // Neraca
  if (Array.isArray(d.assetRows) || Array.isArray(d.liabilityRows) || Array.isArray(d.equityRows)) {
    const totalA = str(d.totalAssetsMinor);
    const totalEL = str(d.totalEquityAndLiabilitiesMinor);
    return (
      <Shell title="Neraca" subtitle="Posisi keuangan: aset = liabilitas + ekuitas." balanced={totalA !== null && totalEL !== null ? totalA === totalEL : undefined}>
        <Section title="Aset" rows={asRows(d.assetRows)} total={totalA ?? undefined} totalLabel="Total Aset" />
        <Section title="Liabilitas" rows={asRows(d.liabilityRows)} total={str(d.totalLiabilitiesMinor) ?? undefined} totalLabel="Total Liabilitas" />
        <Section title="Ekuitas" rows={asRows(d.equityRows)} total={totalEL ?? undefined} totalLabel="Total Liabilitas + Ekuitas" />
      </Shell>
    );
  }

  // Laba rugi
  if (Array.isArray(d.revenueRows) || Array.isArray(d.expenseRows)) {
    return (
      <Shell title="Laba Rugi" subtitle="Pendapatan dikurangi beban periode berjalan.">
        <Section title="Pendapatan" rows={asRows(d.revenueRows)} total={str(d.revenueTotalMinor) ?? undefined} totalLabel="Total Pendapatan" />
        <Section title="Beban" rows={asRows(d.expenseRows)} total={str(d.expenseTotalMinor) ?? undefined} totalLabel="Total Beban" />
        {str(d.netIncomeMinor) !== null && (
          <div className="flex items-center justify-between bg-canvas/60 px-3 py-1.5 text-xs font-bold text-ink">
            <span>Laba Bersih</span>
            <span className={cn("font-mono tnum", isNegative(d.netIncomeMinor as string) && "text-destructive")}>
              {amount(d.netIncomeMinor as string)}
            </span>
          </div>
        )}
      </Shell>
    );
  }

  // Arus kas
  if (str(d.operatingMinor) !== null || Array.isArray(d.rows)) {
    return (
      <Shell title="Arus Kas" subtitle="Metode tidak langsung: operasi, investasi, pendanaan.">
        <Section title="Operasi" rows={asRows(d.rows)} total={str(d.operatingMinor) ?? undefined} totalLabel="Kas dari Operasi" />
        {(str(d.investingMinor) !== null || str(d.financingMinor) !== null) && (
          <div className="px-3 py-1 text-xs text-ink">
            {str(d.investingMinor) !== null && (
              <div className="flex justify-between py-0.5">
                <span>Investasi</span>
                <span className="font-mono tnum">{amount(d.investingMinor as string)}</span>
              </div>
            )}
            {str(d.financingMinor) !== null && (
              <div className="flex justify-between py-0.5">
                <span>Pendanaan</span>
                <span className="font-mono tnum">{amount(d.financingMinor as string)}</span>
              </div>
            )}
          </div>
        )}
        {str(d.netChangeMinor) !== null && (
          <div className="flex items-center justify-between bg-canvas/60 px-3 py-1.5 text-xs font-bold text-ink">
            <span>Perubahan Kas Bersih</span>
            <span className="font-mono tnum">{amount(d.netChangeMinor as string)}</span>
          </div>
        )}
      </Shell>
    );
  }

  // Perubahan ekuitas
  if (str(d.closingRetainedEarningsMinor) !== null) {
    return (
      <Shell title="Perubahan Ekuitas" subtitle="Modal disetor, prive, dan laba berjalan.">
        <Section title="Komponen" rows={asRows(d.rows)} />
        <div className="flex items-center justify-between bg-canvas/60 px-3 py-1.5 text-xs font-bold text-ink">
          <span>Saldo Laba Akhir</span>
          <span className="font-mono tnum">{amount(d.closingRetainedEarningsMinor as string)}</span>
        </div>
      </Shell>
    );
  }

  return null;
}
