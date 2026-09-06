import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CashEntriesTable } from "@/components/kas-bank/cash-entries-table";
import { Money } from "@/core/money/money";
import { loadCashPageData } from "../_data";

export default async function PembayaranPage() {
  const ctx = await requireContext();
  const { entries, summary, monthLabel } = await loadCashPageData(
    ctx.orgId,
    "BAYAR"
  );
  const showSummary =
    summary.postedTotalMinor > 0n || summary.draftCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pembayaran"
        eyebrow="Catat pengeluaran kas dan bank — langsung menjadi jurnal seimbang."
        actions={
          <Link href="/kas-bank/pembayaran/baru">
            <Button
              size="sm"
              className="h-9 rounded-xl bg-terra px-3.5 text-xs font-medium text-white shadow-none transition-all hover:bg-terra/90 active:scale-[0.98]"
            >
              <Plus className="size-4 mr-1.5" />
              Tambah Pembayaran
            </Button>
          </Link>
        }
      />
      {showSummary && (
        <p className="text-xs text-ink-soft tnum -mt-3">
          {monthLabel} · Keluar {Money.formatIdr(summary.postedTotalMinor)}
          {summary.draftCount > 0 &&
            ` · ${summary.draftCount} draft menunggu dicek`}
        </p>
      )}
      <CashEntriesTable
        kind="BAYAR"
        entries={entries}
        detailBasePath="/kas-bank/pembayaran"
      />
    </div>
  );
}
