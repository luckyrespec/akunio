import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listInventoryItems } from "@/server/db/repos/inventory.repo";
import { getAgingReportRepo } from "@/server/db/repos/invoices.repo";
import { Money } from "@/core/money/money";

const MONTH_ID = new Intl.DateTimeFormat("id-ID", { month: "long" });

/** Kartu "Perlu Perhatian Hari Ini": computed, tanpa tabel baru.
 *  Stok menipis (<= min) + piutang overdue + tenggat PPh Final (tgl 15 bulan berikut, PP 55/2022). */
export async function OpsReminders() {
  const ctx = await requireContext();
  const [items, aging] = await Promise.all([
    listInventoryItems(db, ctx.orgId),
    getAgingReportRepo(db, ctx.orgId, "INVOICE"),
  ]);

  const lowStock = items.filter((it) => Number(it.currentQty) <= Number(it.minStockAlert ?? "0"));
  const overdue = aging.itemized
    .filter((it) => it.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const now = new Date();
  const deadline = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  const showTax = daysToDeadline <= 10;

  if (lowStock.length === 0 && overdue.length === 0 && !showTax) return null;

  const rows: Array<{ title: string; desc: string; href: string; cta: string }> = [];
  if (lowStock.length > 0) {
    rows.push({
      title: `${lowStock.length} barang stok menipis`,
      desc: lowStock.slice(0, 3).map((it) => it.name).join(", ") + (lowStock.length > 3 ? ", …" : ""),
      href: "/persediaan/daftar",
      cta: "Restock",
    });
  }
  if (overdue.length > 0) {
    const top = overdue[0];
    rows.push({
      title: `${overdue.length} piutang lewat jatuh tempo`,
      desc: `${top.contactName} · ${top.invoiceNumber} · ${Money.formatIdr(top.outstandingMinor)} (${top.daysOverdue} hari)`,
      href: "/faktur",
      cta: "Tagih",
    });
  }
  if (showTax) {
    rows.push({
      title: `PPh Final UMKM jatuh tempo 15 ${MONTH_ID.format(deadline)}`,
      desc: "Setor dan catat sebelum tenggat agar tidak kena sanksi.",
      href: "/pajak",
      cta: "Urus Pajak",
    });
  }

  return (
    <div data-testid="ops-reminders" className="rounded-xl border border-rule bg-paper p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-terra" />
        <h2 className="text-sm font-semibold text-ink">Perlu Perhatian Hari Ini</h2>
      </div>
      <ul className="mt-2 divide-y divide-rule/60">
        {rows.map((r) => (
          <li key={r.title} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{r.title}</p>
              <p className="truncate text-[11px] text-ink-soft">{r.desc}</p>
            </div>
            <Link
              href={r.href}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-terra hover:underline"
            >
              {r.cta} <ArrowRight className="size-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
