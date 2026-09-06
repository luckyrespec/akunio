import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import {
  CashEntryForm,
  type QuickPick,
} from "@/components/kas-bank/cash-entry-form";
import { loadCashPageData } from "../../_data";

const QUICK_TERIMA: Array<{ code: string; label: string }> = [
  { code: "4100", label: "Usaha" },
  { code: "4200", label: "Lain-lain" },
  { code: "1200", label: "Terima Piutang" },
  { code: "3100", label: "Setoran Modal" },
];

export default async function PenerimaanBaruPage() {
  const ctx = await requireContext();
  const { leaf, cashAccounts, contacts } = await loadCashPageData(
    ctx.orgId,
    "TERIMA"
  );
  const quickPicks: QuickPick[] = QUICK_TERIMA.flatMap((q) => {
    const hit = leaf.find((a) => a.code === q.code);
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catat Penerimaan"
        eyebrow="Pemasukan kas dan bank — tersimpan sebagai bukti bernomor."
      />
      <CashEntryForm
        kind="TERIMA"
        detailBasePath="/kas-bank/penerimaan"
        cashAccounts={cashAccounts}
        counterAccounts={leaf}
        contacts={contacts}
        quickPicks={quickPicks}
      />
    </div>
  );
}
