import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { CashEntryForm } from "@/components/kas-bank/cash-entry-form";
import { dailyInsight } from "@/core/kas-bank/insights";
import { loadCashPageData } from "../../_data";

export default async function TransferBaruPage() {
  const ctx = await requireContext();
  const { cashAccounts } = await loadCashPageData(ctx.orgId, "TRANSFER");

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/kas-bank/transfer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Transfer Bank
        </Link>
      </div>

      <CashEntryForm
        kind="TRANSFER"
        title="Catat Transfer"
        detailBasePath="/kas-bank/transfer"
        cashAccounts={cashAccounts}
        counterAccounts={cashAccounts}
        contacts={[]}
        quickPicks={[]}
        insight={dailyInsight()}
        transferMode
      />
    </section>
  );
}
