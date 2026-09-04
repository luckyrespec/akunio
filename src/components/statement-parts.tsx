"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  Calendar,
  Layers,
  FileText,
  BarChart3,
  BookOpen,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";

export interface PeriodOption {
  name: string;
}

export interface StatementShellProps {
  title: string;
  subtitle?: string;
  entityName?: string;
  periodName: string;
  options: PeriodOption[];
  periodDateRange?: { startsOn: string; endsOn: string };
  isBalanced?: boolean;
  children: React.ReactNode;
}

const REPORT_TABS = [
  { href: "/laporan/neraca", label: "Posisi Keuangan (Neraca)", icon: BookOpen },
  { href: "/laporan/laba-rugi", label: "Laba Rugi", icon: BarChart3 },
  { href: "/laporan/arus-kas", label: "Arus Kas", icon: RefreshCw },
  { href: "/laporan/perubahan-ekuitas", label: "Perubahan Ekuitas", icon: Layers },
  { href: "/laporan/calk", label: "CALK", icon: FileText },
];

/**
 * Format tanggal Indonesia ramah mata (contoh: 31 Desember 2026)
 */
function formatIndonesianDate(isoString: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString + "T00:00:00");
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function StatementShell({
  title,
  subtitle = "Disusun Berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)",
  entityName = "Nama Entitas Usaha",
  periodName,
  options,
  periodDateRange,
  isBalanced,
  children,
}: StatementShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPeriod = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", newPeriod);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. TOP TOOLBAR & NAVIGASI (Hidden on Print) */}
      <div className="print:hidden space-y-4">
        {/* Breadcrumb back */}
        <div className="flex items-center justify-between">
          <Link
            href="/laporan"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Pusat Laporan Keuangan
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-terra/10 px-2.5 py-0.5 text-[11px] font-semibold text-terra">
              Standar SAK EMKM
            </span>
          </div>
        </div>

        {/* Quick Report Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-rule/70 pb-2 paper-scrollbar">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={`${tab.href}${periodName ? `?period=${encodeURIComponent(periodName)}` : ""}`}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-150 shrink-0",
                  isActive
                    ? "bg-ink text-paper font-semibold shadow-xs"
                    : "text-ink-soft hover:text-ink hover:bg-canvas/80",
                )}
              >
                <Icon className={cn("size-3.5", isActive ? "text-paper" : "text-terra")} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Control Bar: Filter Periode & Cetak PDF */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-paper p-3 sm:p-4 rounded-2xl border border-rule shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-canvas text-terra shrink-0">
              <Calendar className="size-4" />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="period-select" className="font-medium text-ink-soft shrink-0">
                Pilih Periode:
              </label>
              <select
                id="period-select"
                name="period"
                value={periodName}
                onChange={handlePeriodChange}
                className="h-8.5 rounded-xl border border-rule bg-canvas px-3 text-xs font-semibold text-ink shadow-2xs hover:border-terra/60 focus:ring-2 focus:ring-terra/20 focus:outline-none cursor-pointer"
              >
                {options.map((o) => (
                  <option key={o.name} value={o.name}>
                    Periode {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isBalanced !== undefined && (
              <div
                className={cn(
                  "hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border",
                  isBalanced
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40"
                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/40",
                )}
              >
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Neraca Seimbang (Balanced)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Periksa Kembali Keseimbangan</span>
                  </>
                )}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="h-8.5 px-3.5 text-xs font-semibold rounded-xl border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
            >
              <Printer className="size-3.5 mr-1.5 text-terra" />
              Cetak / Simpan PDF
            </Button>
          </div>
        </div>
      </div>

      {/* 2. LEMBAR LAPORAN KEUANGAN FORMAL (PAPER & INK SHEET) */}
      <article className="mx-auto w-full max-w-4xl rounded-2xl sm:rounded-3xl border border-rule bg-paper p-6 sm:p-10 md:p-12 shadow-sm transition-all print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none">
        {/* KOP RESMI LAPORAN KEUANGAN SAK EMKM */}
        <header className="border-b-2 border-ink/80 pb-6 mb-8 text-center space-y-2 print:pb-4 print:mb-6">
          <p className="font-display text-lg sm:text-xl font-bold uppercase tracking-wider text-ink">
            {entityName}
          </p>
          <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-ink uppercase tracking-tight">
            {title}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-ink-soft">
            {periodDateRange
              ? `Untuk Periode yang Berakhir pada ${formatIndonesianDate(periodDateRange.endsOn)}`
              : `Periode Buku ${periodName}`}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-ink-soft/80 italic border-t border-rule/50 mt-3 pt-3">
            <span>{subtitle}</span>
            <span className="font-normal font-sans not-italic font-medium text-ink-soft">
              (Disajikan dalam Rupiah, kecuali dinyatakan lain)
            </span>
          </div>
        </header>

        {/* ISI LAPORAN */}
        <main className="space-y-6 print:space-y-4">{children}</main>

        {/* TANDA TANGAN / PENGESAHAN LAPORAN SAK EMKM (Formal Document Footer) */}
        <footer className="mt-12 pt-8 border-t border-rule/60 text-xs text-ink-soft print:mt-8 print:pt-6">
          <div className="grid grid-cols-2 gap-8 text-center sm:text-left">
            <div>
              <p className="font-medium text-ink">Catatan Kepatuhan:</p>
              <p className="text-[11px] leading-relaxed text-ink-soft mt-1">
                Laporan ini disusun secara otomatis oleh sistem Akunio berpedoman pada Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM).
              </p>
            </div>
            <div className="flex flex-col items-center sm:items-end justify-between">
              <div className="text-center sm:text-right">
                <p className="text-[11px]">{entityName}</p>
                <p className="font-semibold text-ink mt-0.5">Penanggung Jawab Keuangan</p>
                <div className="h-14 sm:h-16 w-32 border-b border-ink/40 my-1 mx-auto sm:mr-0" />
                <p className="text-[11px] text-ink-soft">( Tanda Tangan &amp; Stempel )</p>
              </div>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

/**
 * Baris tabel laporan keuangan dengan tipografi akuntansi:
 * - code: Kode akun (opsional, disajikan dalam font mono halus)
 * - label: Nama akun / baris
 * - minor: Jumlah dalam BigInt (minor units)
 * - bold: Gaya font penegas untuk subtotal
 * - indent: Tingkat indentasi baris (1 = sub-akun, 2 = detail lanjutan)
 * - isTotal: Garis atas tunggal untuk subtotal kalkulasi
 * - isGrandTotal: Garis bawah ganda akuntansi (rule-double)
 */
export function ReportRowView({
  code,
  label,
  minor,
  bold,
  indent,
  isTotal,
  isGrandTotal,
  variant = "normal",
}: {
  code?: string;
  label: string;
  minor: bigint;
  bold?: boolean;
  indent?: 1 | 2 | boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  variant?: "normal" | "subtotal" | "header" | "grand-total";
}) {
  const indentClass =
    indent === 2
      ? "pl-8 sm:pl-10"
      : indent === 1 || indent === true
      ? "pl-4 sm:pl-6"
      : "pl-0";

  return (
    <div
      className={cn(
        "group flex items-center justify-between py-1.5 transition-colors text-xs sm:text-sm",
        indentClass,
        (bold || variant === "subtotal" || variant === "grand-total") && "font-semibold text-ink",
        !bold && variant === "normal" && "text-ink/90 hover:bg-canvas/50 rounded-lg px-2 -mx-2",
        isTotal && "border-t border-ink/30 pt-2 mt-1",
        isGrandTotal && "rule-double pt-2.5 mt-2 font-bold text-sm sm:text-base text-ink",
      )}
    >
      <div className="flex items-center gap-2 truncate pr-4">
        {code && (
          <span className="font-mono text-[11px] text-ink-soft font-normal shrink-0">
            {code}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>

      <div className="text-right shrink-0">
        <span
          className={cn(
            "tnum font-mono tabular-nums text-right inline-block min-w-[120px]",
            minor < 0n ? "text-rose-600 dark:text-rose-400" : "text-ink",
            bold && "font-semibold",
          )}
        >
          {Money.fromMinor(minor).formatIdr()}
        </span>
      </div>
    </div>
  );
}

/**
 * Pemisah Kategori Utama (Misal: ASET LANCAR, ASET TIDAK LANCAR, BEBAN OPERASIONAL)
 */
export function ReportSectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-rule/80 pb-1.5 mt-6 mb-3",
        className,
      )}
    >
      <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}
