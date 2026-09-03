"use client";

import * as React from "react";
import { Plus, Receipt, TrendingDown, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceList, type InvoiceRow } from "./invoice-list";
import { AgingSummary, type AgingItem } from "./aging-summary";
import { CreateInvoiceDialog, type ContactOption } from "./create-invoice-dialog";
import { RecordPaymentDialog, type PaymentTargetInvoice } from "./record-payment-dialog";
import { Money } from "@/core/money/money";
import { useRouter } from "next/navigation";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";

import { PageHeader } from "@/components/page-header";

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
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createDialogType, setCreateDialogType] = React.useState<"INVOICE" | "BILL">("INVOICE");
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

  function handleOpenCreate(type: "INVOICE" | "BILL") {
    setCreateDialogType(type);
    setCreateDialogOpen(true);
  }

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
              onClick={() => handleOpenCreate("INVOICE")}
              className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs"
            >
              <Plus className="size-4 mr-1.5" />
              Buat Faktur Penjualan
            </Button>

            <Button
              variant="outline"
              onClick={() => handleOpenCreate("BILL")}
              className="border-rule text-ink hover:bg-canvas text-xs h-9 rounded-xl"
            >
              <Plus className="size-4 mr-1.5" />
              Catat Tagihan Vendor
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Total Piutang Beredar</span>
            <Receipt className="size-4 text-terra" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-ink">
            {Money.fromMinor(totalArMinor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Dari {salesInvoices.length} faktur penjualan</div>
        </div>

        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Piutang Jatuh Tempo (Overdue)</span>
            <Clock className="size-4 text-destructive" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-destructive">
            {Money.fromMinor(overdueArMinor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Perlu penagihan segera</div>
        </div>

        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Total Utang Usaha (Bills)</span>
            <TrendingDown className="size-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-ink">
            {Money.fromMinor(totalApMinor).formatIdr()}
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Dari {purchaseBills.length} tagihan pemasok</div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1.5 border-b border-rule pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("PIUTANG")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === "PIUTANG"
              ? "bg-terra text-white shadow-2xs"
              : "text-ink-soft hover:text-ink hover:bg-canvas"
          }`}
        >
          Piutang (Faktur Penjualan)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("UTANG")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === "UTANG"
              ? "bg-terra text-white shadow-2xs"
              : "text-ink-soft hover:text-ink hover:bg-canvas"
          }`}
        >
          Utang (Tagihan Pembelian)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("AGING")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === "AGING"
              ? "bg-terra text-white shadow-2xs"
              : "text-ink-soft hover:text-ink hover:bg-canvas"
          }`}
        >
          Analisis Umur Piutang (Aging)
        </button>
      </div>

      {/* Tab Contents */}
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

      {/* Dialogs */}
      <CreateInvoiceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultType={createDialogType}
        contactsList={contacts}
        onSuccess={() => {
          router.refresh();
        }}
      />

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
