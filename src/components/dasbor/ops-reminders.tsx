import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, Package, Receipt } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listInventoryItems } from "@/server/db/repos/inventory.repo";
import { getAgingReportRepo } from "@/server/db/repos/invoices.repo";
import { Money } from "@/core/money/money";

const MONTH_ID = new Intl.DateTimeFormat("id-ID", { month: "long" });

export interface OpsReminderRow {
  icon: typeof Package;
  tint: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
}

/** Tampilan murni (tanpa query) — dipakai pratinjau visual dengan data fixture. */
export function OpsRemindersView({ rows }: { rows: OpsReminderRow[] }) {
  return (
    <div data-testid="ops-reminders" className="rounded-2xl border border-rule bg-paper p-5 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-terra/10 text-terra">
          <AlertTriangle className="size-4" />
        </span>
        <h2 className="font-display text-base font-semibold text-ink">Perlu Perhatian Hari Ini</h2>
        <span className="ml-auto rounded-full bg-terra/10 px-2 py-0.5 text-[11px] font-bold text-terra">
          {rows.length}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {rows.map((r) => (
          <li key={r.title}>
            <Link
              href={r.href}
              className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-canvas"
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${r.tint}`}>
                <r.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink">{r.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-ink-soft">{r.desc}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-terra">
                {r.cta}
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kartu "Perlu Perhatian Hari Ini": computed, tanpa tabel baru.
 *  Stok menipis (<= min) + piutang overdue + tenggat PPh Final (tgl 15 bulan berikut, PP 55/2022). */
export async function OpsReminders() {
  const ctx = await requireContext();
  const [items, aging] = await Promise.all([
    listInventoryItems(db, ctx.orgId),
    getAgingReportRepo(db, ctx.orgId, "INVOICE"),
  ]);

  // Jasa tidak punya stok — hanya barang yang bisa "menipis".
  const lowStock = items.filter(
    (it) =>
      it.itemType === "BARANG" &&
      Number(it.currentQty) <= Number(it.minStockAlert ?? "0"),
  );
  const overdue = aging.itemized
    .filter((it) => it.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const now = new Date();
  const deadline = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  const showTax = daysToDeadline <= 10;

  if (lowStock.length === 0 && overdue.length === 0 && !showTax) return null;

  const rows: OpsReminderRow[] = [];
  if (lowStock.length > 0) {
    rows.push({
      icon: Package,
      tint: "bg-terra/10 text-terra",
      title: `${lowStock.length} barang stok menipis`,
      desc: lowStock.slice(0, 3).map((it) => it.name).join(", ") + (lowStock.length > 3 ? ", …" : ""),
      href: "/persediaan/daftar",
      cta: "Restock",
    });
  }
  if (overdue.length > 0) {
    const top = overdue[0];
    rows.push({
      icon: Receipt,
      tint: "bg-credit/10 text-credit",
      title: `${overdue.length} piutang lewat jatuh tempo`,
      desc: `${top.contactName} · ${top.invoiceNumber} · ${Money.formatIdr(top.outstandingMinor)} (${top.daysOverdue} hari)`,
      href: "/faktur",
      cta: "Tagih",
    });
  }
  if (showTax) {
    rows.push({
      icon: CalendarDays,
      tint: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      title: `PPh Final UMKM jatuh tempo 15 ${MONTH_ID.format(deadline)}`,
      desc: "Setor dan catat sebelum tenggat agar tidak kena sanksi.",
      href: "/pajak",
      cta: "Urus Pajak",
    });
  }

  return <OpsRemindersView rows={rows} />;
}
