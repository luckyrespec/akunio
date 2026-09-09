import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAssetCards } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        <strong className="font-mono text-ink tnum">{Money.formatIdr(totalCost)}</strong>
        {" "}· total nilai buku{" "}
        <strong className="font-mono text-ink tnum">{Money.formatIdr(totalBook)}</strong>
      </p>
      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-canvas/70 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
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
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                    Belum ada aset tetap terdaftar. Klik “Tambah Aset” untuk mendaftarkan aset baru.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-terra">{r.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/aset/${r.id}`} className="hover:text-terra transition-colors">
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
          </table>
        </div>
      </div>
    </div>
  );
}
