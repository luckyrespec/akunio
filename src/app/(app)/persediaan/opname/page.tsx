import Link from "next/link";
import { ArrowLeft, Plus, ClipboardCheck, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listStockOpnames } from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";

export const metadata = {
  title: "Sesi Stok Opname | Akunio",
};

export default async function StockOpnameListPage() {
  const ctx = await requireContext();
  const opnames = await listStockOpnames(db, ctx.orgId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/persediaan">
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Kembali
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-serif tracking-tight text-[var(--color-tinta)]">
              Sesi Stok Opname Fisik
            </h1>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Pencocokan kuantitas fisik gudang dengan saldo sistem dan penerbitan draf penyesuaian.
            </p>
          </div>
        </div>
        <Link href="/persediaan/opname/baru">
          <Button className="bg-[var(--color-tinta)] text-[var(--color-paper)] hover:opacity-90">
            <Plus className="w-4 h-4 mr-1.5" />
            Mulai Opname Baru
          </Button>
        </Link>
      </div>

      <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-paper)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase font-mono tracking-wider text-[var(--color-ink-muted)] bg-[var(--color-kanvas)]/50 border-b border-[var(--color-border)]">
              <tr>
                <th className="py-3 px-4">Nomor Opname</th>
                <th className="py-3 px-4">Tanggal Pelaksanaan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Total Selisih (Rp)</th>
                <th className="py-3 px-4">Catatan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {opnames.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--color-ink-muted)]">
                    Belum ada sesi stok opname yang dibuat. Klik "Mulai Opname Baru" untuk memulai.
                  </td>
                </tr>
              ) : (
                opnames.map((op) => (
                  <tr key={op.id} className="hover:bg-[var(--color-kanvas)]/30">
                    <td className="py-3 px-4 font-mono font-medium">{op.number}</td>
                    <td className="py-3 px-4 font-mono text-xs">{op.opnameDate}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          op.status === "COMPLETED"
                            ? "default"
                            : op.status === "REVIEW_DRAFT_JOURNAL"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {op.status === "REVIEW_DRAFT_JOURNAL"
                          ? "Draf Jurnal Terbit"
                          : op.status === "COMPLETED"
                          ? "Selesai"
                          : "Draf"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      {Money.fromMinor(op.totalDifferenceValueMinor).formatIdr()}
                    </td>
                    <td className="py-3 px-4 text-[var(--color-ink-muted)] max-w-xs truncate">
                      {op.notes || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link href={`/persediaan/opname/${op.id}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          Buka Detail
                        </Button>
                      </Link>
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
