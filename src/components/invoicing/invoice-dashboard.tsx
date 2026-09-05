"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Clock, LayoutGrid, FileText, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { InvoiceList, type InvoiceRow } from "./invoice-list";
import { AgingSummary, type AgingItem } from "./aging-summary";
import { RecordPaymentDialog, type PaymentTargetInvoice } from "./record-payment-dialog";
import { useRouter } from "next/navigation";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";

export interface ContactOption {
  id: string;
  name: string;
  type: string;
  paymentTermsDays: number;
}
import { Reveal, AnimatedNumber } from "@/components/motion";

const TAB_HEADINGS = {
  PIUTANG: { title: "Piutang Usaha", desc: "Tagihan penjualan yang belum lunas." },
  UTANG: { title: "Utang Usaha", desc: "Tagihan pembelian yang belum dibayar." },
  AGING: { title: "Analisis Umur Piutang", desc: "Pengelompokan tagihan beredar menurut umur." },
} as const;

interface InvoiceDashboardProps {
  initialTab: "PIUTANG" | "UTANG" | "AGING";
  invoices: InvoiceRow[];
  contacts: ContactOption[];
  accounts: Array<{ id: string; code: string; name: string }>;
  aging: {
    totalOutstandingMinor: bigint;
    buckets: {
      currentMinor: bigint;
      days1To30Minor: bigint;
      days31To60Minor: bigint;
      daysOver60Minor: bigint;
    };
    itemized: AgingItem[];
  };
}

export function InvoiceDashboard({
  initialTab,
  invoices,
  contacts,
  accounts,
  aging,
}: InvoiceDashboardProps) {
  const router = useRouter();
  const activeTab = initialTab;
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);
  const [paymentTarget, setPaymentTarget] = React.useState<PaymentTargetInvoice | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const salesInvoices = React.useMemo(() => {
    return invoices.filter((inv) => inv.type === "INVOICE");
  }, [invoices]);

  const purchaseBills = React.useMemo(() => {
    return invoices.filter((inv) => inv.type === "BILL");
  }, [invoices]);

  const baseList = activeTab === "UTANG" ? purchaseBills : salesInvoices;

  const segments = React.useMemo(() => {
    const outstanding = (inv: InvoiceRow) => inv.totalMinor - inv.amountPaidMinor;
    const defs: Array<{ key: string | null; label: string; icon: typeof FileText; match: (inv: InvoiceRow) => boolean }> = [
      { key: null, label: "Semua", icon: LayoutGrid, match: () => true },
      { key: "DRAFT", label: "Draf", icon: FileText, match: (inv) => inv.status === "DRAFT" },
      { key: "ISSUED", label: "Belum Bayar", icon: Send, match: (inv) => inv.status === "ISSUED" },
      { key: "PARTIALLY_PAID", label: "Parsial", icon: Clock, match: (inv) => inv.status === "PARTIALLY_PAID" },
      { key: "OVERDUE", label: "Jatuh Tempo", icon: AlertCircle, match: (inv) => inv.status === "OVERDUE" },
      { key: "PAID", label: "Lunas", icon: CheckCircle2, match: (inv) => inv.status === "PAID" },
    ];
    return defs.map((d) => {
      const rows = baseList.filter((inv) => inv.status !== "VOID" && d.match(inv));
      const amount = rows.reduce(
        (sum, inv) => sum + (inv.status === "PAID" ? inv.totalMinor : outstanding(inv)),
        0n,
      );
      return { ...d, count: rows.length, amount };
    });
  }, [baseList]);

  const visibleSales = statusFilter
    ? salesInvoices.filter((inv) => inv.status === statusFilter)
    : salesInvoices;
  const visibleBills = statusFilter
    ? purchaseBills.filter((inv) => inv.status === statusFilter)
    : purchaseBills;

  function handleOpenPayment(inv: InvoiceRow) {
    setPaymentTarget({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type as "INVOICE" | "BILL",
      totalMinor: inv.totalMinor,
      amountPaidMinor: inv.amountPaidMinor,
    });
    setPaymentDialogOpen(true);
  }

  function handleSendReminderFromAging(item: AgingItem) {
    const inv = invoices.find((i) => i.id === item.invoiceId);
    if (!inv || !inv.contactPhone) {
      setNotice(`Nomor WhatsApp untuk ${item.contactName} belum terdaftar — lengkapi di halaman Kontak dulu.`);
      return;
    }
    setNotice(null);
    const { waLink } = formatWhatsAppReminder(
      { name: item.contactName, phone: inv.contactPhone },
      { invoiceNumber: item.invoiceNumber, dueDate: item.dueDate, remainingMinor: item.outstandingMinor }
    );
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
          {TAB_HEADINGS[activeTab].title}
        </h1>
        <p className="mt-1 text-xs text-ink-soft">{TAB_HEADINGS[activeTab].desc}</p>
      </div>

      {/* Status pipeline — segmen dapat diklik untuk memfilter daftar di bawah */}
      {activeTab !== "AGING" && (
        <div className="grid grid-cols-2 divide-rule/70 rounded-2xl border border-rule bg-paper shadow-2xs sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          {segments.map((s) => {
            const active = statusFilter === s.key;
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => setStatusFilter(active ? null : s.key)}
                aria-pressed={active}
                className={`flex min-w-0 flex-col gap-1 rounded-xl px-4 py-3.5 text-left transition-colors focus-ring ${
                  active ? "bg-terra/[0.07]" : "hover:bg-canvas/70"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  <Icon className={`size-3.5 ${active ? "text-terra" : ""}`} />
                  {s.label}
                </span>
                <span className={`tnum truncate text-lg font-semibold tracking-tight ${active ? "text-terra" : "text-ink"}`}>
                  <AnimatedNumber minor={s.amount} />
                </span>
                <span className="text-[11px] text-ink-soft">
                  {s.count} dokumen{s.key === "PAID" ? " terlunasi" : " beredar"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {notice && (
        <div
          role="alert"
          className="motion-keep-fade flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-semibold underline underline-offset-2 hover:text-ink"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Tab Contents */}
      <Reveal delay={0.08}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
      {activeTab === "PIUTANG" && (
        <InvoiceList
          invoices={visibleSales}
          onOpenPayment={handleOpenPayment}
          emptyHint={
            statusFilter
              ? "Tidak ada faktur penjualan pada status ini."
              : undefined
          }
        />
      )}

      {activeTab === "UTANG" && (
        <InvoiceList
          invoices={visibleBills}
          onOpenPayment={handleOpenPayment}
          emptyHint={
            statusFilter
              ? "Tidak ada tagihan pembelian pada status ini."
              : undefined
          }
        />
      )}

      {activeTab === "AGING" && (
        <AgingSummary
          currentMinor={aging.buckets.currentMinor}
          days1To30Minor={aging.buckets.days1To30Minor}
          days31To60Minor={aging.buckets.days31To60Minor}
          daysOver60Minor={aging.buckets.daysOver60Minor}
          totalOutstandingMinor={aging.totalOutstandingMinor}
          itemized={aging.itemized}
          onSendReminder={handleSendReminderFromAging}
        />
      )}
        </motion.div>
      </AnimatePresence>
      </Reveal>

      {/* Dialogs */}
      <RecordPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoice={paymentTarget}
        accountsList={accounts}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
