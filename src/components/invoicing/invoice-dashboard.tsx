"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { InvoiceList, type InvoiceRow } from "./invoice-list";
import { AgingSummary, type AgingItem } from "./aging-summary";
import { RecordPaymentDialog, type PaymentTargetInvoice } from "./record-payment-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";

export interface ContactOption {
  id: string;
  name: string;
  type: string;
  paymentTermsDays: number;
}

const STATUS_OPTIONS = [
  { key: null, label: "Semua status" },
  { key: "DRAFT", label: "Draf" },
  { key: "ISSUED", label: "Belum Bayar" },
  { key: "PARTIALLY_PAID", label: "Parsial" },
  { key: "OVERDUE", label: "Jatuh Tempo" },
  { key: "PAID", label: "Lunas" },
] as const;

/** Filter murni: cocokkan nomor/nama kontak + status. */
export function filterInvoices(
  invoices: readonly InvoiceRow[],
  filter: { query: string; status: string | null },
): InvoiceRow[] {
  const q = filter.query.trim().toLowerCase();
  return invoices.filter(
    (inv) =>
      (!filter.status || inv.status === filter.status) &&
      (q.length === 0 ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.contactName.toLowerCase().includes(q)),
  );
}

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
  const [query, setQuery] = React.useState("");
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

  const q = query.trim().toLowerCase();
  const statusCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of baseList) {
      if (inv.status === "VOID") continue;
      m.set(inv.status, (m.get(inv.status) ?? 0) + 1);
    }
    return m;
  }, [baseList]);

  const visibleSales = React.useMemo(
    () => filterInvoices(salesInvoices, { query, status: statusFilter }),
    [salesInvoices, query, statusFilter],
  );
  const visibleBills = React.useMemo(
    () => filterInvoices(purchaseBills, { query, status: statusFilter }),
    [purchaseBills, query, statusFilter],
  );
  const visibleActive = activeTab === "UTANG" ? visibleBills : visibleSales;
  const filterActive = query.trim().length > 0 || statusFilter !== null;

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

      {/* Filter: pencarian + status — satu bar tegas pengganti segmen nominal */}
      {activeTab !== "AGING" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nomor faktur atau nama kontak…"
                aria-label="Cari faktur"
                className="h-10 bg-paper pl-9 pr-9 text-sm"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terra/60"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select
              value={statusFilter ?? "ALL"}
              onValueChange={(v) => setStatusFilter(v === "ALL" ? null : v)}
            >
              <SelectTrigger aria-label="Filter status" className="h-10 w-full bg-paper text-sm sm:w-52">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.label} value={o.key ?? "ALL"}>
                    {o.label}
                    {o.key !== null && (statusCounts.get(o.key) ?? 0) > 0
                      ? ` (${statusCounts.get(o.key)})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="tnum text-[11px] text-ink-soft" aria-live="polite">
              Menampilkan {visibleActive.length} dari {baseList.length} dokumen
            </p>
            {filterActive && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter(null);
                }}
                className="shrink-0 text-[11px] font-semibold text-terra underline underline-offset-2 hover:text-terra/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra/60"
              >
                Hapus filter
              </button>
            )}
          </div>
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

      {/* Contents — render langsung tanpa animasi pindah tab */}
      {activeTab === "PIUTANG" && (
        <InvoiceList
          invoices={visibleSales}
          onOpenPayment={handleOpenPayment}
          emptyHint={
            filterActive
              ? `Tidak ada faktur penjualan yang cocok${query.trim().length > 0 ? ` dengan "${query.trim()}"` : ""}${statusFilter ? " pada status ini" : ""}.`
              : undefined
          }
        />
      )}

      {activeTab === "UTANG" && (
        <InvoiceList
          invoices={visibleBills}
          onOpenPayment={handleOpenPayment}
          emptyHint={
            filterActive
              ? `Tidak ada tagihan pembelian yang cocok${query.trim().length > 0 ? ` dengan "${query.trim()}"` : ""}${statusFilter ? " pada status ini" : ""}.`
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
