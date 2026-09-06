import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInventoryItem } from "@/server/db/repos/inventory.repo";
import { accounts } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";
import { Money } from "@/core/money/money";
import { JasaArsipButton } from "./jasa-arsip-button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JasaDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireContext();
  const item = await getInventoryItem(db, ctx.orgId, id);

  if (!item || item.itemType !== "JASA") notFound();

  const accRows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.orgId, ctx.orgId)));
  const accName = (accountId: string | null) =>
    accountId ? (accRows.find((a) => a.id === accountId) ?? null) : null;
  const revenue = accName(item.revenueAccountId);
  const expense = accName(item.expenseAccountId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/persediaan/jasa"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-terra"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Jasa &amp; Layanan
        </Link>
        <JasaArsipButton itemId={item.id} isActive={item.isActive} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl border border-terra/25 bg-terra/10 text-terra">
          <Wrench className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold tracking-tight text-ink">{item.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {item.code}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {item.isActive ? "Aktif" : "Arsip"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">
            Kategori: {item.category || "-"} • Satuan: {item.unit}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-rule bg-paper p-4">
          <div className="font-mono text-[11px] uppercase text-ink-soft">Harga Jual</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">
            {Money.fromMinor(item.standardSellingPriceMinor).formatIdr()}
          </div>
        </div>
        <div className="rounded-xl border border-rule bg-paper p-4">
          <div className="font-mono text-[11px] uppercase text-ink-soft">Akun Pendapatan</div>
          <div className="mt-1 text-sm font-medium text-ink">
            {revenue ? `${revenue.code} — ${revenue.name}` : "Default (4130 → 4100)"}
          </div>
        </div>
        <div className="rounded-xl border border-rule bg-paper p-4">
          <div className="font-mono text-[11px] uppercase text-ink-soft">Akun Beban Pembelian</div>
          <div className="mt-1 text-sm font-medium text-ink">
            {expense ? `${expense.code} — ${expense.name}` : "Default (5100)"}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Link href="/faktur/baru">
          <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs">
            Buat Faktur dengan Jasa ini
          </Button>
        </Link>
      </div>
    </div>
  );
}
