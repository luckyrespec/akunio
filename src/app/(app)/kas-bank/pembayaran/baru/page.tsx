import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import {
  CashEntryForm,
  type QuickPick,
} from "@/components/kas-bank/cash-entry-form";
import { loadCashPageData } from "../../_data";

const QUICK_BAYAR: Array<{ code: string; label: string }> = [
  { code: "5900", label: "Beban Lain" },
  { code: "5200", label: "Gaji" },
  { code: "2100", label: "Bayar Utang" },
  { code: "3300", label: "Prive" },
];

export default async function PembayaranBaruPage() {
  const ctx = await requireContext();
  const { leaf, cashAccounts, contacts } = await loadCashPageData(
    ctx.orgId,
    "BAYAR"
  );
  const quickPicks: QuickPick[] = QUICK_BAYAR.flatMap((q) => {
    const hit = leaf.find((a) => a.code === q.code);
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catat Pembayaran"
        eyebrow="Pengeluaran kas dan bank — tersimpan sebagai bukti bernomor."
      />
      <CashEntryForm
        kind="BAYAR"
        detailBasePath="/kas-bank/pembayaran"
        cashAccounts={cashAccounts}
        counterAccounts={leaf}
        contacts={contacts}
        quickPicks={quickPicks}
      />
    </div>
  );
}
