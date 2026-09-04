"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";
import { Printer, ArrowLeft, MessageSquare, LayoutTemplate } from "lucide-react";
import { TemplateFormal, type InvoiceDetailData } from "./template-formal";
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
