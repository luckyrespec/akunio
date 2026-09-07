"use client";

import { useState } from "react";
import Link from "next/link";
import { Money } from "@/core/money/money";
import {
  IconArrowRight,
  IconCircleCheck,
  IconFileSpreadsheet,
  IconFlame,
  IconInfo,
  IconLayers,
  IconAlertTriangle,
  IconFileWarning,
  IconScale,
  IconShieldAlert,
  IconShieldCheck,
  IconSparkles,
  IconRefresh,
  IconReview,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Reveal, Stagger, staggerItem } from "@/components/motion";
import { GlowCard } from "@/components/aceternity/glow-card";
import { BookOpen } from "lucide-react";
import { motion } from "motion/react";
import { triggerDoctorScanAction } from "./actions";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  evidenceValueText,
  formatFindingDate,
  severityMeta,
  typeMetadata,
  type FindingView,
} from "./finding-meta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface TemuanClientProps {
  initialFindings: FindingView[];
  stats: {
    totalScanned: number;
    openCount: number;
    resolvedCount: number;
    dismissedCount: number;
  };
}

const TYPE_ICONS: Record<string, typeof IconInfo> = {
  abnormalBalances: IconScale,
  duplicates: IconLayers,
  missingReceipts: IconFileWarning,
  oddDates: IconAlertTriangle,
  ratioAnomalies: IconShieldAlert,
};

function summarizeEvidenceDetailed(type: string, evidence: Record<string, unknown> | null) {
  if (!evidence) return "Tidak ada data rincian bukti tambahan.";
  try {
    if (type === "abnormalBalances" && typeof evidence.code === "string") {
      return `Akun dengan kode ${evidence.code} memiliki nilai saldo yang berada di sisi berlawanan aturan akuntansi.`;
    }
    if (type === "duplicates") {
      const memo = typeof evidence.memo === "string" ? `"${evidence.memo}"` : "transaksi terkait";
      return `Duplikasi entri terdeteksi pada ${memo}. Perlu diperiksa apakah terjadi dobel entri dari mutasi rekening.`;
    }
    if (type === "missingReceipts") {
      const memo = typeof evidence.memo === "string" ? ` pada jurnal "${evidence.memo}"` : "";
      const amt = typeof evidence.amountMinor === "string" ? ` ${Money.fromMinor(BigInt(evidence.amountMinor)).formatIdr()}` : "";
      return `Pengeluaran material${amt}${memo} belum diverifikasi dengan lampiran dokumen sah.`;
    }
    if (type === "oddDates") {
      const date = typeof evidence.dateISO === "string" ? ` tanggal ${evidence.dateISO}` : "";
      return `Entri dibukukan pada${date} di luar rentang tanggal buku yang aktif (OPEN).`;
    }
    if (type === "ratioAnomalies") {
      return "Terjadi deviasi signifikan pada volume debit/kredit yang melebihi batas batas ambang deviasi.";
    }
  } catch {
    /* fallback generic */
  }
  const keys = Object.entries(evidence).filter(([k]) => k !== "entryId");
  return keys
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" • ");
}

