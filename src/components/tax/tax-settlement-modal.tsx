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
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { recordTaxPaymentAction } from "@/server/actions/tax.actions";
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
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setNtpn("");
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
      <DialogContent className="sm:max-w-md bg-paper border-2 border-rule/90 shadow-2xl rounded-3xl p-6">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-5" />
              </div>
              <DialogTitle className="font-display text-lg font-bold text-ink tracking-tight">
                Pencatatan Bukti Setor Pajak (NTPN)
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-ink-soft leading-relaxed">
              Catat bukti Nomor Transaksi Penerimaan Negara (NTPN) resmi untuk pelunasan PPh Final masa{" "}
              <strong className="font-bold text-ink underline decoration-rule/80 underline-offset-2">{periodMonth}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-5 space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 flex items-center gap-2.5 shadow-sm">
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
            )}

            {/* Nominal Pajak Terutang */}
            <div className="rounded-2xl border-2 border-rule/80 bg-canvas/70 p-3.5 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft block">
                  Beban PPh Terutang
                </span>
                <span className="text-[11px] text-ink-soft/80">PP 55/2022 (0,5%)</span>
              </div>
              <span className="font-mono font-bold text-base text-ink tnum tracking-tight bg-paper/80 px-3 py-1 rounded-xl border border-rule/60">
                {taxDueFormatted}
              </span>
            </div>

            {/* Input NTPN */}
            <div className="space-y-1.5">
              <label htmlFor="ntpn-input" className="block text-xs font-bold text-ink">
                Kode NTPN Resmi <span className="text-terra">*</span>
              </label>
              <input
                id="ntpn-input"
                type="text"
                value={ntpn}
                onChange={(e) => setNtpn(e.target.value.toUpperCase())}
                placeholder="CONTOH: 1A2B3C4D5E6F7G8H"
                maxLength={24}
                required
                className="w-full h-10 px-3.5 font-mono font-bold text-xs rounded-xl border-2 border-rule/90 bg-canvas text-ink uppercase tracking-widest placeholder:text-ink-soft/40 focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-sm"
              />
              <p className="text-[11px] text-ink-soft">
                Tercantum pada Bukti Penerimaan Negara (BPN) dari bank atau SSE Pajak.
              </p>
            </div>

            {/* Tanggal Setor */}
            <div className="space-y-1.5">
              <label htmlFor="paid-at-input" className="block text-xs font-bold text-ink">
                Tanggal Pembayaran / Setoran <span className="text-terra">*</span>
              </label>
              <input
                id="paid-at-input"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
                className="w-full h-10 px-3.5 font-mono text-xs rounded-xl border-2 border-rule/90 bg-canvas text-ink focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-sm"
              />
            </div>

            {/* Akun Kas / Bank Pembayar */}
            <div className="space-y-1.5">
              <label htmlFor="bank-select" className="block text-xs font-bold text-ink">
                Akun Kas / Bank Pengeluaran <span className="text-terra">*</span>
              </label>
              <select
                id="bank-select"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl border-2 border-rule/90 bg-canvas text-ink font-medium focus:border-terra focus:ring-2 focus:ring-terra/20 focus:outline-none transition-all shadow-sm"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} — {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-soft leading-relaxed">
                Jurnal otomatis akan mendebit <strong className="text-ink font-semibold">Utang Pajak (2300)</strong> dan mengkredit akun Kas/Bank pilihan Anda.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-rule/40">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs h-10 px-4 rounded-xl border-rule/80 hover:bg-canvas font-medium"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="text-xs h-10 px-5 rounded-xl bg-terra text-white hover:bg-terra/90 font-bold shadow-sm transition-all"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Pelunasan &amp; Posting</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
