import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAssetCards } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/motion";
import { Money } from "@/core/money/money";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "border-emerald-500/30 text-emerald-700 bg-emerald-500/10",
  FULLY_DEPRECIATED: "border-blue-500/30 text-blue-700 bg-blue-500/10",
  DISPOSED: "border-rose-500/30 text-rose-700 bg-rose-500/10",
};

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "Aktif",
  FULLY_DEPRECIATED: "Lunas Susut",
  DISPOSED: "Dilepas",
};

export default async function AsetPembantuPage() {
  const ctx = await requireContext();
  const rows = await listAssetCards(db, ctx.orgId);
  const totalCost = rows.reduce((a, r) => a + r.acquisitionCostMinor, 0n);
  const totalAccum = rows.reduce((a, r) => a + r.accumulatedMinor, 0n);
  const totalBook = rows.reduce((a, r) => a + r.bookValueMinor, 0n);

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Aset"
        eyebrow="Biaya perolehan, akumulasi penyusutan, dan nilai buku tiap unit aset tetap"
        actions={
          <Link href="/aset/baru">
            <Button className="bg-terra text-white hover:bg-terra/90 text-xs h-9 rounded-xl shadow-2xs">
              <Plus data-icon="inline-start" />
              Tambah Aset
            </Button>
          </Link>
        }
      />
      <p className="text-xs text-ink-soft" role="status">
        {rows.length} unit · total perolehan{" "}
        <AnimatedNumber minor={totalCost} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
        {" "}· total nilai buku{" "}
        <AnimatedNumber minor={totalBook} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
      </p>
      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tnum">
            <thead className="border-b border-rule bg-canvas/80 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Aset</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Biaya Perolehan</th>
                <th className="px-4 py-3 text-right">Akumulasi Susut</th>
                <th className="px-4 py-3 text-right">Nilai Buku</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 text-ink">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-soft">
                    <FileText className="mx-auto mb-2 size-8 text-ink-soft/40" />
                    <p className="text-xs">Belum ada aset tetap terdaftar. Klik “Tambah Aset” untuk mendaftarkan aset baru.</p>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="row-enter hover:bg-canvas/40 transition-colors"
                    style={{ "--row-i": i } as CSSProperties}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-terra">{r.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/aset/${r.id}`} className="focus-ring rounded-md hover:text-terra transition-colors">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{r.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(r.acquisitionCostMinor)}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(r.accumulatedMinor)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tnum">{Money.formatIdr(r.bookValueMinor)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={STATUS_BADGE[r.status] ?? ""}>
                        {STATUS_TEXT[r.status] ?? r.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
                  <td colSpan={3} className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft">
                    Total
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totalCost)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totalAccum)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink tnum">
                    {Money.formatIdr(totalBook)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
