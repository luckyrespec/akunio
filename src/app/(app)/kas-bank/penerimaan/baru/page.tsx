import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { CashEntryForm } from "@/components/kas-bank/cash-entry-form";
import type { QuickPick } from "@/components/kas-bank/cash-entry-form";
import { loadCashPageData } from "../../_data";

const QUICK_TERIMA: Array<{ codes: string[]; label: string }> = [
  { codes: ["4110", "4130", "4150", "4160", "4180", "4100"], label: "Usaha" },
  { codes: ["4200"], label: "Lain-lain" },
  { codes: ["1200"], label: "Terima Piutang" },
  { codes: ["3100"], label: "Setoran Modal" },
];

export default async function PenerimaanBaruPage() {
  const ctx = await requireContext();
  const { leaf, cashAccounts, contacts } = await loadCashPageData(
    ctx.orgId,
    "TERIMA"
  );
  const quickPicks: QuickPick[] = QUICK_TERIMA.flatMap((q) => {
    const hit = leaf.find((a) => q.codes.includes(a.code));
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/kas-bank/penerimaan"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Penerimaan
        </Link>
      </div>

      <CashEntryForm
        kind="TERIMA"
        title="Catat Penerimaan"
        detailBasePath="/kas-bank/penerimaan"
        cashAccounts={cashAccounts}
        counterAccounts={leaf}
        contacts={contacts}
        quickPicks={quickPicks}
      />
    </section>
  );
}
