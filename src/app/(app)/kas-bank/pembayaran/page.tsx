import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { CashEntriesTable } from "@/components/kas-bank/cash-entries-table";
import {
  CashEntryDialog,
  type QuickPick,
} from "@/components/kas-bank/cash-entry-dialog";
import { Money } from "@/core/money/money";
import { loadCashPageData } from "../_data";

const QUICK_BAYAR: Array<{ code: string; label: string }> = [
  { code: "5900", label: "Beban Lain" },
  { code: "5200", label: "Gaji" },
  { code: "2100", label: "Bayar Utang" },
  { code: "3300", label: "Prive" },
];

export default async function PembayaranPage() {
  const ctx = await requireContext();
  const { entries, leaf, cashAccounts, contacts, summary, monthLabel } =
    await loadCashPageData(ctx.orgId, "BAYAR");
  const quickPicks: QuickPick[] = QUICK_BAYAR.flatMap((q) => {
    const hit = leaf.find((a) => a.code === q.code);
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });
  const showSummary =
    summary.postedTotalMinor > 0n || summary.draftCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pembayaran"
        eyebrow="Catat pengeluaran kas dan bank — langsung menjadi jurnal seimbang."
        actions={
          <CashEntryDialog
            kind="BAYAR"
            title="Catat Pembayaran"
            triggerLabel="Tambah Pembayaran"
            cashAccounts={cashAccounts}
            counterAccounts={leaf}
            contacts={contacts}
            quickPicks={quickPicks}
          />
        }
      />
      {showSummary && (
        <p className="text-xs text-ink-soft tnum -mt-3">
          {monthLabel} · Keluar {Money.formatIdr(summary.postedTotalMinor)}
          {summary.draftCount > 0 &&
            ` · ${summary.draftCount} draft menunggu dicek`}
        </p>
      )}
      <CashEntriesTable kind="BAYAR" entries={entries} />
    </div>
  );
}
