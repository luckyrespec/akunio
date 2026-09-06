import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { CashEntryForm } from "@/components/kas-bank/cash-entry-form";
import { loadCashPageData } from "../../_data";

export default async function TransferBaruPage() {
  const ctx = await requireContext();
  const { cashAccounts } = await loadCashPageData(ctx.orgId, "TRANSFER");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catat Transfer"
        eyebrow="Pindah dana antar kas dan bank — tersimpan sebagai bukti bernomor."
      />
      <CashEntryForm
        kind="TRANSFER"
        detailBasePath="/kas-bank/transfer"
        cashAccounts={cashAccounts}
        counterAccounts={cashAccounts}
        contacts={[]}
        quickPicks={[]}
        transferMode
      />
    </div>
  );
}
