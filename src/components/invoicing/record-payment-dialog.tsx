"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/core/money/money";
import { recordInvoicePaymentAction } from "@/server/actions/invoice.actions";
import { Loader2 } from "lucide-react";

export interface PaymentTargetInvoice {
  id: string;
  invoiceNumber: string;
  type: "INVOICE" | "BILL";
  totalMinor: bigint;
  amountPaidMinor: bigint;
}

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: PaymentTargetInvoice | null;
  accountsList: Array<{ id: string; code: string; name: string }>;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  accountsList,
  onSuccess,
}: RecordPaymentDialogProps) {
  const [amountStr, setAmountStr] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [autoPost, setAutoPost] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Kunci idempotency per buka dialog (Ruling R8): SEKALI saat dialog dibuka,
  // stabil selama dialog terbuka — klik-ulang / re-render tak menggantinya.
  const idemKeyRef = React.useRef<string | null>(null);

  const remainingMinor = invoice ? invoice.totalMinor - invoice.amountPaidMinor : 0n;

  /** minor → string desimal editable ("10000.55") — tanpa Number()/100 agar sen tak terpotong. */
  function minorToDecimalString(minor: bigint): string {
    const neg = minor < 0n;
    const v = neg ? -minor : minor;
    const whole = v / 100n;
    const frac = v % 100n;
    return `${neg ? "-" : ""}${whole.toString()}${frac === 0n ? "" : `.${frac.toString().padStart(2, "0")}`}`;
  }

  /** string desimal ("10000.55") → minor eksak; null bila format tak valid. Tanpa parseFloat. */
  function parseDecimalToMinor(raw: string): bigint | null {
    const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
    if (!m) return null;
    const sign = m[1] ? -1n : 1n;
    const whole = BigInt(m[2]);
    const frac = m[3] ? BigInt(m[3].padEnd(2, "0")) : 0n;
    return sign * (whole * 100n + frac);
  }

  React.useEffect(() => {
    if (invoice) {
      setAmountStr(remainingMinor > 0n ? minorToDecimalString(remainingMinor) : "");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setReferenceNumber("");
      setNotes("");
      setError(null);
      if (open) idemKeyRef.current = crypto.randomUUID();

      // Default to first account or 1120/1110
      if (accountsList.length > 0) {
        const bankAcc = accountsList.find((a) => a.code === "1120") || accountsList[0];
        setPaymentAccountId(bankAcc.id);
      }
    }
  }, [invoice, accountsList, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;

    const amountMinor = parseDecimalToMinor(amountStr);
    if (amountMinor === null || amountMinor <= 0n) {
      setError("Jumlah pembayaran harus lebih dari Rp 0.");
      return;
    }

    if (!paymentAccountId) {
      setError("Silakan pilih akun kas atau bank penerima.");
      return;
    }

    if (amountMinor > remainingMinor) {
      setError(
        `Jumlah melebihi sisa tagihan ${Money.fromMinor(remainingMinor).formatIdr()} (MELEBIHI_SISA).`
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await recordInvoicePaymentAction(
        {
          invoiceId: invoice.id,
          paymentDate,
          amountMinor,
          paymentAccountId,
          referenceNumber: referenceNumber.trim() || null,
          notes: notes.trim() || null,
          idempotencyKey: idemKeyRef.current ?? crypto.randomUUID(),
        },
        autoPost
      );

      if (!res.ok) {
        throw new Error(res.error);
      }

      idemKeyRef.current = null;
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat pembayaran.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-paper text-ink border-rule">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">
            {invoice?.type === "INVOICE" ? "Catat Penerimaan Pembayaran" : "Catat Pelunasan Tagihan"}
          </DialogTitle>
          {invoice && (
            <p className="text-xs text-ink-soft">
              Faktur <span className="font-mono font-semibold text-ink">#{invoice.invoiceNumber}</span> • Sisa:{" "}
              <span className="font-semibold text-ink">{Money.fromMinor(remainingMinor).formatIdr()}</span>
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-xs font-medium text-ink">
              Jumlah Pembayaran (Rp) *
            </Label>
            <Input
              id="pay-amount"
              type="number"
              min="1"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="Contoh: 500000"
              className="text-xs bg-canvas"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date" className="text-xs font-medium text-ink">
                Tanggal Bayar
              </Label>
              <Input
                id="pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="text-xs bg-canvas"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-account" className="text-xs font-medium text-ink">
                Akun Kas / Bank
              </Label>
              <select
                id="pay-account"
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
              >
                {accountsList.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref" className="text-xs font-medium text-ink">
              No. Bukti Transfer / Referensi (Opsional)
            </Label>
            <Input
              id="pay-ref"
              placeholder="Contoh: TRF-BCA-987654"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="text-xs bg-canvas"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="pay-autopost"
              type="checkbox"
              checked={autoPost}
              onChange={(e) => setAutoPost(e.target.checked)}
              className="rounded border-rule text-terra focus:ring-terra"
            />
            <Label htmlFor="pay-autopost" className="text-xs text-ink cursor-pointer">
              Posting otomatis ke Jurnal Kas/Bank buku besar
            </Label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs border-rule"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {loading && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Konfirmasi Pembayaran
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
