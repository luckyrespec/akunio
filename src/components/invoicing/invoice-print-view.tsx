"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";
import {
  Printer,
  ArrowLeft,
  MessageSquare,
  CreditCard,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

export interface InvoiceDetailData {
  id: string;
  type: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  amountPaidMinor: bigint;
  status: string;
  notes: string | null;
  orgName: string;
  contact: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxId: string | null;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPriceMinor: bigint;
    discountMinor: bigint;
    taxRatePercent: string;
    totalMinor: bigint;
  }>;
  payments: Array<{
    id: string;
    paymentDate: string;
    amountMinor: bigint;
    referenceNumber: string | null;
    notes: string | null;
  }>;
}

export function InvoicePrintView({ invoice }: { invoice: InvoiceDetailData }) {
  const remainingMinor = invoice.totalMinor - invoice.amountPaidMinor;
  const isPaid = invoice.status === "PAID";

  function handlePrint() {
    window.print();
  }

  function handleWhatsApp() {
    const { waLink } = formatWhatsAppReminder(
      { name: invoice.contact.name, phone: invoice.contact.phone },
      { invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate, remainingMinor }
    );
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Action Bar (Hidden on print) */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/faktur"
          className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali ke Faktur & Tagihan</span>
        </Link>

        <div className="flex items-center gap-2">
          {invoice.type === "INVOICE" && !isPaid && invoice.contact.phone && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleWhatsApp}
              className="text-xs border-emerald-600/30 text-emerald-700 hover:bg-emerald-50"
            >
              <MessageSquare className="size-3.5 mr-1.5 text-emerald-600" />
              Kirim WhatsApp
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs border-rule text-ink"
          >
            <Printer className="size-3.5 mr-1.5" />
            Cetak / Simpan PDF
          </Button>
        </div>
      </div>

      {/* Printable Invoice Document Container */}
      <div className="rounded-2xl border border-rule bg-paper p-8 sm:p-12 shadow-xs text-ink font-sans print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 border-b border-rule pb-8">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="size-6 text-terra" />
              <span className="text-xl font-display font-semibold tracking-tight text-ink">
                {invoice.orgName}
              </span>
            </div>
            <p className="text-xs text-ink-soft mt-1">Sistem Akuntansi & Dokumen Komersial</p>
          </div>

          <div className="text-left sm:text-right">
            <h2 className="text-2xl font-display font-bold text-ink uppercase tracking-wider">
              {invoice.type === "INVOICE" ? "FAKTUR PENJUALAN" : "TAGIHAN PEMBELIAN"}
            </h2>
            <div className="mt-1 font-mono text-sm font-semibold text-terra">
              #{invoice.invoiceNumber}
            </div>

            <div className="mt-2">
              {invoice.status === "PAID" && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-50 text-xs px-2.5 py-0.5">
                  <CheckCircle2 className="size-3.5 mr-1" />
                  LUNAS / PAID
                </Badge>
              )}
              {invoice.status === "PARTIALLY_PAID" && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-700 bg-amber-50 text-xs px-2.5 py-0.5">
                  <Clock className="size-3.5 mr-1" />
                  DIBAYAR SEBAGIAN
                </Badge>
              )}
              {invoice.status === "OVERDUE" && (
                <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10 text-xs px-2.5 py-0.5">
                  <AlertCircle className="size-3.5 mr-1" />
                  JATUH TEMPO / OVERDUE
                </Badge>
              )}
              {invoice.status === "ISSUED" && (
                <Badge variant="outline" className="border-blue-500/40 text-blue-700 bg-blue-50 text-xs px-2.5 py-0.5">
                  BELUM BAYAR / UNPAID
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Info & Recipient */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6 border-b border-rule text-xs">
          <div>
            <span className="font-semibold text-ink-soft uppercase tracking-wider text-[10px]">
              {invoice.type === "INVOICE" ? "DITUJUKAN KEPADA:" : "DITERIMA DARI:"}
            </span>
            <div className="mt-2 font-display text-sm font-semibold text-ink">
              {invoice.contact.name}
            </div>
            {invoice.contact.address && (
              <div className="text-ink-soft mt-1 leading-relaxed">{invoice.contact.address}</div>
            )}
            {invoice.contact.phone && (
              <div className="text-ink-soft mt-1">Telp / WA: {invoice.contact.phone}</div>
            )}
            {invoice.contact.taxId && (
              <div className="text-ink-soft mt-1">NPWP: {invoice.contact.taxId}</div>
            )}
          </div>

          <div className="space-y-2 sm:text-right">
            <div>
              <span className="text-ink-soft">Tanggal Terbit: </span>
              <span className="font-medium text-ink">{invoice.issueDate}</span>
            </div>
            <div>
              <span className="text-ink-soft">Jatuh Tempo: </span>
              <span className="font-medium text-ink">{invoice.dueDate}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="py-6 border-b border-rule">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-rule text-ink-soft font-semibold text-[11px]">
                <th className="py-2.5">Deskripsi Barang / Jasa</th>
                <th className="py-2.5 text-center">Kuantitas</th>
                <th className="py-2.5 text-right">Harga Satuan</th>
                <th className="py-2.5 text-center">PPN</th>
                <th className="py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 font-medium text-ink">{item.description}</td>
                  <td className="py-3 text-center text-ink-soft">{parseFloat(item.quantity)}</td>
                  <td className="py-3 text-right font-mono text-ink-soft">
                    {Money.fromMinor(item.unitPriceMinor).formatIdr()}
                  </td>
                  <td className="py-3 text-center text-ink-soft">
                    {parseFloat(item.taxRatePercent) > 0 ? `${item.taxRatePercent}%` : "-"}
                  </td>
                  <td className="py-3 text-right font-mono font-semibold text-ink">
                    {Money.fromMinor(item.totalMinor).formatIdr()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown */}
        <div className="flex flex-col sm:flex-row sm:justify-between items-start pt-6 gap-6 text-xs">
          <div className="space-y-2 max-w-sm">
            {invoice.notes && (
              <div className="rounded-xl border border-rule bg-canvas/40 p-3.5">
                <span className="font-semibold text-ink block text-[11px]">Instruksi / Catatan:</span>
                <p className="mt-1 text-ink-soft leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
          </div>

          <div className="w-full sm:w-72 space-y-2 text-xs">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal:</span>
              <span className="font-mono">{Money.fromMinor(invoice.subtotalMinor).formatIdr()}</span>
            </div>
            {invoice.discountMinor > 0n && (
              <div className="flex justify-between text-destructive">
                <span>Potongan Diskon:</span>
                <span className="font-mono">-{Money.fromMinor(invoice.discountMinor).formatIdr()}</span>
              </div>
            )}
            {invoice.taxMinor > 0n && (
              <div className="flex justify-between text-ink-soft">
                <span>PPN:</span>
                <span className="font-mono">{Money.fromMinor(invoice.taxMinor).formatIdr()}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rule pt-2 font-display text-sm font-semibold text-ink">
              <span>Total Tagihan:</span>
              <span className="font-mono text-terra">{Money.fromMinor(invoice.totalMinor).formatIdr()}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Telah Dibayar:</span>
              <span className="font-mono text-emerald-700">
                {Money.fromMinor(invoice.amountPaidMinor).formatIdr()}
              </span>
            </div>
            <div className="flex justify-between border-t border-dashed border-rule pt-2 font-semibold text-ink">
              <span>Sisa Tagihan:</span>
              <span className="font-mono text-base text-destructive">
                {Money.fromMinor(remainingMinor > 0n ? remainingMinor : 0n).formatIdr()}
              </span>
            </div>
          </div>
        </div>

        {/* Payment History Section if any */}
        {invoice.payments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-rule text-xs">
            <h4 className="font-semibold text-ink mb-2">Riwayat Pembayaran</h4>
            <div className="divide-y divide-rule/60 border border-rule rounded-lg overflow-hidden">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex justify-between p-2.5 bg-canvas/20">
                  <div>
                    <span className="font-medium text-ink">{p.paymentDate}</span>
                    {p.referenceNumber && (
                      <span className="text-ink-soft ml-2">({p.referenceNumber})</span>
                    )}
                  </div>
                  <div className="font-mono font-semibold text-emerald-700">
                    {Money.fromMinor(p.amountMinor).formatIdr()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
