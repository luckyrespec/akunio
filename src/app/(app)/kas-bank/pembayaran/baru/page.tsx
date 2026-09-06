import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { CashEntryForm } from "@/components/kas-bank/cash-entry-form";
import type { QuickPick } from "@/components/kas-bank/cash-entry-form";
import { dailyInsight } from "@/core/kas-bank/insights";
import { loadCashPageData } from "../../_data";

const QUICK_BAYAR: Array<{ codes: string[]; label: string }> = [
  { codes: ["5900"], label: "Beban Lain" },
  { codes: ["5200", "5210", "5170", "5140", "5150", "5180"], label: "Gaji" },
  { codes: ["2100"], label: "Bayar Utang" },
  { codes: ["3300"], label: "Prive" },
];

export default async function PembayaranBaruPage() {
  const ctx = await requireContext();
  const { leaf, cashAccounts, contacts } = await loadCashPageData(
    ctx.orgId,
    "BAYAR"
  );
  const quickPicks: QuickPick[] = QUICK_BAYAR.flatMap((q) => {
    const hit = q.codes
      .map((code) => leaf.find((a) => a.code === code))
      .find((a): a is (typeof leaf)[number] => !!a);
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/kas-bank/pembayaran"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Pembayaran
        </Link>
      </div>

      <CashEntryForm
        kind="BAYAR"
        title="Catat Pembayaran"
        detailBasePath="/kas-bank/pembayaran"
        cashAccounts={cashAccounts}
        counterAccounts={leaf}
        contacts={contacts}
        quickPicks={quickPicks}
        insight={dailyInsight()}
      />
    </section>
  );
}
