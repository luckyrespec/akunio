"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  AlertCircle,
  Loader2,
  CreditCard,
  ShieldCheck,
  Building2,
  User,
  UploadCloud,
  FileCheck,
  X,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import type { TaxSettings } from "@/core/tax/pph-final";
import { ANNUAL_INDIVIDUAL_THRESHOLD_MINOR } from "@/core/tax/pph-final";
import type { TaxSummaryView } from "@/server/db/repos/tax.repo";
import { acceptDraftAction } from "@/server/actions/ai.actions";
import {
  recordTaxPaymentAction,
  rejectTaxAccrualDraftAction,
} from "@/server/actions/tax.actions";
import { uploadDocumentAction } from "@/server/actions/upload.actions";

export interface BankAccountOption {
  id: string;
  code: string;
  name: string;
}

export interface TaxDraftReviewClientProps {
  periodMonth: string;
  summary: TaxSummaryView;
  draftData: {
    id: string;
    status: string;
    draft: {
      dateISO: string;
      memo: string;
      explanation: string;
      lines: Array<{
        accountCode: string;
        debitText: string;
        creditText: string;
        reason: string;
      }>;
    };
  } | null;
  settings: TaxSettings;
  bankAccounts: BankAccountOption[];
  userRole?: string;
}

export function TaxDraftReviewClient({
  periodMonth,
  summary,
  draftData,
  settings,
  bankAccounts,
  userRole,
}: TaxDraftReviewClientProps) {
  const router = useRouter();
  const canEdit = userRole === "OWNER" || userRole === "ACCOUNTANT";

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Mode Pelunasan Langsung (NTPN)
  const [enableDirectSettle, setEnableDirectSettle] = React.useState(false);
  const [ntpn, setNtpn] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = React.useState(() => bankAccounts[0]?.id ?? "");
  const [documentId, setDocumentId] = React.useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const isIndividual = settings.taxpayerType === "INDIVIDUAL";
  const grossRevenue = Money.fromMinor(summary.grossRevenueMinor);
  const cumulativeRevenue = Money.fromMinor(summary.cumulativeYearRevenueMinor);
  const taxableRevenue = Money.fromMinor(summary.taxableRevenueMinor);
  const taxDue = Money.fromMinor(summary.taxDueMinor);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran file bukti setor maksimal 5 MB.");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadDocumentAction(fd);
      if (res.ok && res.documentId) {
        setDocumentId(res.documentId);
        setUploadedFileName(file.name);
      } else {
        setErrorMsg(res.error || "Gagal mengunggah dokumen bukti setor.");
      }
    } catch {
      setErrorMsg("Gagal mengunggah dokumen. Silakan coba lagi.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setDocumentId(null);
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAcceptAccrual = () => {
    if (!draftData?.id) {
      setErrorMsg("Draf akrual tidak ditemukan.");
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const res = await acceptDraftAction(draftData.id, {
        dateISO: draftData.draft.dateISO,
        memo: draftData.draft.memo,
        lines: draftData.draft.lines.map((l) => ({
          accountId: "", // Diselesaikan otomatis di server action
          debitText: l.debitText,
          creditText: l.creditText,
        })),
      });

      if (res.ok) {
        // Jika user memilih untuk langsung melunasi dengan NTPN
        if (enableDirectSettle) {
          const cleanNtpn = ntpn.trim().toUpperCase();
          if (!cleanNtpn || cleanNtpn.length < 8) {
            setErrorMsg("Draf akrual disetujui, namun NTPN harus diisi minimal 8 digit.");
            router.refresh();
            return;
          }

          const payRes = await recordTaxPaymentAction({
            periodMonth,
            ntpn: cleanNtpn,
            paidAtISO: paidAt,
            bankAccountId,
            documentId: documentId ?? undefined,
          });

          if (payRes.ok) {
            setSuccessMsg("Akrual dan pelunasan pajak dengan NTPN berhasil dibukukan!");
            setTimeout(() => {
              router.push("/pajak");
            }, 1200);
            return;
          } else {
            setErrorMsg(
              `Akrual berhasil diposting, namun pelunasan gagal: ${payRes.error || "Periksa kembali data NTPN."}`
            );
            router.refresh();
            return;
          }
        }

        setSuccessMsg("Draf akrual pajak berhasil disetujui dan diposting ke Buku Besar.");
        setTimeout(() => {
          router.push("/pajak");
        }, 1200);
      } else {
        setErrorMsg(res.error || "Gagal memposting draf akrual pajak.");
      }
    });
  };

  const handleRejectDraft = () => {
    if (!confirm(`Batalkan draf akrual pajak masa ${periodMonth}? Draf akan dibatalkan.`)) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await rejectTaxAccrualDraftAction({ periodMonth });
      if (res.ok) {
        router.push("/pajak");
      } else {
        setErrorMsg(res.error || "Gagal membatalkan draf.");
      }
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb & Header Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule/60 pb-5">
        <div className="space-y-1">
          <Link
            href="/pajak"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-terra transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke Dasbor Pajak</span>
          </Link>
          <div className="flex items-center gap-3 pt-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Review Draf Pajak Masa {periodMonth}
            </h1>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30 text-xs font-bold px-2.5 py-0.5"
            >
              {summary.status === "PAID"
                ? "Lunas (NTPN)"
                : summary.status === "ACCRUED"
                ? "Akrual Diposting"
                : "Draf Siap Ditinjau"}
            </Badge>
          </div>
          <p className="text-xs text-ink-soft">
            Verifikasi perhitungan PPh Final 0,5% PP 55/2022 dan setujui jurnal akrual sebelum dicatat secara permanen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleRejectDraft}
            disabled={isPending || !canEdit || summary.status === "PAID" || summary.status === "ACCRUED"}
            className="text-xs h-9 px-3.5 rounded-xl border-rule hover:bg-canvas font-bold text-ink"
          >
            Tolak Draf
          </Button>
          <Button
            type="button"
            onClick={handleAcceptAccrual}
            disabled={isPending || !canEdit || summary.status === "PAID" || summary.status === "ACCRUED" || (!draftData && summary.taxDueMinor > 0n)}
            className="text-xs h-9 px-4 rounded-xl bg-terra text-white hover:bg-terra/90 font-bold shadow-2xs"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : enableDirectSettle ? (
              <span>Setujui &amp; Lunasi Sekaligus</span>
            ) : (
              <span>Setujui &amp; Posting Akrual</span>
            )}
          </Button>
        </div>
      </div>

      {/* Alert Notifikasi */}
      {errorMsg && (
        <div className="p-4 rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 flex items-center gap-3 shadow-sm">
          <AlertCircle className="size-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="font-bold text-xs">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 flex items-center gap-3 shadow-sm">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-bold text-xs">{successMsg}</span>
        </div>
      )}

      {/* 1. KARTU PERHITUNGAN TRANSPARAN (PP 55/2022) */}
      <div className="rounded-3xl border-2 border-rule bg-paper p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule/60 pb-4">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-terra">
              Rincian Perhitungan Pajak
            </span>
            <h2 className="font-display text-lg font-bold text-ink tracking-tight">
              Formula PPh Final PP No. 55 Tahun 2022 jo. UU HPP
            </h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rule bg-canvas/70 text-xs font-semibold text-ink">
            {isIndividual ? (
              <>
                <User className="size-4 text-ink-soft" />
                <span>Wajib Pajak Orang Pribadi (Fasilitas Rp 500 Jt)</span>
              </>
            ) : (
              <>
                <Building2 className="size-4 text-ink-soft" />
                <span>Wajib Pajak Badan (Tanpa Batas Fasilitas)</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border-2 border-rule/80 bg-canvas/60 space-y-1">
            <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider block">
              1. Peredaran Bruto Bulan Ini
            </span>
            <div className="font-mono text-xl font-bold text-ink tnum tracking-tight">
              {grossRevenue.formatIdr()}
            </div>
            <p className="text-[11px] text-ink-soft">
              Total pendapatan kredit diakui pada masa {periodMonth}.
            </p>
          </div>

          <div className="p-4 rounded-2xl border-2 border-rule/80 bg-canvas/60 space-y-1">
            <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider block">
              2. Dasar Pengenaan Pajak (DPP)
            </span>
            <div className="font-mono text-xl font-bold text-ink tnum tracking-tight">
              {taxableRevenue.formatIdr()}
            </div>
            <p className="text-[11px] text-ink-soft">
              {isIndividual
                ? "Bagian omzet yang melampaui batas bebas pajak Rp 500 Juta."
                : "Seluruh omzet kena pajak sejak rupiah pertama (Badan)."}
            </p>
          </div>

          <div className="p-4 rounded-2xl border-2 border-terra/40 bg-terra/5 space-y-1">
            <span className="text-[11px] font-bold text-terra uppercase tracking-wider block">
              3. PPh Terutang (Tarif 0,5%)
            </span>
            <div className="font-mono text-2xl font-bold text-terra tnum tracking-tight">
              {taxDue.formatIdr()}
            </div>
            <p className="text-[11px] text-ink-soft">
              Total yang harus diakui sebagai utang dan disetorkan ke kas negara.
            </p>
          </div>
        </div>

        {/* Baris Transparansi Kumulatif */}
        <div className="p-4 rounded-2xl border border-rule bg-canvas/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="size-4 text-ink-soft" />
            <span className="text-ink-soft">
              Kumulatif Omzet Tahun Berjalan s.d. Masa Ini:
            </span>
            <strong className="font-mono font-bold text-ink tnum">
              {cumulativeRevenue.formatIdr()}
            </strong>
          </div>
          {isIndividual && (
            <div className="text-ink-soft">
              Batas fasilitas bebas pajak tahunan:{" "}
              <strong className="font-mono font-bold text-ink">Rp 500.000.000,00</strong>
            </div>
          )}
        </div>
      </div>

      {/* 2. TABEL PRATINJAU JURNAL AKRUAL */}
      <div className="rounded-3xl border-2 border-rule bg-paper p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-rule/60 pb-4">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              Jurnal Akrual Beban Pajak
            </span>
            <h2 className="font-display text-lg font-bold text-ink tracking-tight">
              Pratinjau Ayat Jurnal Penyesuaian
            </h2>
          </div>
          <div className="text-xs text-ink-soft font-mono">
            {draftData?.draft.dateISO || `${periodMonth}-28`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b-2 border-ink/80 bg-canvas/60 text-[11px] font-bold text-ink-soft uppercase tracking-wider">
                <th className="px-4 py-3">Kode &amp; Nama Rekening</th>
                <th className="px-4 py-3">Keterangan / Alasan</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 font-sans">
              <tr className="hover:bg-canvas/40 transition-colors">
                <td className="px-4 py-3.5 font-bold text-ink">
                  5700 — Beban Pajak Penghasilan Final UMKM
                </td>
                <td className="px-4 py-3.5 text-ink-soft">
                  Pengakuan beban pajak PP 55/2022 periode {periodMonth}
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-bold text-debit tnum">
                  {taxDue.formatIdr()}
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-ink-soft/40 tnum">
                  -
                </td>
              </tr>
              <tr className="hover:bg-canvas/40 transition-colors">
                <td className="px-4 py-3.5 font-bold text-ink pl-8">
                  2300 — Utang PPh Final PP 55/2022
                </td>
                <td className="px-4 py-3.5 text-ink-soft">
                  Kewajiban penyetoran PPh Final ke kas negara
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-ink-soft/40 tnum">
                  -
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-bold text-credit tnum">
                  {taxDue.formatIdr()}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/80 bg-canvas/80 font-bold text-ink">
                <td colSpan={2} className="px-4 py-3 text-right uppercase tracking-wider text-[11px]">
                  Total Seimbang:
                </td>
                <td className="px-4 py-3 text-right font-mono text-debit tnum">
                  {taxDue.formatIdr()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-credit tnum">
                  {taxDue.formatIdr()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 3. OPSI PELUNASAN LANGSUNG (NTPN & BUKTI BAYAR) */}
      <div className="rounded-3xl border-2 border-rule bg-paper p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex items-start sm:items-center justify-between gap-4 border-b border-rule/60 pb-4">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-terra">
              Penyelesaian Sekaligus
            </span>
            <h2 className="font-display text-lg font-bold text-ink tracking-tight">
              Sudah Membayar &amp; Memiliki Kode NTPN?
            </h2>
            <p className="text-xs text-ink-soft">
              Centang opsi di bawah jika Anda ingin memposting akrual sekaligus melunasi utang pajak dengan NTPN.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 pt-1 sm:pt-0">
            <input
              type="checkbox"
              checked={enableDirectSettle}
              onChange={(e) => setEnableDirectSettle(e.target.checked)}
              className="size-4.5 rounded border-rule text-terra focus:ring-terra"
            />
            <span className="text-xs font-bold text-ink">Input NTPN Sekarang</span>
          </label>
        </div>

        {enableDirectSettle && (
          <div className="space-y-4 pt-1 animate-in fade-in-50 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                  Kode NTPN Resmi <span className="text-terra">*</span>
                </label>
                <input
                  type="text"
                  value={ntpn}
                  onChange={(e) => setNtpn(e.target.value.toUpperCase())}
                  placeholder="CONTOH: 1A2B3C4D5E6F7G8H"
                  maxLength={30}
                  required
                  className="w-full h-11 px-3.5 font-mono font-bold text-xs rounded-xl border-2 border-rule bg-canvas text-ink uppercase tracking-widest focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                  Tanggal Setor <span className="text-terra">*</span>
                </label>
                <input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                  className="w-full h-11 px-3 font-mono text-xs font-semibold rounded-xl border-2 border-rule bg-canvas text-ink focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                  Rekening Asal Kas/Bank <span className="text-terra">*</span>
                </label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full h-11 px-3 text-xs rounded-xl border-2 border-rule bg-canvas text-ink font-bold focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-2xs"
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-paper text-ink">
                      {acc.code} — {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dropzone Bukti Setor */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                Dokumen Bukti Penerimaan Negara (BPN) (Opsional)
              </label>

              {uploadedFileName ? (
                <div className="flex items-center justify-between p-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 text-ink shadow-2xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileCheck className="size-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-xs truncate max-w-[280px]">
                      {uploadedFileName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1 rounded-lg hover:bg-canvas text-ink-soft hover:text-rose-600 transition-colors"
                    title="Hapus file"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-rule hover:border-terra/60 rounded-2xl bg-canvas/40 p-4 text-center cursor-pointer hover:bg-canvas/70 transition-all flex flex-col items-center justify-center gap-1.5 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {isUploading ? (
                    <div className="flex items-center gap-2 text-terra font-bold text-xs py-1">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Mengunggah dokumen bukti bayar...</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="size-5 text-ink-soft group-hover:text-terra transition-colors" />
                      <div className="text-xs font-bold text-ink group-hover:text-terra transition-colors">
                        Klik untuk upload Bukti Penerimaan Negara (BPN)
                      </div>
                      <p className="text-[10px] text-ink-soft font-medium">
                        Format PDF, JPG, atau PNG (Maksimal 5 MB)
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!enableDirectSettle && (
          <p className="text-xs text-ink-soft">
            Jika belum membayar sekarang, cukup klik tombol <strong className="text-ink font-semibold">"Setujui &amp; Posting Akrual"</strong> di atas. Bukti setor NTPN dapat disusulkan kapan saja melalui tombol <strong className="text-ink font-semibold">"Catat NTPN"</strong> pada tabel Dasbor Pajak.
          </p>
        )}
      </div>
    </div>
  );
}

