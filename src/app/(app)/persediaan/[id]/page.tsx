import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInventoryItem, listItemTransactions } from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ItemDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireContext();
  const item = await getInventoryItem(db, ctx.orgId, id);

  if (!item) notFound();

  const transactions = await listItemTransactions(db, ctx.orgId, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/persediaan">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Kembali
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[var(--color-tinta)]">
              {item.name}
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {item.code}
            </Badge>
          </div>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Kategori: {item.category || "-"} • Satuan: {item.unit}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)]">
          <div className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">Sisa Stok Buku</div>
          <div className="text-2xl font-bold font-mono text-[var(--color-tinta)] mt-1">
            {item.currentQty} {item.unit}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)]">
          <div className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">Biaya Modal Rata-Rata</div>
          <div className="text-2xl font-bold font-mono text-[var(--color-tinta)] mt-1">
            {Money.fromMinor(item.averageCostMinor).formatIdr()}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)]">
          <div className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">Total Nilai Buku</div>
          <div className="text-2xl font-bold font-mono text-[var(--color-tinta)] mt-1">
            {Money.fromMinor(item.totalCostMinor).formatIdr()}
          </div>
        </div>
      </div>

      {/* Kartu Stok / Ledger Mutasi */}
      <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-paper)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--color-terra)]" />
            <h2 className="font-serif font-medium text-[var(--color-tinta)]">
              Kartu Stok (Mutasi Barang)
            </h2>
          </div>
          <span className="text-xs text-[var(--color-ink-muted)]">
            {transactions.length} mutasi tercatat
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase font-mono tracking-wider text-[var(--color-ink-muted)] bg-[var(--color-kanvas)]/50 border-b border-[var(--color-border)]">
              <tr>
                <th className="py-2.5 px-4">Tanggal</th>
                <th className="py-2.5 px-4">Tipe</th>
                <th className="py-2.5 px-4">Keterangan</th>
                <th className="py-2.5 px-4 text-right">Kuantitas</th>
                <th className="py-2.5 px-4 text-right">Biaya/Unit</th>
                <th className="py-2.5 px-4 text-right">Total Mutasi</th>
                <th className="py-2.5 px-4 text-right">Saldo Akhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--color-ink-muted)]">
                    Belum ada riwayat mutasi kartu stok untuk barang ini.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[var(--color-kanvas)]/30">
                    <td className="py-2.5 px-4 font-mono text-xs">{tx.date}</td>
                    <td className="py-2.5 px-4">
                      <Badge
                        variant={tx.type === "IN" ? "default" : tx.type === "OUT" ? "destructive" : "outline"}
                        className="text-xs font-mono"
                      >
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 text-[var(--color-ink-muted)]">{tx.memo || "-"}</td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {tx.type === "OUT" ? `-${tx.qty}` : `+${tx.qty}`}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[var(--color-ink-muted)]">
                      {Money.fromMinor(tx.unitCostMinor).formatIdr()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-medium">
                      {Money.fromMinor(tx.totalCostMinor).formatIdr()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-[var(--color-tinta)]">
                      {tx.resultingQty} {item.unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
