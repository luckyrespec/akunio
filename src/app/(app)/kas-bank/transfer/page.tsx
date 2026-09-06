import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { CashEntriesTable } from "@/components/kas-bank/cash-entries-table";
import { CashEntryDialog } from "@/components/kas-bank/cash-entry-dialog";
import { Money } from "@/core/money/money";
import { loadCashPageData } from "../_data";

export default async function TransferPage() {
  const ctx = await requireContext();
  const { entries, cashAccounts, summary, monthLabel } =
    await loadCashPageData(ctx.orgId, "TRANSFER");
  const showSummary =
    summary.postedTotalMinor > 0n || summary.draftCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfer Bank"
        eyebrow="Pindahkan dana antar kas dan bank — langsung menjadi jurnal seimbang."
        actions={
          <CashEntryDialog
            kind="TRANSFER"
            title="Catat Transfer"
            triggerLabel="Tambah Transfer"
            cashAccounts={cashAccounts}
            counterAccounts={cashAccounts}
            contacts={[]}
            quickPicks={[]}
            transferMode
          />
        }
      />
      {showSummary && (
        <p className="text-xs text-ink-soft tnum -mt-3">
          {monthLabel} · Pindah {Money.formatIdr(summary.postedTotalMinor)}
          {summary.draftCount > 0 &&
            ` · ${summary.draftCount} draft menunggu dicek`}
        </p>
      )}
      <CashEntriesTable kind="TRANSFER" entries={entries} />
    </div>
  );
}
