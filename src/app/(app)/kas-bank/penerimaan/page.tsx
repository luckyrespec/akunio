import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { CashEntriesTable } from "@/components/kas-bank/cash-entries-table";
import {
  CashEntryDialog,
  type QuickPick,
} from "@/components/kas-bank/cash-entry-dialog";
import { Money } from "@/core/money/money";
import { loadCashPageData } from "../_data";

const QUICK_TERIMA: Array<{ code: string; label: string }> = [
  { code: "4100", label: "Usaha" },
  { code: "4200", label: "Lain-lain" },
  { code: "1200", label: "Terima Piutang" },
  { code: "3100", label: "Setoran Modal" },
];

export default async function PenerimaanPage() {
  const ctx = await requireContext();
  const { entries, leaf, cashAccounts, contacts, summary, monthLabel } =
    await loadCashPageData(ctx.orgId, "TERIMA");
  const quickPicks: QuickPick[] = QUICK_TERIMA.flatMap((q) => {
    const hit = leaf.find((a) => a.code === q.code);
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });
  const showSummary =
    summary.postedTotalMinor > 0n || summary.draftCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penerimaan"
        eyebrow="Catat pemasukan kas dan bank — langsung menjadi jurnal seimbang."
        actions={
          <CashEntryDialog
            kind="TERIMA"
            title="Catat Penerimaan"
            triggerLabel="Tambah Penerimaan"
            cashAccounts={cashAccounts}
            counterAccounts={leaf}
            contacts={contacts}
            quickPicks={quickPicks}
          />
        }
      />
      {showSummary && (
        <p className="text-xs text-ink-soft tnum -mt-3">
          {monthLabel} · Masuk {Money.formatIdr(summary.postedTotalMinor)}
          {summary.draftCount > 0 &&
            ` · ${summary.draftCount} draft menunggu dicek`}
        </p>
      )}
      <CashEntriesTable kind="TERIMA" entries={entries} />
    </div>
  );
}
