"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Money } from "@/core/money/money";

export interface InvoiceDetailItem {
  description: string;
  quantity: string;
  unitPriceMinor: string;
  discountMinor: string;
  taxRatePercent: string;
  totalMinor: string;
}

export interface InvoiceDetailPayment {
  paymentDate: string;
  amountMinor: string;
  referenceNumber: string | null;
}

export interface InvoiceDetailData {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate: string;
  contactName: string | null;
  subtotalMinor: string;
  discountMinor: string;
  taxMinor: string;
  totalMinor: string;
  amountPaidMinor: string;
  notes: string | null;
  items: InvoiceDetailItem[];
  payments: InvoiceDetailPayment[];
}

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  invoice: InvoiceDetailData | null;
  error?: string | null;
  emptyHint?: string;
}

/**
 * Drawer rincian faktur/tagihan — chrome sama seperti SakRuleSheet
 * (dipakai chat Akunio via EntitySheetProvider, reusable di seluruh app).
 */
export function InvoiceDetailSheet({
  open,
  onOpenChange,
  loading,
  invoice,
  error,
  emptyHint = "Rincian faktur tidak dapat dimuat.",
}: InvoiceDetailSheetProps) {
  const isBill = invoice?.type === "BILL";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <Receipt className="size-4" />
            <span>{isBill ? "Tagihan Pembelian" : "Faktur Penjualan"}</span>
          </div>
          <SheetTitle className="tnum font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Faktur..." : (invoice?.invoiceNumber ?? "Detail Faktur")}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {invoice ? (
              <>
                {invoice.contactName ?? "-"}
                {` • Terbit ${invoice.issueDate} • Jatuh tempo ${invoice.dueDate} • ${invoice.status}`}
              </>
            ) : (
              "Rincian faktur/tagihan usaha Anda."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">Mengambil rincian faktur dari basis data...</p>
            </div>
          ) : invoice ? (
            <div className="space-y-4">
              {/* Detail barang */}
              <div className="overflow-x-auto rounded-lg border border-rule bg-canvas">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas/80 border-b border-rule text-ink-soft text-[11px]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Barang / Jasa</th>
                      <th className="px-3 py-1.5 font-medium text-right">Qty</th>
                      <th className="px-3 py-1.5 font-medium text-right">Harga</th>
                      <th className="px-3 py-1.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60 text-ink">
                    {invoice.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-ink-soft">
                          Tidak ada rincian barang.
                        </td>
                      </tr>
                    ) : (
                      invoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-1.5">
                            <span className="font-medium">{it.description}</span>
                            {it.taxRatePercent !== "0.00" && it.taxRatePercent !== "0" && (
                              <span className="text-ink-soft ml-1.5">(+PPN {it.taxRatePercent}%)</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{it.quantity}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {Money.formatIdr(it.unitPriceMinor)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold">
                            {Money.formatIdr(it.totalMinor)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Ringkasan nominal */}
              <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3 text-xs space-y-1">
                <div className="flex justify-between text-ink-soft">
                  <span>Subtotal</span>
                  <span className="font-mono tnum text-ink">{Money.formatIdr(invoice.subtotalMinor)}</span>
                </div>
                {invoice.discountMinor !== "0" && (
                  <div className="flex justify-between text-ink-soft">
                    <span>Diskon</span>
                    <span className="font-mono tnum text-ink">-{Money.formatIdr(invoice.discountMinor)}</span>
                  </div>
                )}
                {invoice.taxMinor !== "0" && (
                  <div className="flex justify-between text-ink-soft">
                    <span>PPN</span>
                    <span className="font-mono tnum text-ink">{Money.formatIdr(invoice.taxMinor)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-rule/60 pt-1.5 font-bold text-ink">
                  <span>Total</span>
                  <span className="font-mono tnum">{Money.formatIdr(invoice.totalMinor)}</span>
                </div>
                <div className="flex justify-between text-ink-soft">
                  <span>Sudah dibayar</span>
                  <span className="font-mono tnum text-ink">{Money.formatIdr(invoice.amountPaidMinor)}</span>
                </div>
              </div>

              {invoice.notes && (
                <p className="text-xs text-ink-soft">Catatan: {invoice.notes}</p>
              )}

              <Link
                href={`/faktur/${encodeURIComponent(invoice.id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
              >
                Buka halaman faktur
                <ArrowRight className="size-3" />
              </Link>
            </div>
          ) : (
            <p className="text-xs text-ink-soft">{error || emptyHint}</p>
          )}
        </div>

        <SheetFooter className="p-6 pt-4 border-t border-rule/50 bg-paper">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full text-xs font-medium cursor-pointer"
          >
            Tutup Rujukan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
