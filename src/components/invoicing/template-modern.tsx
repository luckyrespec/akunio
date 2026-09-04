"use client";

import { Money } from "@/core/money/money";
import { StatusBadge, type InvoiceDetailData } from "./template-formal";

/** Template Modern — aksen terra, ringkas, tanpa kolom tanda tangan. */
export function TemplateModern({ invoice }: { invoice: InvoiceDetailData }) {
  const remainingMinor = invoice.totalMinor - invoice.amountPaidMinor;

  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-xs text-ink font-sans print:border-none print:shadow-none print:rounded-none">
      {/* Accent band */}
      <div className="bg-terra px-6 py-5 sm:px-8 print:bg-terra">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
              {invoice.type === "INVOICE" ? "Faktur Penjualan" : "Tagihan Pembelian"}
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-white">#{invoice.invoiceNumber}</p>
          </div>
          <p className="font-display text-lg font-semibold text-white">{invoice.orgName}</p>
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8">
        {/* Meta row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <StatusBadge status={invoice.status} />
          <div className="flex gap-5 text-ink-soft">
            <span>Terbit: <span className="font-medium text-ink">{invoice.issueDate}</span></span>
            <span>Tempo: <span className="font-medium text-ink">{invoice.dueDate}</span></span>
          </div>
        </div>

        {/* Recipient */}
        <div className="mt-4 rounded-xl bg-canvas/60 px-4 py-3 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            {invoice.type === "INVOICE" ? "Ditagihkan kepada" : "Diterima dari"}
          </span>
          <p className="mt-1 font-display text-sm font-semibold text-ink">{invoice.contact.name}</p>
          <p className="mt-0.5 text-ink-soft">
            {[invoice.contact.address, invoice.contact.phone, invoice.contact.taxId ? `NPWP ${invoice.contact.taxId}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Items */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="py-2 pr-2">Deskripsi</th>
                <th className="py-2 px-2 text-center">Qty</th>
                <th className="py-2 px-2 text-right">Harga</th>
                <th className="py-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={item.id} className={i % 2 === 1 ? "bg-canvas/50" : undefined}>
                  <td className="py-2.5 pr-2 font-medium text-ink">
                    {item.description}
                    {parseFloat(item.taxRatePercent) > 0 && (
                      <span className="ml-1.5 rounded bg-terra/10 px-1.5 py-0.5 text-[10px] font-semibold text-terra">
                        PPN {item.taxRatePercent}%
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center text-ink-soft">{parseFloat(item.quantity)}</td>
                  <td className="tnum py-2.5 px-2 text-right text-ink-soft">
                    {Money.fromMinor(item.unitPriceMinor).formatIdr()}
                  </td>
                  <td className="tnum py-2.5 pl-2 text-right font-semibold text-ink">
                    {Money.fromMinor(item.totalMinor).formatIdr()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-full space-y-1.5 text-xs sm:w-64">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span className="tnum">{Money.fromMinor(invoice.subtotalMinor).formatIdr()}</span>
            </div>
            {invoice.discountMinor > 0n && (
              <div className="flex justify-between text-destructive">
                <span>Diskon</span>
                <span className="tnum">-{Money.fromMinor(invoice.discountMinor).formatIdr()}</span>
              </div>
            )}
            {invoice.taxMinor > 0n && (
              <div className="flex justify-between text-ink-soft">
                <span>PPN</span>
                <span className="tnum">{Money.fromMinor(invoice.taxMinor).formatIdr()}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between rounded-xl bg-ink px-3.5 py-2.5 text-white dark:bg-terra">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total</span>
              <span className="tnum font-display text-base font-bold">
                {Money.fromMinor(invoice.totalMinor).formatIdr()}
              </span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Dibayar</span>
              <span className="tnum text-emerald-700">{Money.fromMinor(invoice.amountPaidMinor).formatIdr()}</span>
            </div>
            <div className="flex justify-between font-semibold text-ink">
              <span>Sisa</span>
              <span className="tnum text-destructive">
                {Money.fromMinor(remainingMinor > 0n ? remainingMinor : 0n).formatIdr()}
              </span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <p className="mt-5 whitespace-pre-wrap border-l-2 border-terra pl-3 text-xs leading-relaxed text-ink-soft">
            {invoice.notes}
          </p>
        )}

        {invoice.payments.length > 0 && (
          <div className="mt-5 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Riwayat Pembayaran</p>
            <div className="mt-1.5 divide-y divide-rule/60 overflow-hidden rounded-lg border border-rule">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex justify-between bg-canvas/20 p-2.5">
                  <span className="font-medium text-ink">
                    {p.paymentDate}
                    {p.referenceNumber && <span className="ml-2 text-ink-soft">({p.referenceNumber})</span>}
                  </span>
                  <span className="tnum font-semibold text-emerald-700">
                    {Money.fromMinor(p.amountMinor).formatIdr()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
