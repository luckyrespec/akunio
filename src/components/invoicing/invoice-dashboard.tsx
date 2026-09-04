"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Receipt, TrendingDown, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceList, type InvoiceRow } from "./invoice-list";
import { AgingSummary, type AgingItem } from "./aging-summary";
import { RecordPaymentDialog, type PaymentTargetInvoice } from "./record-payment-dialog";
import { useRouter } from "next/navigation";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";

import { PageHeader } from "@/components/page-header";
import Link from "next/link";

export interface ContactOption {
  id: string;
  name: string;
  type: string;
  paymentTermsDays: number;
}
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";

interface InvoiceDashboardProps {
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
  invoices,
  contacts,
  accounts,
  aging,
}: InvoiceDashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"PIUTANG" | "UTANG" | "AGING">("PIUTANG");
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);
  const [paymentTarget, setPaymentTarget] = React.useState<PaymentTargetInvoice | null>(null);

  const salesInvoices = React.useMemo(() => {
    return invoices.filter((inv) => inv.type === "INVOICE");
  }, [invoices]);

  const purchaseBills = React.useMemo(() => {
    return invoices.filter((inv) => inv.type === "BILL");
  }, [invoices]);

  // KPI Calculations
  const totalArMinor = React.useMemo(() => {
    return salesInvoices
      .filter((inv) => inv.status !== "PAID" && inv.status !== "VOID")
      .reduce((sum, inv) => sum + (inv.totalMinor - inv.amountPaidMinor), 0n);
  }, [salesInvoices]);

  const totalApMinor = React.useMemo(() => {
    return purchaseBills
      .filter((inv) => inv.status !== "PAID" && inv.status !== "VOID")
      .reduce((sum, inv) => sum + (inv.totalMinor - inv.amountPaidMinor), 0n);
  }, [purchaseBills]);

  const overdueArMinor = React.useMemo(() => {
    return salesInvoices
      .filter((inv) => inv.status === "OVERDUE")
      .reduce((sum, inv) => sum + (inv.totalMinor - inv.amountPaidMinor), 0n);
  }, [salesInvoices]);

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
      alert(`Nomor WhatsApp untuk ${item.contactName} belum terdaftar.`);
      return;
    }
    const { waLink } = formatWhatsAppReminder(
      { name: item.contactName, phone: inv.contactPhone },
      { invoiceNumber: item.invoiceNumber, dueDate: item.dueDate, remainingMinor: item.outstandingMinor }
    );
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Faktur & Tagihan"
        eyebrow="Kelola piutang penjualan, utang tagihan pembelian, dan arus jatuh tempo bisnis Anda."
        actions={
          <div className="flex items-center gap-2">
            <Button
              asChild
              className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]"
            >
              <Link href="/faktur/baru?tipe=invoice">
                <Plus data-icon="inline-start" />
                Buat Faktur Penjualan
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="border-rule text-ink hover:bg-canvas text-xs h-9 rounded-xl transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]"
            >
              <Link href="/faktur/baru?tipe=bill">
                <Plus data-icon="inline-start" />
                Catat Tagihan Vendor
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StaggerItem className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Total Piutang Beredar</span>
            <Receipt className="size-4 text-terra" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-ink tnum">
            <AnimatedNumber minor={totalArMinor} />
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Dari {salesInvoices.length} faktur penjualan</div>
        </StaggerItem>

        <StaggerItem className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Piutang Jatuh Tempo (Overdue)</span>
            <Clock className="size-4 text-destructive" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-destructive tnum">
            <AnimatedNumber minor={overdueArMinor} />
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Perlu penagihan segera</div>
        </StaggerItem>

        <StaggerItem className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Total Utang Usaha (Bills)</span>
            <TrendingDown className="size-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-ink tnum">
            <AnimatedNumber minor={totalApMinor} />
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Dari {purchaseBills.length} tagihan pemasok</div>
        </StaggerItem>
      </Stagger>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1.5 border-b border-rule pb-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "PIUTANG"}
          onClick={() => setActiveTab("PIUTANG")}
          className={`relative rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === "PIUTANG"
              ? "text-white"
              : "text-ink-soft hover:text-ink hover:bg-canvas"
          }`}
        >
          {activeTab === "PIUTANG" && (
            <motion.span
              layoutId="faktur-tab-pill"
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 rounded-lg bg-terra shadow-2xs"
            />
          )}
          <span className="relative z-10">Piutang (Faktur Penjualan)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "UTANG"}
          onClick={() => setActiveTab("UTANG")}
          className={`relative rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === "UTANG"
              ? "text-white"
              : "text-ink-soft hover:text-ink hover:bg-canvas"
          }`}
        >
          {activeTab === "UTANG" && (
            <motion.span
              layoutId="faktur-tab-pill"
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 rounded-lg bg-terra shadow-2xs"
            />
          )}
          <span className="relative z-10">Utang (Tagihan Pembelian)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "AGING"}
          onClick={() => setActiveTab("AGING")}
          className={`relative rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === "AGING"
              ? "text-white"
              : "text-ink-soft hover:text-ink hover:bg-canvas"
          }`}
        >
          {activeTab === "AGING" && (
            <motion.span
              layoutId="faktur-tab-pill"
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 rounded-lg bg-terra shadow-2xs"
            />
          )}
          <span className="relative z-10">Analisis Umur Piutang (Aging)</span>
        </button>
      </div>

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
        <InvoiceList invoices={salesInvoices} onOpenPayment={handleOpenPayment} />
      )}

      {activeTab === "UTANG" && (
        <InvoiceList invoices={purchaseBills} onOpenPayment={handleOpenPayment} />
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
