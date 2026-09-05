"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";
import { Printer, ArrowLeft, MessageSquare, LayoutTemplate, CalendarDays, AlertCircle } from "lucide-react";
import { TemplateFormal, StatusBadge, type InvoiceDetailData } from "./template-formal";
import { Money } from "@/core/money/money";
import { TemplateModern } from "./template-modern";
import { Reveal } from "@/components/motion";

export type { InvoiceDetailData };

type TemplateId = "formal" | "modern";

const TEMPLATE_KEY = "neraca:faktur-template";
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function InvoicePrintView({ invoice }: { invoice: InvoiceDetailData }) {
  const remainingMinor = invoice.totalMinor - invoice.amountPaidMinor;
  const isPaid = invoice.status === "PAID";
  const [template, setTemplate] = React.useState<TemplateId>("formal");

  const dueISO = String(invoice.dueDate).slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round(
    (Date.parse(`${dueISO}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86_400_000,
  );
  const paidPct =
    invoice.totalMinor > 0n ? Number((invoice.amountPaidMinor * 100n) / invoice.totalMinor) : 0;

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_KEY);
      if (saved === "formal" || saved === "modern") setTemplate(saved);
    } catch {}
  }, []);

  function choose(t: TemplateId) {
    setTemplate(t);
    try {
      localStorage.setItem(TEMPLATE_KEY, t);
    } catch {}
  }

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
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link
            href="/faktur"
            className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Kembali ke Faktur & Tagihan</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {/* Template switcher */}
            <div
              className="flex items-center rounded-lg border border-rule bg-paper p-1 shadow-xs"
              role="tablist"
              aria-label="Pilih template dokumen"
            >
              <LayoutTemplate className="size-3.5 ml-1.5 text-ink-soft" />
              {(["formal", "modern"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={template === t}
                  onClick={() => choose(t)}
                  className={`relative rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    template === t ? "text-terra font-semibold" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {template === t && (
                    <motion.span
                      layoutId="faktur-template-pill"
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                      className="absolute inset-0 rounded-md bg-canvas shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{t === "formal" ? "Formal" : "Modern"}</span>
                </button>
              ))}
            </div>

            {invoice.type === "INVOICE" && !isPaid && invoice.contact.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsApp}
                className="text-xs border-emerald-600/30 text-emerald-700 hover:bg-emerald-50"
              >
                <MessageSquare data-icon="inline-start" className="text-emerald-600" />
                Kirim WhatsApp
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs border-rule text-ink"
            >
              <Printer data-icon="inline-start" />
              Cetak / Simpan PDF
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Status rail (layar saja, tidak ikut cetak) */}
      <div className="rounded-2xl border border-rule bg-paper p-5 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Sisa {invoice.type === "INVOICE" ? "tagihan" : "pembayaran"}
            </p>
            <p className="tnum mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
              {Money.fromMinor(remainingMinor > 0n ? remainingMinor : 0n).formatIdr()}
            </p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-valuenow={Math.min(paidPct, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Porsi terbayar"
        >
          <div className="h-full rounded-full bg-debit" style={{ width: `${Math.min(paidPct, 100)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-soft">
          <span>
            Terbayar {Money.fromMinor(invoice.amountPaidMinor).formatIdr()} dari{" "}
            {Money.fromMinor(invoice.totalMinor).formatIdr()} · {invoice.payments.length} pembayaran
          </span>
          {!isPaid && (
            <span className={`inline-flex items-center gap-1 font-semibold ${diffDays < 0 ? "text-destructive" : "text-ink"}`}>
              {diffDays < 0 ? (
                <>
                  <AlertCircle className="size-3.5" />
                  Terlambat {-diffDays} hari
                </>
              ) : (
                <>
                  <CalendarDays className="size-3.5 text-terra" />
                  {diffDays === 0 ? "Jatuh tempo hari ini" : `Jatuh tempo dalam ${diffDays} hari`}
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Printable Invoice Document */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={template}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {template === "formal" ? (
            <TemplateFormal invoice={invoice} />
          ) : (
            <TemplateModern invoice={invoice} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
