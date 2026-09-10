"use client";

import * as React from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewInvoiceJournalAction } from "@/server/actions/invoice.actions";
import { Money } from "@/core/money/money";

interface PreviewLine {
  accountCode: string;
  accountName: string;
  debitMinor: string;
  creditMinor: string;
  memo: string | null;
}

/**
 * Modal Draf Jurnal sebelum posting faktur: tampilkan baris debit/kredit
 * yang AKAN terbentuk (dari pipeline posting asli, tanpa menyimpan),
 * user menyetujui baru eksekusi. Gagal validasi tampil di sini — bukan
 * kode buta setelah klik.
 */
export function InvoicePostingPreview({
  invoiceId,
  invoiceNumber,
  open,
  onOpenChange,
  onConfirm,
  confirming,
}: {
  invoiceId: string | null;
  invoiceNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => Promise<void>;
  confirming: boolean;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{
    number: string;
    memo: string;
    lines: PreviewLine[];
  } | null>(null);

  React.useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    previewInvoiceJournalAction(invoiceId).then((res) => {
      if (cancelled) return;
      if (res.ok) setPreview(res.data);
      else setError(res.error || "Gagal membuat pratinjau.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  const totalDebit = (preview?.lines ?? []).reduce((a, l) => a + BigInt(l.debitMinor || "0"), 0n);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-base text-ink">
            Draf Jurnal — {invoiceNumber}
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Baris berikut yang akan diposting ke buku besar. Periksa akunnya sebelum menyetujui.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 py-8 justify-center text-xs text-ink-soft">
            <Loader2 className="size-4 animate-spin text-terra" />
            Menyusun draf jurnal...
          </p>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-destructive">
              <AlertCircle className="size-4" />
              Draf tidak bisa dibentuk
            </p>
            <p className="mt-1.5 leading-relaxed text-ink">{error}</p>
            <p className="mt-1.5 text-ink-soft">
              Perbaiki penyebabnya dulu (mis. pilih akun anak bukan induk, lengkapi COA, atau buka periode) lalu coba lagi.
            </p>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-rule bg-canvas">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas/80 border-b border-rule text-ink-soft text-[11px]">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Akun</th>
                    <th className="px-3 py-1.5 font-medium text-right">Debit</th>
                    <th className="px-3 py-1.5 font-medium text-right">Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule/60 text-ink">
                  {preview.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <span className="font-mono font-semibold text-terra">{l.accountCode}</span>{" "}
                        <span className="text-ink-soft">{l.accountName}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {l.debitMinor !== "0" ? Money.formatIdr(l.debitMinor) : "-"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {l.creditMinor !== "0" ? Money.formatIdr(l.creditMinor) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-soft">
              Total <strong className="font-mono text-ink">{Money.formatIdr(totalDebit)}</strong>
              {" "}• {preview.memo}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={confirming || loading}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs bg-terra text-white hover:bg-terra/90 shadow-2xs"
            disabled={confirming || loading || !preview}
            onClick={() => invoiceId && onConfirm(invoiceId)}
          >
            {confirming ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                Memposting...
              </>
            ) : (
              <>
                <Check className="mr-1.5 size-3.5" aria-hidden />
                Setuju & Posting
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
