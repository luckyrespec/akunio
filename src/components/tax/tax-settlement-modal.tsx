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
      <DialogContent className="sm:max-w-md bg-paper border border-rule">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display text-base text-ink flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <span>Pencatatan Bukti Setor Pajak (NTPN)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-soft">
              Catat bukti Nomor Transaksi Penerimaan Negara (NTPN) untuk pelunasan PPh Final masa{" "}
              <strong className="text-ink">{periodMonth}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3.5 text-xs">
            {errorMsg && (
              <div className="p-2.5 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Nominal Pajak Terutang */}
            <div className="rounded-xl border border-rule bg-canvas p-3 flex items-center justify-between">
              <span className="text-ink-soft font-medium">Beban PPh Terutang:</span>
              <span className="font-mono font-bold text-sm text-ink">{taxDueFormatted}</span>
            </div>

            {/* Input NTPN */}
            <div>
              <label htmlFor="ntpn-input" className="block font-medium text-ink mb-1">
                Kode NTPN Resmi (16 Digit Alfanumerik)
              </label>
              <input
                id="ntpn-input"
                type="text"
                value={ntpn}
                onChange={(e) => setNtpn(e.target.value.toUpperCase())}
                placeholder="Contoh: 1A2B3C4D5E6F7G8H"
                maxLength={24}
                required
                className="w-full h-9 px-3 font-mono text-xs rounded-xl border border-rule bg-canvas text-ink uppercase tracking-wider focus:border-terra focus:outline-none"
              />
              <p className="text-[11px] text-ink-soft mt-1">
                Diperoleh dari Surat Setoran Elektronik (SSE) / struk ATM / mutasi bank billing pajak.
              </p>
            </div>

            {/* Tanggal Setor */}
            <div>
              <label htmlFor="paid-at-input" className="block font-medium text-ink mb-1">
                Tanggal Pembayaran
              </label>
              <input
                id="paid-at-input"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
                className="w-full h-9 px-3 text-xs rounded-xl border border-rule bg-canvas text-ink focus:border-terra focus:outline-none"
              />
            </div>

            {/* Akun Kas / Bank Pembayar */}
            <div>
              <label htmlFor="bank-select" className="block font-medium text-ink mb-1">
                Akun Kas / Bank Pengeluaran
              </label>
              <select
                id="bank-select"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full h-9 px-2 text-xs rounded-xl border border-rule bg-canvas text-ink focus:border-terra focus:outline-none"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-soft mt-1">
                Jurnal otomatis akan mendebit Utang Pajak (2300) dan mengkredit akun Kas/Bank pilihan Anda.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs h-9"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="text-xs h-9 bg-terra text-white hover:bg-terra/90"
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
