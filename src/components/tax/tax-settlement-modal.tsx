"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, UploadCloud, FileCheck, X } from "lucide-react";
import { recordTaxPaymentAction } from "@/server/actions/tax.actions";
import { uploadDocumentAction } from "@/server/actions/upload.actions";
import { Money } from "@/core/money/money";

export interface TaxAccountOption {
  id: string;
  code: string;
  name: string;
}

export interface TaxSettlementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodMonth: string; // "YYYY-MM"
  taxDueMinor: bigint | string; // bigint or string representation of minor
  bankAccounts: TaxAccountOption[];
  onSuccess?: () => void;
}

export function TaxSettlementModal({
  open,
  onOpenChange,
  periodMonth,
  taxDueMinor,
  bankAccounts,
  onSuccess,
}: TaxSettlementModalProps) {
  const [ntpn, setNtpn] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = React.useState(() => bankAccounts[0]?.id ?? "");
  const [documentId, setDocumentId] = React.useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setNtpn("");
      setDocumentId(null);
      setUploadedFileName(null);
      setErrorMsg(null);
      if (!bankAccountId && bankAccounts[0]?.id) {
        setBankAccountId(bankAccounts[0].id);
      }
    }
  }, [open, bankAccounts, bankAccountId]);

  const taxDueFormatted = React.useMemo(() => {
    try {
      const minor = typeof taxDueMinor === "bigint" ? taxDueMinor : BigInt(taxDueMinor || "0");
      return Money.fromMinor(minor).formatIdr();
    } catch {
      return "Rp 0";
    }
  }, [taxDueMinor]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanNtpn = ntpn.trim().toUpperCase();
    if (!cleanNtpn || cleanNtpn.length < 8) {
      setErrorMsg("NTPN harus diisi minimal 8 digit alphanumeric.");
      return;
    }

    if (!bankAccountId) {
      setErrorMsg("Pilih akun Kas atau Bank untuk pembayaran.");
      return;
    }

    startTransition(async () => {
      const res = await recordTaxPaymentAction({
        periodMonth,
        ntpn: cleanNtpn,
        paidAtISO: paidAt,
        bankAccountId,
        documentId: documentId ?? undefined,
      });

      if (res.ok) {
        onOpenChange(false);
        onSuccess?.();
      } else {
        setErrorMsg(res.error || "Gagal mencatat pembayaran pajak.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-paper border-2 border-rule shadow-2xl rounded-3xl p-6 sm:p-7">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-xl font-bold text-ink tracking-tight">
                  Pencatatan Bukti Setor Pajak (NTPN)
                </DialogTitle>
                <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider mt-0.5">
                  Masa Pajak {periodMonth} • PP No. 55 Tahun 2022
                </p>
              </div>
            </div>
            <DialogDescription className="text-xs text-ink-soft leading-relaxed pt-1">
              Catat nomor resmi Bukti Penerimaan Negara (BPN) dan lampirkan bukti pembayaran untuk pelunasan utang PPh Final.
            </DialogDescription>
          </DialogHeader>

          <div className="py-5 space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3.5 rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 flex items-center gap-2.5 shadow-sm">
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="font-bold">{errorMsg}</span>
              </div>
            )}

            {/* Nominal Pajak Terutang */}
            <div className="rounded-2xl border-2 border-rule/90 bg-canvas/80 p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft block">
                  Beban PPh Final Terutang
                </span>
                <span className="text-xs font-semibold text-ink">Tarif 0,5% PP 55/2022</span>
              </div>
              <span className="font-mono font-bold text-lg text-ink tnum tracking-tight bg-paper px-3.5 py-1.5 rounded-xl border border-rule shadow-2xs">
                {taxDueFormatted}
              </span>
            </div>

            {/* Input NTPN */}
            <div className="space-y-1.5">
              <label htmlFor="ntpn-input" className="block text-xs font-bold text-ink uppercase tracking-wider">
                Nomor Transaksi Penerimaan Negara (NTPN) <span className="text-terra">*</span>
              </label>
              <input
                id="ntpn-input"
                type="text"
                value={ntpn}
                onChange={(e) => setNtpn(e.target.value.toUpperCase())}
                placeholder="CONTOH: 1A2B3C4D5E6F7G8H"
                maxLength={30}
                required
                className="w-full h-11 px-4 font-mono font-bold text-sm rounded-xl border-2 border-rule bg-canvas text-ink uppercase tracking-widest placeholder:text-ink-soft/40 focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-2xs"
              />
              <p className="text-[11px] text-ink-soft">
                16 digit alphanumeric yang tercetak pada BPN/SSE dari bank persepsi atau kantor pos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Tanggal Setor */}
              <div className="space-y-1.5">
                <label htmlFor="paid-at-input" className="block text-xs font-bold text-ink uppercase tracking-wider">
                  Tanggal Penyetoran <span className="text-terra">*</span>
                </label>
                <input
                  id="paid-at-input"
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                  className="w-full h-10 px-3 font-mono text-xs font-semibold rounded-xl border-2 border-rule bg-canvas text-ink focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-2xs"
                />
              </div>

              {/* Akun Kas / Bank Pembayar */}
              <div className="space-y-1.5">
                <label htmlFor="bank-select" className="block text-xs font-bold text-ink uppercase tracking-wider">
                  Kas / Bank Asal <span className="text-terra">*</span>
                </label>
                <select
                  id="bank-select"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full h-10 px-3 text-xs rounded-xl border-2 border-rule bg-canvas text-ink font-bold focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-2xs cursor-pointer"
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-paper text-ink">
                      {acc.code} — {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Upload Dokumen Bukti Setor (BPN / Bukti Bayar Bank) */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                Lampiran Bukti Pembayaran (Opsional)
              </label>

              {uploadedFileName ? (
                <div className="flex items-center justify-between p-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 text-ink shadow-2xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileCheck className="size-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-xs truncate max-w-[260px]">
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

            <p className="text-[11px] text-ink-soft leading-relaxed border-t border-rule/50 pt-2.5">
              Jurnal pelunasan otomatis: <strong className="text-ink font-semibold">Debit 2300 (Utang PPh Final)</strong> vs <strong className="text-ink font-semibold">Kredit Akun Kas/Bank</strong> terpilih.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2.5 pt-3 border-t border-rule/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs h-10 px-4 rounded-xl border-rule hover:bg-canvas font-bold text-ink"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending || isUploading}
              className="text-xs h-10 px-5 rounded-xl bg-terra text-white hover:bg-terra/90 font-bold shadow-sm transition-all"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  <span>Menyimpan Pelunasan...</span>
                </>
              ) : (
                <span>Simpan &amp; Posting Pelunasan</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
