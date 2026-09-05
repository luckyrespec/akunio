"use client";

import * as React from "react";
import Link from "next/link";
import {
  Percent,
  TrendingUp,
  ShieldCheck,
  Building2,
  User,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  CreditCard,
  ChevronRight,
  Loader2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import type { TaxSettings } from "@/core/tax/pph-final";
import { ANNUAL_INDIVIDUAL_THRESHOLD_MINOR } from "@/core/tax/pph-final";
import type { TaxSummaryView } from "@/server/db/repos/tax.repo";
import { generateTaxAccrualDraftAction } from "@/server/actions/tax.actions";
import { TaxSettlementModal, type TaxAccountOption } from "./tax-settlement-modal";

interface TaxDashboardProps {
  settings: TaxSettings;
  summaries: TaxSummaryView[];
  bankAccounts: TaxAccountOption[];
  currentYear: number;
  userRole?: string;
}

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function TaxDashboard({
  settings,
  summaries,
  bankAccounts,
  currentYear,
  userRole,
}: TaxDashboardProps) {
  const [activeSettlementPeriod, setActiveSettlementPeriod] = React.useState<TaxSummaryView | null>(null);
  const [loadingPeriod, setLoadingPeriod] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const canEdit = userRole === "OWNER" || userRole === "ACCOUNTANT";

  // Agregasi tahunan
  const totalGrossMinor = summaries.reduce((acc, s) => acc + s.grossRevenueMinor, 0n);
  const totalTaxDueMinor = summaries.reduce((acc, s) => acc + s.taxDueMinor, 0n);
  const totalTaxPaidMinor = summaries.reduce(
    (acc, s) => acc + (s.status === "PAID" ? s.taxDueMinor : 0n),
    0n
  );

  // Fasilitas 500 Juta untuk OP
  const isIndividual = settings.taxpayerType === "INDIVIDUAL";
  const thresholdMinor = ANNUAL_INDIVIDUAL_THRESHOLD_MINOR;
  const progressPercent = isIndividual
    ? Math.min(100, Math.round((Number(totalGrossMinor) / Number(thresholdMinor)) * 100))
    : 100;

  const handleGenerateDraft = async (periodMonth: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingPeriod(periodMonth);

    try {
      const res = await generateTaxAccrualDraftAction({ periodMonth });
      if (res.ok) {
        setSuccessMsg(
          res.message || `Draf akrual pajak masa ${periodMonth} berhasil dipersiapkan untuk peninjauan.`
        );
      } else {
        setErrorMsg(res.error || "Gagal membuat draf akrual pajak.");
      }
    } catch {
      setErrorMsg("Terjadi kendala saat menghubungi server.");
    } finally {
      setLoadingPeriod(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Pesan Notifikasi */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. Header Info Wajib Pajak & Pengaturan */}
      <div className="rounded-3xl border-2 border-rule/90 bg-paper p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-terra/10 border border-terra/25 text-terra flex items-center justify-center shrink-0">
            {isIndividual ? <User className="size-6" /> : <Building2 className="size-6" />}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-ink">
                {isIndividual ? "Wajib Pajak Orang Pribadi (UMKM)" : "Wajib Pajak Badan (PT / CV / Koperasi)"}
              </h2>
              <Badge variant="outline" className="text-xs font-mono font-bold border-rule bg-canvas/60 text-ink">
                Tahun Pajak {currentYear}
              </Badge>
            </div>
            <p className="text-xs text-ink-soft">
              NPWP: <span className="font-mono text-ink font-bold tracking-wider">{settings.npwp || "Belum Didaftarkan"}</span> • Tarif PPh Final:{" "}
              <strong className="text-terra font-bold">0,5%</strong> (PP No. 55 Tahun 2022 jo. UU HPP)
            </p>
          </div>
        </div>

        <Link
          href="/pengaturan?tab=pajak"
          className="text-xs font-bold text-terra hover:text-terra/80 hover:underline flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-xl border border-terra/20 bg-terra/5 transition-colors"
        >
          <span>Ubah Konfigurasi Pajak</span>
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {/* 2. Ringkasan Kartu Metrik Pajak */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Omzet Total */}
        <div className="rounded-2xl border-2 border-rule/90 bg-paper p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-soft text-xs font-semibold uppercase tracking-wider">
            <span>Peredaran Bruto</span>
            <TrendingUp className="size-4 text-terra" />
          </div>
          <div className="mt-3">
            <div className="font-mono text-xl sm:text-2xl font-extrabold text-ink tnum tracking-tight">
              {Money.fromMinor(totalGrossMinor).formatIdr()}
            </div>
            <p className="text-[11px] font-medium text-ink-soft mt-1">Akumulasi omzet tahun {currentYear}</p>
          </div>
        </div>

        {/* Fasilitas 500 Juta */}
        <div className="rounded-2xl border-2 border-rule/90 bg-paper p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-soft text-xs font-semibold uppercase tracking-wider">
            <span>Fasilitas Bebas Pajak</span>
            <ShieldCheck className="size-4 text-debit" />
          </div>
          <div className="mt-3">
            {isIndividual ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xl sm:text-2xl font-extrabold text-ink tnum">{progressPercent}%</span>
                  <span className="text-xs font-mono font-bold text-ink-soft">Maks. Rp 500 Jt</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-rule/60 overflow-hidden">
                  <div
                    className="h-full bg-terra rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] font-medium text-ink-soft mt-1.5">
                  {progressPercent >= 100 ? "Batas terlampaui, omzet di atasnya kena 0,5%" : "Omzet s.d. 500jt bebas pajak"}
                </p>
              </>
            ) : (
              <>
                <div className="font-display text-lg font-bold text-ink">Tidak Berlaku</div>
                <p className="text-[11px] font-medium text-ink-soft mt-1">Badan usaha dikenai 0,5% dari rupiah pertama</p>
              </>
            )}
          </div>
        </div>

        {/* PPh Terutang */}
        <div className="rounded-2xl border-2 border-rule/90 bg-paper p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-soft text-xs font-semibold uppercase tracking-wider">
            <span>PPh Final Terutang</span>
            <Percent className="size-4 text-terra" />
          </div>
          <div className="mt-3">
            <div className="font-mono text-xl sm:text-2xl font-extrabold text-terra tnum tracking-tight">
              {Money.fromMinor(totalTaxDueMinor).formatIdr()}
            </div>
            <p className="text-[11px] font-medium text-ink-soft mt-1">Kewajiban pajak masa tahun {currentYear}</p>
          </div>
        </div>

        {/* PPh Telah Disetor */}
        <div className="rounded-2xl border-2 border-rule/90 bg-paper p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-soft text-xs font-semibold uppercase tracking-wider">
            <span>PPh Telah Disetor</span>
            <CreditCard className="size-4 text-debit" />
          </div>
          <div className="mt-3">
            <div className="font-mono text-xl sm:text-2xl font-extrabold text-debit tnum tracking-tight">
              {Money.fromMinor(totalTaxPaidMinor).formatIdr()}
            </div>
            <p className="text-[11px] font-medium text-ink-soft mt-1">
              {totalTaxDueMinor > totalTaxPaidMinor
                ? `Sisa belum disetor: ${Money.fromMinor(totalTaxDueMinor - totalTaxPaidMinor).formatIdr()}`
                : "Semua kewajiban pajak telah disetor"}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Tabel Rekapitulasi Bulanan Jan - Des */}
      <div className="rounded-3xl border-2 border-rule/90 bg-paper shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Kewajiban SPT Masa Pajak Bulanan</h3>
            <p className="text-xs text-ink-soft mt-0.5">
              Penyusunan akrual pajak bulanan dan pelunasan dengan Nomor Transaksi Penerimaan Negara (NTPN).
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rule bg-canvas/50">
            <span className="text-xs font-medium text-ink-soft">Tahun Pajak:</span>
            <span className="font-mono text-xs font-bold text-ink">{currentYear}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b-2 border-ink/80 bg-canvas/60 text-[11px] font-bold text-ink-soft uppercase tracking-wider">
                <th className="px-5 py-3">Masa Pajak</th>
                <th className="px-4 py-3 text-right">Peredaran Bruto</th>
                <th className="px-4 py-3 text-right">Dasar Pengenaan (DPP)</th>
                <th className="px-4 py-3 text-right">PPh Final (0,5%)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Bukti NTPN</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {MONTH_NAMES.map((monthName, idx) => {
                const monthNumStr = String(idx + 1).padStart(2, "0");
                const periodMonth = `${currentYear}-${monthNumStr}`;
                const summary = summaries.find((s) => s.periodMonth === periodMonth);

                const grossMinor = summary?.grossRevenueMinor ?? 0n;
                const taxableMinor = summary?.taxableRevenueMinor ?? 0n;
                const taxDueMinor = summary?.taxDueMinor ?? 0n;
                const status = summary?.status ?? "UNPROCESSED";
                const isCurrentLoading = loadingPeriod === periodMonth;

                return (
                  <tr key={periodMonth} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <Calendar className="size-3.5 text-ink-soft shrink-0" />
                        <span className="font-bold">{monthName} {currentYear}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono text-ink tnum">
                      {Money.fromMinor(grossMinor).formatIdr()}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono text-ink-soft tnum">
                      {Money.fromMinor(taxableMinor).formatIdr()}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-bold text-ink tnum">
                      {Money.fromMinor(taxDueMinor).formatIdr()}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      {status === "PAID" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <CheckCircle2 className="size-3" />
                          <span>Lunas (NTPN)</span>
                        </span>
                      ) : status === "ACCRUED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/50 dark:text-blue-300">
                          <span>Disetujui</span>
                        </span>
                      ) : status === "DRAFTED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300 bg-amber-50 dark:bg-amber-950/40">
                          <Clock className="size-3" />
                          <span>Draf Menunggu Review</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-ink-soft bg-canvas border border-rule">
                          <span>Belum Dihitung</span>
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 font-mono">
                      {summary?.ntpn ? (
                        <span className="font-bold text-ink tracking-wider px-2 py-0.5 rounded bg-canvas border border-rule/70">
                          {summary.ntpn}
                        </span>
                      ) : (
                        <span className="text-ink-soft/40">-</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        {status === "DRAFTED" && summary?.accrualDraftId ? (
                          <Link href={`/jurnal/ai/${summary.accrualDraftId}`}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] font-bold border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg shadow-2xs"
                            >
                              <FileText className="size-3 mr-1" />
                              Tinjau Draf
                            </Button>
                          </Link>
                        ) : null}

                        {(status === "ACCRUED" || (status === "DRAFTED" && taxDueMinor > 0n)) && summary && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canEdit}
                            onClick={() => setActiveSettlementPeriod(summary)}
                            className="h-7 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs"
                          >
                            <CreditCard className="size-3 mr-1" />
                            Catat NTPN
                          </Button>
                        )}

                        {(status === "UNPROCESSED" || (!summary?.accrualDraftId && status !== "PAID")) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canEdit || isCurrentLoading}
                            onClick={() => handleGenerateDraft(periodMonth)}
                            className="h-7 px-2.5 text-[11px] font-semibold text-ink border-rule bg-canvas hover:bg-canvas/80 rounded-lg shadow-2xs"
                          >
                            {isCurrentLoading ? (
                              <Loader2 className="size-3 animate-spin mr-1 text-terra" />
                            ) : null}
                            <span>Hitung &amp; Buat Draf</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Pencatatan NTPN */}
      {activeSettlementPeriod && (
        <TaxSettlementModal
          open={!!activeSettlementPeriod}
          onOpenChange={(open) => {
            if (!open) setActiveSettlementPeriod(null);
          }}
          periodMonth={activeSettlementPeriod.periodMonth}
          taxDueMinor={activeSettlementPeriod.taxDueMinor}
          bankAccounts={bankAccounts}
          onSuccess={() => {
            setSuccessMsg(`Pelunasan pajak masa ${activeSettlementPeriod.periodMonth} berhasil dicatat.`);
          }}
        />
      )}
    </div>
  );
}
