"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Reveal, Stagger, staggerItem } from "@/components/motion";
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
    if (type === "missingReceipts" && evidence.amountMinor !== undefined) {
      let amt: string;
      try {
        amt = evidenceValueText(evidence.amountMinor, true);
      } catch {
        amt = String(evidence.amountMinor);
      }
      const num = evidence.entryNumber ? `(${evidence.entryNumber})` : "";
      return `Pengeluaran ${amt} pada jurnal ${num} belum diverifikasi dengan lampiran dokumen sah.`;
    }
    if (type === "oddDates" && typeof evidence.dateISO === "string") {
      return `Transaksi bertanggal ${evidence.dateISO} diposting di luar periode fiskal terbuka saat ini.`;
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
  const [findings] = useState<FindingView[]>(initialFindings);
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Kalkulasi Skor Kesehatan Buku (Health Score)
  const highCount = findings.filter((f) => f.severity === "HIGH").length;
  const mediumCount = findings.filter((f) => f.severity === "MEDIUM").length;
  const lowCount = findings.filter((f) => f.severity === "LOW").length;

  const penalty = highCount * 18 + mediumCount * 8 + lowCount * 4;
  const healthScore = Math.max(10, Math.min(100, 100 - penalty));

  const visibleFindings = severityFilter === "ALL"
    ? findings
    : findings.filter((f) => f.severity === severityFilter);

  // Trigger Scan Manual
  async function handleTriggerScan() {
    setIsScanning(true);
    setScanMessage(null);
    try {
      const res = await triggerDoctorScanAction();
      if (res.ok && res.data) {
        setScanMessage(
          `Pemeriksaan tuntas! ${res.data.totalScannedEntries} jurnal dipindai. Skor Integritas: ${res.data.healthScore}%.`,
        );
        router.refresh();
      } else {
        setScanMessage(res.error ?? "Gagal memindai pembukuan.");
      }
    } catch {
      setScanMessage("Terjadi kesalahan koneksi saat memindai.");
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
                  Doctor AI memeriksa konsistensi jurnal, saldo abnormal akun neraca, kepatuhan bukti pengeluaran,
                  serta batas periode pelaporan secara berkala.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <IconFileSpreadsheet className="size-3.5 text-terra" />
                    <span className="tnum font-medium text-ink">{stats.totalScanned}</span> Jurnal Terekam
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-terra" />
                    <span className="tnum font-medium text-ink">{findings.length}</span> Temuan Terbuka
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-debit" />
                    <span className="tnum font-medium text-ink">{stats.resolvedCount}</span> Terselesaikan
                  </span>
                </div>
              </div>
            </div>

            {/* Sisi Kanan: Tombol Tindakan Pindai Ulang */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <Button
                variant="outline"
                onClick={handleTriggerScan}
                disabled={isScanning}
                className="group relative flex items-center justify-center gap-2 rounded-xl border-rule/80 bg-canvas/40 px-4 py-2.5 text-xs font-semibold text-ink hover:border-terra/40 hover:bg-canvas transition-colors shadow-2xs"
              >
                <IconRefresh className={cn("size-3.5 text-terra transition-transform", isScanning && "animate-spin")} />
                <span>{isScanning ? "Memindai Jurnal..." : "Pindai Ulang Sekarang"}</span>
              </Button>
            </div>
          </div>

          {/* Notifikasi feedback hasil scan manual */}
          {scanMessage && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-2 rounded-xl border border-terra/30 bg-terra/[0.08] px-3.5 py-2 text-xs text-ink"
            >
              <IconSparkles className="size-3.5 text-terra shrink-0" />
              <span>{scanMessage}</span>
            </motion.div>
          )}
        </div>
      </Reveal>

      {/* 2. FILTER SEVERITY TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          className="flex items-center gap-1 rounded-xl border border-rule bg-paper p-1 text-xs shadow-2xs w-fit"
          role="tablist"
          aria-label="Filter tingkat keparahan"
        >
          {(
            [
              { key: "ALL", label: "Semua Temuan", count: findings.length },
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
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition-colors focus-ring flex items-center gap-1.5",
                  isTabActive
                    ? "bg-canvas text-terra font-semibold shadow-2xs border border-rule/60"
                    : "text-ink-soft hover:text-ink hover:bg-canvas/50",
                )}
              >
                <span>{s.label}</span>
                <span
                  className={cn(
                    "tnum text-[11px] rounded-full px-1.5 py-0.2",
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

      {/* 3. DAFTAR KARTU TEMUAN */}
      {visibleFindings.length === 0 ? (
        <Reveal>
          <div className="matte-card flex flex-col items-center justify-center rounded-2xl border border-rule bg-paper px-6 py-16 text-center shadow-xs">
            <div className="flex size-12 items-center justify-center rounded-full bg-debit/10 text-debit mb-3">
              <IconCircleCheck className="size-6" />
            </div>
            <h3 className="font-display text-base font-semibold text-ink">
              {severityFilter === "ALL"
                ? "Tidak Ada Temuan — Buku Besar Rapi"
                : `Tidak ada temuan dengan tingkat keparahan ${severityFilter}.`}
            </h3>
            <p className="mt-1.5 max-w-md text-xs text-ink-soft leading-relaxed">
              Semua entri jurnal berada dalam toleransi kepatuhan standar akuntansi dan kaidah debit/kredit yang wajar.
            </p>
          </div>
        </Reveal>
      ) : (
        <Stagger className="space-y-3">
          {visibleFindings.map((f) => {
            const meta = typeMetadata(f.type);
            const Icon = TYPE_ICONS[f.type] ?? IconInfo;
            const sev = severityMeta(f.severity);
            const dateFormatted = formatFindingDate(f.createdAt);
            const summary = summarizeEvidenceDetailed(f.type, f.evidence);

            return (
              <motion.div key={f.id} variants={staggerItem}>
                <Link
                  href={`/temuan/${f.id}`}
                  aria-label={`${meta.label}, ${sev.label}`}
                  className="matte-card group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-rule bg-paper p-4 text-left transition-all duration-200 hover:border-terra/40 hover:bg-canvas/50 hover:shadow-xs focus-ring"
                >
                  {/* Kolom Kiri: Ikon & Deskripsi Inti */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-rule/80 bg-canvas text-terra shadow-2xs mt-0.5">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink tracking-tight">
                          {meta.label}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            sev.badgeClass,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", sev.dot)} />
                          {sev.label}
                        </span>
                        <span className="text-[11px] text-ink-soft/70">
                          {dateFormatted}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft line-clamp-1 leading-normal" title={summary}>
                        {summary}
                      </p>
                      <div className="pt-0.5">
                        <span className="inline-block text-[10px] font-medium text-ink-soft/80 bg-canvas px-2 py-0.5 rounded border border-rule/50">
                          Standar: {meta.standard}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Kolom Kanan: Aksi Cepat / Preview */}
                  <div className="flex items-center justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-rule/40">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-terra group-hover:underline">
                      Periksa & Koreksi
                      <IconArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
