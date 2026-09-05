"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  HelpCircle,
  PlusCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  hideTableHeader?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

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
  hideTableHeader,
  actions,
  children,
}: StatementShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPeriod = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", newPeriod);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleExportCsv = () => {
    // Ekstrak teks laporan ke CSV sederhana
    const rows = Array.from(document.querySelectorAll("article .group, article header, article footer"));
    let csvContent = `data:text/csv;charset=utf-8,"LAPORAN KEUANGAN","${title}"\n`;
    csvContent += `"ENTITAS","${entityName}"\n`;
    csvContent += `"PERIODE","${periodName}"\n\n`;
    csvContent += `"KODE / POS","RINCIAN","JUMLAH (RUPIAH)"\n`;

    const dataRows = document.querySelectorAll("article [class*='group flex items-center justify-between']");
    dataRows.forEach((row) => {
      const leftEl = row.querySelector("div:first-child");
      const rightEl = row.querySelector(".tnum");
      const text = leftEl?.textContent?.trim().replace(/"/g, '""') || "";
      const amount = rightEl?.textContent?.trim().replace(/"/g, '""') || "";
      csvContent += `"${text}","${amount}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${title.toLowerCase().replace(/\s+/g, "_")}_${periodName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. TOP NAVIGATION & PAGE HEADER (Gambar 2 Reference, Hidden on Print) */}
      <div className="print:hidden space-y-2">
        <div className="mb-2">
          <Link
            href="/laporan"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Pusat Laporan Keuangan
          </Link>
        </div>

        {/* Page Header Editorial Sesuai Gambar 2 */}
        <div className="border-b border-rule/60 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-ink-soft mt-1">
              {subtitle}
            </p>
          </div>
          {isPending && (
            <div className="flex items-center gap-2 text-xs font-semibold text-terra animate-pulse">
              <Loader2 className="size-4 animate-spin" />
              <span>Memuat data periode...</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. 2-COLUMN LAYOUT: KIRI DOKUMEN LAPORAN, KANAN PANEL AKSI (Hidden on Print / Full-Width on Print) */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* KOLOM KIRI: LEMBAR LAPORAN KEUANGAN FORMAL (PAPER & INK SHEET) */}
        <div className="w-full lg:flex-1 min-w-0">
          <article className={cn(
            "w-full rounded-2xl sm:rounded-3xl border-2 border-rule/90 bg-paper p-6 sm:p-10 md:p-14 shadow-md transition-all duration-300 print:border-none print:shadow-none print:p-0 print:m-0",
            isPending && "opacity-60 scale-[0.99] pointer-events-none"
          )}>
        {/* KOP RESMI LAPORAN KEUANGAN SAK EMKM */}
        <header className="border-b-4 border-double border-ink/90 pb-6 mb-8 text-center space-y-2.5 print:pb-4 print:mb-6">
          <p className="font-display text-lg sm:text-xl font-bold uppercase tracking-wider text-ink">
            {entityName}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold text-ink uppercase tracking-tight">
            {title}
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-ink-soft">
            {periodDateRange
              ? `Untuk Periode yang Berakhir pada ${formatIndonesianDate(periodDateRange.endsOn)}`
              : `Periode Buku ${periodName}`}
          </p>
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-ink-soft italic border-t border-rule/70 mt-3">
            <span className="font-medium not-italic text-ink-soft/90">{subtitle}</span>
            <span className="font-semibold font-sans not-italic text-ink">
              (Disajikan dalam Rupiah, kecuali dinyatakan lain)
            </span>
          </div>
        </header>

        {/* SUB-HEADER TABEL DATA KEUANGAN (Clarify & Layout) */}
        {!hideTableHeader && (
          <div className="flex items-center justify-between border-b-2 border-ink/80 pb-2 mb-4 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            <span>Rincian Akun &amp; Pos Keuangan</span>
            <span className="text-right">Jumlah (Rupiah)</span>
          </div>
        )}

        {/* ISI LAPORAN */}
        <main className="space-y-7 print:space-y-4">{children}</main>

        {/* TANDA TANGAN / PENGESAHAN LAPORAN SAK EMKM (Formal Document Footer) */}
        <footer className="mt-14 pt-8 border-t-2 border-rule/80 text-xs text-ink-soft print:mt-8 print:pt-6">
          <div className="grid grid-cols-2 gap-8 text-center sm:text-left">
            <div>
              <p className="font-semibold text-ink uppercase tracking-wider text-[11px]">Catatan Kepatuhan Resmi:</p>
              <p className="text-[11px] leading-relaxed text-ink-soft mt-1.5">
                Laporan ini disusun secara otomatis oleh sistem Akunio berpedoman penuh pada Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM) yang diterbitkan oleh Ikatan Akuntan Indonesia (IAI).
              </p>
            </div>
            <div className="flex flex-col items-center sm:items-end justify-between">
              <div className="text-center sm:text-right">
                <p className="text-[11px] font-medium text-ink-soft">{entityName}</p>
                <p className="font-bold text-ink mt-0.5">Penanggung Jawab Keuangan</p>
                <div className="h-16 sm:h-20 w-36 border-b-2 border-ink/60 my-1.5 mx-auto sm:mr-0" />
                <p className="text-[11px] font-medium text-ink-soft">( Tanda Tangan &amp; Stempel Basah )</p>
              </div>
            </div>
          </div>
        </footer>
      </article>
    </div>

        {/* KOLOM KANAN: SIDEBAR AKSI & PENGATURAN LAPORAN (Hidden on Print) */}
        <aside className="print:hidden w-full lg:w-80 shrink-0 space-y-5 lg:sticky lg:top-6">
          {/* Card Panel Kontrol */}
          <div className="rounded-2xl border-2 border-rule bg-paper p-5 shadow-xs space-y-5">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ink">
                Pengaturan Periode
              </h2>
              <p className="text-xs text-ink-soft mt-0.5">
                Sesuaikan tanggal buku laporan
              </p>
            </div>

            {/* Pemilih Periode */}
            <div className="space-y-2">
              <label htmlFor="period-select" className="text-xs font-semibold text-ink flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-terra" />
                  <span>Periode Pembukuan:</span>
                </span>
                {isPending && <Loader2 className="size-3.5 animate-spin text-terra" />}
              </label>
              <select
                id="period-select"
                name="period"
                value={periodName}
                onChange={handlePeriodChange}
                disabled={isPending}
                className="w-full h-9 rounded-xl border-2 border-rule bg-canvas px-3 text-xs font-bold text-ink shadow-2xs hover:border-terra focus:ring-2 focus:ring-terra/30 focus-visible:ring-2 focus-visible:ring-terra focus-visible:border-terra focus:outline-none cursor-pointer transition-colors disabled:opacity-50"
              >
                {options.map((o) => (
                  <option key={o.name} value={o.name}>
                    Periode {o.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Keseimbangan (Balanced Check) */}
            {isBalanced !== undefined && (
              <div
                className={cn(
                  "flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium",
                  isBalanced
                    ? "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700/50"
                    : "bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-700/50",
                )}
              >
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Neraca Seimbang</p>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                        Total Debit sama persis dengan Total Kredit (Aset = Liabilitas + Ekuitas).
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Tidak Seimbang</p>
                      <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5">
                        Terdapat selisih pada pembukuan. Periksa kembali{" "}
                        <Link href="/jurnal" className="underline font-bold text-rose-950 dark:text-rose-100 hover:text-terra">
                          entri jurnal penyesuaian
                        </Link>.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tombol Aksi: Cetak PDF & Ekspor CSV & Custom Actions */}
            <div className="pt-3 border-t border-rule/80 space-y-2.5">
              {actions}

              <Button
                type="button"
                onClick={() => window.print()}
                className="w-full h-10 px-4 text-xs font-bold rounded-xl bg-terra text-white hover:bg-terra/90 shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Printer className="size-4 text-white" />
                <span>Cetak / Unduh PDF Resmi</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleExportCsv}
                className="w-full h-9 px-4 text-xs font-semibold rounded-xl border-rule bg-canvas hover:bg-canvas/80 text-ink shadow-2xs transition-all flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Ekspor Spreadsheet (.CSV)</span>
              </Button>
            </div>
          </div>

          {/* Info Card Kepatuhan SAK EMKM */}
          <div className="rounded-2xl border border-rule/80 bg-canvas/60 p-4 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-terra" />
              <span className="font-bold text-ink">Standar SAK EMKM IAI</span>
            </div>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              Format penyajian mengacu pada standar akuntansi keuangan resmi bagi entitas mikro, kecil, dan menengah di Indonesia.
            </p>
          </div>
        </aside>
      </div>
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
  tooltip,
  variant = "normal",
}: {
  code?: string;
  label: string;
  minor: bigint;
  bold?: boolean;
  indent?: 1 | 2 | boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  tooltip?: string;
  variant?: "normal" | "subtotal" | "header" | "grand-total";
}) {
  const indentClass =
    indent === 2
      ? "pl-6 sm:pl-10"
      : indent === 1 || indent === true
      ? "pl-3 sm:pl-6"
      : "pl-0";

  return (
    <div
      className={cn(
        "group flex items-center justify-between py-2 transition-colors text-xs sm:text-sm",
        indentClass,
        (bold || variant === "subtotal" || variant === "grand-total") && "font-bold text-ink",
        !bold && variant === "normal" && "text-ink/90 hover:bg-canvas/50 rounded-lg px-2 -mx-2",
        isTotal && "border-t-2 border-ink/40 pt-2.5 mt-1.5 font-bold text-ink",
        isGrandTotal && "rule-double pt-3 mt-2.5 font-extrabold text-sm sm:text-base text-ink bg-canvas/30 px-2 rounded-lg -mx-2",
      )}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 truncate pr-2 sm:pr-4">
        {code && (
          <span className="font-mono text-[11px] text-ink-soft font-normal shrink-0">
            {code}
          </span>
        )}
        <span className="truncate">{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-ink-soft/70 hover:text-terra transition-colors focus:outline-none shrink-0"
              >
                <HelpCircle className="size-3" />
                <span className="sr-only">Penjelasan {label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left text-[11px] leading-relaxed p-2.5">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="text-right shrink-0">
        <span
          className={cn(
            "tnum font-mono tabular-nums text-right inline-block min-w-[100px] sm:min-w-[120px]",
            minor < 0n ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-ink",
            (bold || isTotal || isGrandTotal) && "font-bold text-ink",
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
        "flex items-center justify-between border-b-2 border-ink/80 pb-2 mt-8 mb-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-terra" />
        <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-ink">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/**
 * Empty state informatif dengan tombol navigasi pencatatan
 */
export function ReportEmptyState({
  message = "Tidak ada saldo tercatat pada pos ini.",
  actionHref = "/jurnal/baru",
  actionLabel = "Catat Transaksi",
}: {
  message?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pl-4 pr-2 py-2 rounded-xl bg-canvas/30 border border-dashed border-rule/70 text-xs text-ink-soft">
      <span className="italic">{message}</span>
      {actionHref && (
        <Link
          href={actionHref}
          className="print:hidden inline-flex items-center gap-1 text-[11px] font-semibold text-terra hover:underline transition-colors shrink-0 ml-2"
        >
          <PlusCircle className="size-3" />
          <span>{actionLabel}</span>
        </Link>
      )}
    </div>
  );
}
