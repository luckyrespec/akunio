import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listPrepaidCards } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/core/money/money";
import { FilterBar } from "@/components/subsidiary/filter-bar";

const STATUS_OPTIONS = ["SEMUA", "AKTIF", "SELESAI"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  SEMUA: "Semua",
  AKTIF: "Aktif",
  SELESAI: "Selesai",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "border-emerald-500/30 text-emerald-700 bg-emerald-500/10",
  COMPLETED: "border-blue-500/30 text-blue-700 bg-blue-500/10",
  CANCELLED: "border-rose-500/30 text-rose-700 bg-rose-500/10",
};

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "Aktif",
  COMPLETED: "Selesai",
  CANCELLED: "Batal",
};

export default async function DimukaListPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; st?: string }>;
}) {
  const ctx = await requireContext();
  const rows = await listPrepaidCards(db, ctx.orgId);
  const q = ((await searchParams)?.q ?? "").trim();
  const st = ((await searchParams)?.st ?? "SEMUA").toUpperCase();
  const activeSt = (STATUS_OPTIONS as readonly string[]).includes(st) ? st : "SEMUA";
  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (ql && !`${r.code} ${r.name} ${r.vendor ?? ""}`.toLowerCase().includes(ql)) return false;
    if (activeSt === "AKTIF") return r.status === "ACTIVE";
    if (activeSt === "SELESAI") return r.status !== "ACTIVE";
    return true;
  });
  const isFiltering = q !== "" || activeSt !== "SEMUA";
  const totalSisa = filtered.reduce((a, r) => a + r.remainingMinor, 0n);
  const hrefFor = (nextSt: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (nextSt !== "SEMUA") p.set("st", nextSt);
    const s = p.toString();
    return `/buku-pembantu/dimuka${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Dimuka"
        eyebrow="Nilai kontrak, sudah diakui, dan sisa tiap kontrak sewa/asuransi dibayar di muka"
        actions={
          <Link href="/buku-pembantu/dimuka/baru">
            <Button className="bg-terra text-white hover:bg-terra/90 text-xs h-9 rounded-xl shadow-2xs">
              <Plus data-icon="inline-start" />
              Tambah Kontrak
            </Button>
          </Link>
        }
      />
      <p className="text-xs text-ink-soft" role="status">
        {isFiltering ? `${filtered.length} dari ${rows.length} kontrak` : `${rows.length} kontrak`} · sisa belum diamortisasi{" "}
        <strong className="font-mono text-ink tnum">{Money.formatIdr(totalSisa)}</strong>
      </p>
      <FilterBar
        q={q}
        keepParams={activeSt !== "SEMUA" ? { st: activeSt } : {}}
        pills={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABEL[s], href: hrefFor(s), active: s === activeSt }))}
        searchPlaceholder="Cari kode / nama / penerima…"
      />
      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-canvas/70 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Kontrak</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Sudah diakui</th>
                <th className="px-4 py-3 text-right">Sisa</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 text-ink">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                    {isFiltering ? "Tidak ada kontrak yang cocok dengan filter." : "Belum ada kontrak. Klik “Tambah Kontrak” untuk mencatat sewa/asuransi dibayar di muka."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-terra">{r.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/buku-pembantu/dimuka/${r.id}`} className="hover:text-terra transition-colors">
                        {r.name}
                      </Link>
                      {r.vendor && <span className="block text-[11px] font-normal text-ink-soft">{r.vendor}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(r.totalMinor)}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{Money.formatIdr(r.accumulatedMinor)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tnum">{Money.formatIdr(r.remainingMinor)}</td>
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