export function TemuanClient({ initialFindings, stats }: TemuanClientProps) {
  const router = useRouter();
  const [findings, setFindings] = useState<FindingView[]>(initialFindings);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "dismissed">("open");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [isScanning, setIsScanning] = useState(false);
  
  // State untuk modal hasil pemindaian
  const [scanResult, setScanResult] = useState<{
    totalScanned: number;
    healthScore: number;
    newFindingsCount: number;
    breakdown: {
      abnormalBalances: number;
      duplicates: number;
      missingReceipts: number;
      oddDates: number;
    };
  } | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Filter temuan berdasarkan status
  const openFindings = findings.filter((f) => f.status === "open");
  const resolvedFindings = findings.filter((f) => f.status === "resolved");
  const dismissedFindings = findings.filter((f) => f.status === "dismissed");

  const activeFindings = statusFilter === "open"
    ? openFindings
    : statusFilter === "resolved"
    ? resolvedFindings
    : dismissedFindings;

  // Kalkulasi Skor Kesehatan Buku (Health Score) — hanya temuan OPEN yang mengurangi skor
  const openHigh = openFindings.filter((f) => f.severity === "HIGH").length;
  const openMedium = openFindings.filter((f) => f.severity === "MEDIUM").length;
  const openLow = openFindings.filter((f) => f.severity === "LOW").length;

  const penalty = openHigh * 18 + openMedium * 8 + openLow * 4;
  const healthScore = Math.max(10, Math.min(100, 100 - penalty));

  // Hitung jumlah severity dalam tab yang sedang aktif
  const highCount = activeFindings.filter((f) => f.severity === "HIGH").length;
  const mediumCount = activeFindings.filter((f) => f.severity === "MEDIUM").length;
  const lowCount = activeFindings.filter((f) => f.severity === "LOW").length;

  const visibleFindings = severityFilter === "ALL"
    ? activeFindings
    : activeFindings.filter((f) => f.severity === severityFilter);

  // Trigger Scan Manual
  async function handleTriggerScan() {
    setIsScanning(true);
    setScanError(null);
    try {
      const res = await triggerDoctorScanAction();
      if (res.ok && res.data) {
        setScanResult({
          totalScanned: res.data.totalScannedEntries,
          healthScore: res.data.healthScore,
          newFindingsCount: res.data.newFindingsCount,
          breakdown: res.data.breakdown,
        });
        if (res.data.allFindings) {
          setFindings(res.data.allFindings as FindingView[]);
        } else if (res.data.openFindings) {
          setFindings(res.data.openFindings as FindingView[]);
        }
        setScanModalOpen(true);
        router.refresh();
      } else {
        setScanError(res.error ?? "Gagal memindai pembukuan.");
        setScanModalOpen(true);
      }
    } catch {
      setScanError("Terjadi kesalahan koneksi saat memindai.");
      setScanModalOpen(true);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. KARTU STATUS KESEHATAN PEMBUKUAN (SCORECARD) */}
      <Reveal>
        <div className="matte-card relative overflow-hidden rounded-2xl border border-rule bg-paper p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Sisi Kiri: Skor & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              {/* Cincin Visual Skor Kesehatan */}
              <div className="relative flex size-24 sm:size-28 shrink-0 flex-col items-center justify-center rounded-2xl border border-rule/80 bg-canvas/70 p-2 shadow-2xs">
                <span className="tnum font-display text-4xl sm:text-5xl font-bold tracking-tight text-ink leading-none">
                  {healthScore}
                  <span className="text-xs font-normal text-ink-soft">%</span>
                </span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                  Kesehatan
                </span>
                {healthScore >= 85 ? (
                  <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-debit text-paper shadow-xs">
                    <IconShieldCheck className="size-2.5" />
                  </span>
                ) : (
                  <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-terra text-paper shadow-xs">
                    <IconFlame className="size-2.5" />
                  </span>
                )}
              </div>

              {/* Uraian Status Diagnostik */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-ink">
                    {healthScore >= 90
                      ? "Pembukuan Sangat Sehat & Tertib"
                      : healthScore >= 70
                      ? "Pembukuan Perlu Penyesuaian Ringan"
                      : "Peringatan Integritas: Temuan Kritis Terdeteksi"}
                  </h2>
                </div>
                <p className="max-w-xl text-xs sm:text-sm text-ink-soft leading-relaxed">
                  Pemeriksa pembukuan meninjau konsistensi jurnal, saldo abnormal pada akun neraca, kelengkapan bukti transaksi,
                  serta pisah batas periode pelaporan secara berkala.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <IconFileSpreadsheet className="size-3.5 text-terra" />
                    <span className="tnum font-medium text-ink">{stats.totalScanned}</span> Jurnal Terekam
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("open");
                      setSeverityFilter("ALL");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer",
                      statusFilter === "open"
                        ? "bg-canvas font-semibold text-ink border border-rule/70"
                        : "hover:text-ink",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", openFindings.length > 0 ? "bg-terra" : "bg-debit")} />
                    <span className="tnum font-medium text-ink">{openFindings.length}</span> Perlu Tindakan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("resolved");
                      setSeverityFilter("ALL");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer",
                      statusFilter === "resolved"
                        ? "bg-canvas font-semibold text-debit border border-debit/30"
                        : "hover:text-ink",
                    )}
                  >
                    <span className="size-2 rounded-full bg-debit" />
                    <span className="tnum font-medium text-ink">{resolvedFindings.length}</span> Terselesaikan
                  </button>
                </div>
              </div>
            </div>

            {/* Sisi Kanan: Tombol Tindakan Pindai Ulang */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <Button
                variant="outline"
                onClick={handleTriggerScan}
                disabled={isScanning}
                className="group relative flex items-center justify-center gap-2 rounded-xl border-rule/80 bg-canvas/40 px-4 py-2.5 text-xs font-semibold text-ink hover:border-terra/40 hover:bg-canvas transition-colors shadow-2xs cursor-pointer"
              >
                <IconRefresh className={cn("size-3.5 text-terra transition-transform", isScanning && "animate-spin")} />
                <span>{isScanning ? "Memindai Jurnal..." : "Pindai Ulang Sekarang"}</span>
              </Button>
            </div>
          </div>
        </div>
      </Reveal>

      {/* 2. TAB NAVIGASI STATUS & FILTER TINGKAT KEPARAHAN */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigasi Status Utama (Perlu Tindakan vs Riwayat Selesai) */}
        <div
          className="flex items-center gap-1 rounded-xl border border-rule bg-paper p-1 text-xs shadow-2xs w-fit"
          role="tablist"
          aria-label="Filter status temuan"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "open"}
            onClick={() => {
              setStatusFilter("open");
              setSeverityFilter("ALL");
            }}
            disabled={isScanning}
            className={cn(
              "rounded-lg px-3.5 py-1.5 font-medium transition-colors focus-ring flex items-center gap-2 cursor-pointer",
              statusFilter === "open"
                ? "bg-canvas text-ink font-semibold shadow-2xs border border-rule/70"
                : "text-ink-soft hover:text-ink hover:bg-canvas/50",
              isScanning && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className={cn("size-2 rounded-full", openFindings.length > 0 ? "bg-terra" : "bg-debit")} />
            <span>Perlu Tindakan</span>
            <span
              className={cn(
                "tnum text-[11px] rounded-full px-1.5 py-0.2 font-semibold",
                statusFilter === "open" ? "bg-terra/15 text-terra" : "bg-canvas text-ink-soft",
              )}
            >
              {openFindings.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "resolved"}
            onClick={() => {
              setStatusFilter("resolved");
              setSeverityFilter("ALL");
            }}
            disabled={isScanning}
            className={cn(
              "rounded-lg px-3.5 py-1.5 font-medium transition-colors focus-ring flex items-center gap-2 cursor-pointer",
              statusFilter === "resolved"
                ? "bg-canvas text-debit font-semibold shadow-2xs border border-debit/30"
                : "text-ink-soft hover:text-ink hover:bg-canvas/50",
              isScanning && "opacity-50 cursor-not-allowed",
            )}
          >
            <IconCircleCheck className="size-3.5 text-debit" />
            <span>Riwayat Terselesaikan</span>
            <span
              className={cn(
                "tnum text-[11px] rounded-full px-1.5 py-0.2 font-semibold",
                statusFilter === "resolved" ? "bg-debit/15 text-debit" : "bg-canvas text-ink-soft",
              )}
            >
              {resolvedFindings.length}
            </span>
          </button>

          {dismissedFindings.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "dismissed"}
              onClick={() => {
                setStatusFilter("dismissed");
                setSeverityFilter("ALL");
              }}
              disabled={isScanning}
              className={cn(
                "rounded-lg px-3 py-1.5 font-medium transition-colors focus-ring flex items-center gap-1.5 cursor-pointer",
                statusFilter === "dismissed"
                  ? "bg-canvas text-ink font-semibold shadow-2xs border border-rule/70"
                  : "text-ink-soft hover:text-ink hover:bg-canvas/50",
                isScanning && "opacity-50 cursor-not-allowed",
              )}
            >
              <span>Diabaikan</span>
              <span className="tnum text-[11px] rounded-full bg-canvas px-1.5 py-0.2 text-ink-soft">
                {dismissedFindings.length}
              </span>
            </button>
          )}
        </div>

        {/* Filter Tingkat Keparahan (Pill Tabs) */}
        <div
          className="flex items-center gap-1 rounded-xl border border-rule/70 bg-paper/60 p-1 text-xs shadow-2xs w-fit"
          role="tablist"
          aria-label="Filter tingkat keparahan"
        >
          {(
            [
              { key: "ALL", label: "Semua", count: activeFindings.length },
              { key: "HIGH", label: "Kritis", count: highCount },
              { key: "MEDIUM", label: "Perhatian", count: mediumCount },
              { key: "LOW", label: "Informasi", count: lowCount },
            ] as const
          ).map((s) => {
            const isTabActive = severityFilter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                onClick={() => setSeverityFilter(s.key)}
                disabled={isScanning}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition-colors focus-ring flex items-center gap-1.5 cursor-pointer",
                  isTabActive
                    ? "bg-canvas text-terra font-semibold shadow-2xs border border-rule/60"
                    : "text-ink-soft hover:text-ink hover:bg-canvas/50",
                  isScanning && "opacity-50 cursor-not-allowed",
                )}
              >
                <span>{s.label}</span>
                <span
                  className={cn(
                    "tnum text-[10px] rounded-full px-1.5 py-0.2",
                    isTabActive ? "bg-terra/15 text-terra font-bold" : "bg-canvas text-ink-soft",
                  )}
                >
                  {s.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. DAFTAR TEMUAN: TABEL UTAMA (DESKTOP) & KARTU RESPONSIVE (MOBILE) */}
      {isScanning ? (
        /* SKELETON LOADER SELAMA PROSES PINDAI ULANG */
        <div className="space-y-3" aria-label="Memindai buku besar...">
          <div className="flex items-center gap-2 px-1 py-1 text-xs font-semibold text-terra animate-pulse">
            <IconRefresh className="size-4 animate-spin" />
            <span>Sedang memeriksa transaksi dan menganalisis kepatuhan SAK EMKM...</span>
          </div>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="matte-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-rule bg-paper p-4"
            >
              <div className="flex items-start gap-3.5 flex-1">
                <Skeleton className="size-9 rounded-lg shrink-0" />
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-3 w-16 rounded-md" />
                  </div>
                  <Skeleton className="h-3 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-44 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-7 w-28 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      ) : visibleFindings.length === 0 ? (
        <Reveal>
          <div className="matte-card flex flex-col items-center justify-center rounded-2xl border border-rule bg-paper px-6 py-16 text-center shadow-xs">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-full mb-3",
                statusFilter === "resolved" ? "bg-canvas text-debit border border-rule" : "bg-debit/10 text-debit",
              )}
            >
              {statusFilter === "resolved" ? (
                <IconShieldCheck className="size-6 text-debit" />
              ) : (
                <IconCircleCheck className="size-6" />
              )}
            </div>
            <h3 className="font-display text-base font-semibold text-ink">
              {statusFilter === "open"
                ? severityFilter === "ALL"
                  ? "Tidak Ada Temuan yang Perlu Tindakan"
                  : `Tidak ada temuan terbuka dengan tingkat keparahan ${severityFilter}.`
                : statusFilter === "resolved"
                ? severityFilter === "ALL"
                  ? "Belum Ada Riwayat Temuan yang Terselesaikan"
                  : `Tidak ada temuan selesai dengan tingkat keparahan ${severityFilter}.`
                : "Tidak Ada Temuan yang Diabaikan"}
            </h3>
            <p className="mt-1.5 max-w-md text-xs text-ink-soft leading-relaxed">
              {statusFilter === "open"
                ? "Semua entri jurnal dan akun neraca telah berada dalam batas kepatuhan standar akuntansi tanpa anomali terbuka."
                : statusFilter === "resolved"
                ? "Temuan yang telah Anda bereskan, posting koreksinya, atau tandai selesai akan tersimpan rapi di sini untuk rekam jejak audit."
                : "Temuan yang Anda abaikan akan dikelompokkan di sini."}
            </p>
          </div>
        </Reveal>
      ) : (
        <Reveal>
          <div className="space-y-4">
            {/* Tampilan Kartu Mobile (< sm) */}
            <div className="space-y-3 sm:hidden">
              {visibleFindings.map((f) => {
                const meta = typeMetadata(f.type);
                const Icon = TYPE_ICONS[f.type] ?? IconInfo;
                const sev = severityMeta(f.severity);
                const dateFormatted = formatFindingDate(f.createdAt);
                const summary = summarizeEvidenceDetailed(f.type, f.evidence);
                const isResolved = f.status === "resolved";
                const isDismissed = f.status === "dismissed";

                return (
                  <div
                    key={f.id}
                    onClick={() => router.push(`/temuan/${f.id}`)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors space-y-3 cursor-pointer",
                      isResolved
                        ? "border-rule/70 bg-paper/80"
                        : isDismissed
                        ? "border-rule/60 bg-canvas/30 opacity-75"
                        : "border-rule bg-paper hover:border-terra/40",
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-rule/50 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            isResolved
                              ? "bg-debit/10 text-debit border-debit/30"
                              : isDismissed
                              ? "bg-canvas text-ink-soft border-rule"
                              : sev.badgeClass,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", isResolved ? "bg-debit" : sev.dot)} />
                          {isResolved ? "Terselesaikan" : isDismissed ? "Diabaikan" : sev.label}
                        </span>
                        <span className="text-[11px] text-ink-soft">{dateFormatted}</span>
                      </div>
                      <IconArrowRight className="size-3.5 text-ink-soft" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-terra shrink-0" />
                        <h4 className="font-semibold text-sm text-ink">{meta.label}</h4>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft line-clamp-2 leading-relaxed">{summary}</p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-1 text-ink-soft">
                      <span className="font-mono bg-canvas px-2 py-0.5 rounded border border-rule/70 truncate max-w-[200px]">
                        Ref: {meta.standard}
                      </span>
                      <span className="font-semibold text-terra inline-flex items-center gap-1">
                        <IconReview className="size-3" />
                        <span>Tinjau</span>
                        <IconArrowRight className="size-2.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tampilan Tabel Utama Impeccable (>= sm) */}
            <div className="hidden sm:block">
              <GlowCard>
                <div className="overflow-x-auto rounded-2xl border border-rule bg-paper shadow-xs">
                  <table className="w-full tnum text-sm">
                    <thead>
                      <tr className="border-b border-rule bg-canvas/80 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        <th className="px-4 py-3.5 w-36 whitespace-nowrap">Tingkat &amp; Status</th>
                        <th className="px-4 py-3.5 min-w-[280px]">Diagnosa &amp; Temuan</th>
                        <th className="px-4 py-3.5 hidden md:table-cell max-w-[220px]">Rujukan Standar</th>
                        <th className="px-4 py-3.5 w-28 whitespace-nowrap text-right">Tanggal</th>
                        <th className="px-4 py-3.5 w-28 text-center whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule/60">
                      {visibleFindings.map((f) => {
                        const meta = typeMetadata(f.type);
                        const Icon = TYPE_ICONS[f.type] ?? IconInfo;
                        const sev = severityMeta(f.severity);
                        const dateFormatted = formatFindingDate(f.createdAt);
                        const summary = summarizeEvidenceDetailed(f.type, f.evidence);
                        const isResolved = f.status === "resolved";
                        const isDismissed = f.status === "dismissed";

                        return (
                          <tr
                            key={f.id}
                            onClick={() => router.push(`/temuan/${f.id}`)}
                            className={cn(
                              "group transition-colors cursor-pointer",
                              isResolved
                                ? "hover:bg-canvas/30"
                                : isDismissed
                                ? "opacity-75 hover:opacity-100 hover:bg-canvas/30"
                                : "hover:bg-terra/[0.03]",
                            )}
                          >
                            {/* Tingkat Keparahan & Status */}
                            <td className="px-4 py-3.5 align-top whitespace-nowrap">
                              <div className="space-y-1.5">
                                <div>
                                  {isResolved ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-debit/30 bg-debit/10 px-2.5 py-0.5 text-[11px] font-semibold text-debit shadow-2xs">
                                      <span className="size-1.5 rounded-full bg-debit" />
                                      Terselesaikan
                                    </span>
                                  ) : isDismissed ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
                                      Diabaikan
                                    </span>
                                  ) : (
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-2xs",
                                        sev.badgeClass,
                                      )}
                                    >
                                      <span className={cn("size-1.5 rounded-full", sev.dot)} />
                                      {sev.label}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-ink-soft/70 font-mono">
                                  #{f.id.slice(0, 8)}
                                </div>
                              </div>
                            </td>

                            {/* Diagnosa & Deskripsi Temuan */}
                            <td className="px-4 py-3.5 align-top">
                              <div className="flex items-start gap-3">
                                <div
                                  className={cn(
                                    "flex size-8 shrink-0 items-center justify-center rounded-lg border shadow-2xs mt-0.5",
                                    isResolved
                                      ? "border-debit/20 bg-debit/10 text-debit"
                                      : "border-rule/80 bg-canvas text-terra",
                                  )}
                                >
                                  {isResolved ? (
                                    <IconCircleCheck className="size-4 text-debit" />
                                  ) : (
                                    <Icon className="size-4" />
                                  )}
                                </div>
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="font-semibold text-sm text-ink group-hover:text-terra transition-colors leading-snug">
                                    {meta.label}
                                  </div>
                                  <p className="text-xs text-ink-soft line-clamp-2 leading-relaxed" title={summary}>
                                    {summary}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Rujukan Standar */}
                            <td className="px-4 py-3.5 align-top hidden md:table-cell">
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 rounded-md border border-rule bg-canvas/60 px-2 py-0.5 text-[10px] font-mono text-ink-soft group-hover:border-terra/30 transition-colors">
                                  <BookOpen className="size-2.5 text-terra shrink-0" />
                                  <span className="truncate max-w-[180px]" title={meta.standard}>
                                    {meta.standard}
                                  </span>
                                </span>
                                <div className="text-[10px] text-ink-soft/70 truncate">
                                  Bab {meta.bab}: {meta.babTitle}
                                </div>
                              </div>
                            </td>

                            {/* Tanggal */}
                            <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                              <span className="text-xs text-ink-soft font-mono">
                                {dateFormatted}
                              </span>
                            </td>

                            {/* Aksi */}
                              <td className="px-4 py-3.5 align-top text-center whitespace-nowrap">
                                <Button
                                  size="sm"
                                  variant={isResolved ? "outline" : "default"}
                                  className={cn(
                                    "h-7 text-xs px-3 shadow-2xs transition-all duration-150 cursor-pointer gap-1.5",
                                    isResolved
                                      ? "border-rule text-ink hover:border-terra/40 hover:text-terra"
                                      : "bg-terra text-white hover:bg-terra/90",
                                  )}
                                >
                                  <IconReview className="size-3.5" />
                                  <span>{isResolved ? "Detail" : "Tinjau"}</span>
                                  <IconArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                                </Button>
                              </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlowCard>
            </div>
          </div>
        </Reveal>
      )}

      {/* 4. MODAL HASIL PEMINDAIAN AKUNIO DOCTOR */}
      <Dialog open={scanModalOpen} onOpenChange={setScanModalOpen}>
        <DialogContent className="max-w-md rounded-2xl border-rule bg-paper p-6 shadow-lg">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-terra/10 text-terra border border-terra/20">
                <IconSparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-serif text-lg font-bold text-ink">
                  {scanError ? "Pemeriksaan Terkendala" : "Hasil Pemeriksaan Pembukuan"}
                </DialogTitle>
                <DialogDescription className="text-xs text-ink-soft">
                  {scanError ? "Terjadi kendala saat menganalisis buku besar" : "Audit integritas buku selesai dijalankan"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {scanError ? (
            <div className="my-3 rounded-xl border border-terra/30 bg-terra/10 p-4 text-xs text-ink leading-relaxed">
              <p className="font-semibold text-terra">Keterangan Galat:</p>
              <p className="mt-1">{scanError}</p>
            </div>
          ) : scanResult ? (
            <div className="my-4 space-y-4">
              {/* Stat Ringkasan dalam Modal */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-rule/80 bg-canvas/60 p-3.5 text-center">
                  <span className="text-[11px] font-medium text-ink-soft uppercase tracking-wider block">
                    Skor Integritas
                  </span>
                  <span className="tnum font-serif text-3xl font-bold text-ink mt-0.5 block">
                    {scanResult.healthScore}%
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    {scanResult.healthScore >= 85 ? "Sangat Sehat" : "Perlu Penyesuaian"}
                  </span>
                </div>

                <div className="rounded-xl border border-rule/80 bg-canvas/60 p-3.5 text-center">
                  <span className="text-[11px] font-medium text-ink-soft uppercase tracking-wider block">
                    Jurnal Dipindai
                  </span>
                  <span className="tnum font-serif text-3xl font-bold text-ink mt-0.5 block">
                    {scanResult.totalScanned}
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    Transaksi Terverifikasi
                  </span>
                </div>
              </div>

              {/* Rincian temuan anomali */}
              <div className="rounded-xl border border-rule bg-canvas/40 p-3.5 space-y-2 text-xs">
                <span className="font-semibold text-ink text-[11px] uppercase tracking-wider block border-b border-rule/60 pb-1.5">
                  Rincian Anomali SAK EMKM:
                </span>
                <div className="grid grid-cols-2 gap-2 text-ink-soft pt-1">
                  <div className="flex items-center justify-between bg-paper px-2.5 py-1.5 rounded-lg border border-rule/50">
                    <span>Saldo Terbalik:</span>
                    <strong className="text-ink font-mono">{scanResult.breakdown.abnormalBalances}</strong>
                  </div>
                  <div className="flex items-center justify-between bg-paper px-2.5 py-1.5 rounded-lg border border-rule/50">
                    <span>Duplikasi Entri:</span>
                    <strong className="text-ink font-mono">{scanResult.breakdown.duplicates}</strong>
                  </div>
                  <div className="flex items-center justify-between bg-paper px-2.5 py-1.5 rounded-lg border border-rule/50">
                    <span>Tanpa Bukti Dok:</span>
                    <strong className="text-ink font-mono">{scanResult.breakdown.missingReceipts}</strong>
                  </div>
                  <div className="flex items-center justify-between bg-paper px-2.5 py-1.5 rounded-lg border border-rule/50">
                    <span>Di Luar Periode:</span>
                    <strong className="text-ink font-mono">{scanResult.breakdown.oddDates}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setScanModalOpen(false)}
              className="bg-terra text-white hover:bg-terra-hover px-5 text-xs font-semibold rounded-xl"
            >
              Lihat Daftar Temuan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
