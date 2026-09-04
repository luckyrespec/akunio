import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getStockOpnameWithItems } from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import { GenerateDraftButton } from "./generate-draft-button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StockOpnameDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireContext();
  const opname = await getStockOpnameWithItems(db, ctx.orgId, id);

  if (!opname) notFound();

  const totalDiffMinor = opname.totalDifferenceValueMinor;
  const isDeficit = totalDiffMinor < 0n;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/persediaan/opname">
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Kembali
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-serif tracking-tight text-[var(--color-tinta)]">
                Stok Opname {opname.number}
              </h1>
              <Badge
                variant={
                  opname.status === "COMPLETED"
                    ? "default"
                    : opname.status === "REVIEW_DRAFT_JOURNAL"
                    ? "secondary"
                    : "outline"
                }
              >
                {opname.status === "REVIEW_DRAFT_JOURNAL"
                  ? "Draf Jurnal Terbit"
                  : opname.status === "COMPLETED"
                  ? "Selesai"
                  : "Draf"}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Tanggal: {opname.opnameDate} {opname.notes && `• ${opname.notes}`}
            </p>
          </div>
        </div>

        {/* Tombol Opsi A: Generate Draf Jurnal */}
        <div className="flex items-center gap-2">
          {opname.status === "DRAFT" && (
            <GenerateDraftButton opnameId={opname.id} />
          )}

          {opname.journalEntryId && (
            <Link href={`/jurnal`}>
              <Button className="bg-[var(--color-tinta)] text-[var(--color-paper)] hover:opacity-90">
                <FileText className="w-4 h-4 mr-1.5" />
                Buka Jurnal Penyesuaian
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Ringkasan Finansial Selisih */}
      <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] flex items-center justify-between">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
            Total Dampak Selisih Finansial
          </span>
          <div
            className={`text-2xl font-bold font-mono mt-0.5 ${
              isDeficit
                ? "text-red-600"
                : totalDiffMinor > 0n
                ? "text-emerald-700"
                : "text-[var(--color-tinta)]"
            }`}
          >
            {Money.fromMinor(totalDiffMinor).formatIdr()}
          </div>
        </div>
        <div className="text-right text-xs text-[var(--color-ink-muted)]">
          {opname.items.length} item diperiksa
        </div>
      </div>

      {/* Rincian Item Opname */}
      <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-paper)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase font-mono tracking-wider text-[var(--color-ink-muted)] bg-[var(--color-kanvas)]/50 border-b border-[var(--color-border)]">
              <tr>
                <th className="py-3 px-4">Barang (SKU)</th>
                <th className="py-3 px-4 text-right">Stok Sistem</th>
                <th className="py-3 px-4 text-right">Hitungan Fisik</th>
                <th className="py-3 px-4 text-right">Selisih Unit</th>
                <th className="py-3 px-4 text-right">Harga Modal</th>
                <th className="py-3 px-4 text-right">Selisih Nilai (Rp)</th>
                <th className="py-3 px-4">Keterangan / Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {opname.items.map((it) => {
                const diff = Number(it.differenceQty);
                const diffVal = it.differenceValueMinor;
                return (
                  <tr key={it.id} className="hover:bg-[var(--color-kanvas)]/30">
                    <td className="py-3 px-4">
                      <div className="font-medium">{it.itemName}</div>
                      <div className="text-xs font-mono text-[var(--color-ink-muted)]">
                        {it.itemCode}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--color-ink-muted)]">
                      {it.systemQty} {it.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      {it.physicalQty} {it.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span
                        className={
                          diff < 0
                            ? "text-red-600 font-medium"
                            : diff > 0
                            ? "text-emerald-700 font-medium"
                            : "text-[var(--color-ink-muted)]"
                        }
                      >
                        {diff > 0 ? `+${diff}` : diff} {it.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--color-ink-muted)]">
                      {Money.fromMinor(it.unitCostMinor).formatIdr()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      <span
                        className={
                          diffVal < 0n
                            ? "text-red-600"
                            : diffVal > 0n
                            ? "text-emerald-700"
                            : "text-[var(--color-ink-muted)]"
                        }
                      >
                        {Money.fromMinor(diffVal).formatIdr()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--color-ink-muted)] text-xs">
                      {it.reason || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
