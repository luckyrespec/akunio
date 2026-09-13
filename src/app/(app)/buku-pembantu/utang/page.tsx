import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listContactCards } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/motion";
import { ContactListTable } from "@/components/subsidiary/contact-ledger";
import { FilterBar } from "@/components/subsidiary/filter-bar";

const BALANCE_OPTIONS = ["SEMUA", "ADA_SISA", "LUNAS"] as const;
const BALANCE_LABEL: Record<(typeof BALANCE_OPTIONS)[number], string> = {
  SEMUA: "Semua",
  ADA_SISA: "Ada sisa",
  LUNAS: "Lunas",
};

export default async function UtangListPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; st?: string }>;
}) {
  const ctx = await requireContext();
  const rows = await listContactCards(db, ctx.orgId, "BILL");
  const q = ((await searchParams)?.q ?? "").trim();
  const st = ((await searchParams)?.st ?? "SEMUA").toUpperCase();
  const activeSt = (BALANCE_OPTIONS as readonly string[]).includes(st) ? st : "SEMUA";
  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (ql && !r.name.toLowerCase().includes(ql)) return false;
    if (activeSt === "ADA_SISA") return r.outstandingMinor > 0n;
    if (activeSt === "LUNAS") return r.outstandingMinor === 0n;
    return true;
  });
  const isFiltering = q !== "" || activeSt !== "SEMUA";
  const totalSisa = filtered.reduce((a, r) => a + r.outstandingMinor, 0n);
  const hrefFor = (nextSt: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (nextSt !== "SEMUA") p.set("st", nextSt);
    const s = p.toString();
    return `/buku-pembantu/utang${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Utang"
        eyebrow="Tagihan, pelunasan, dan sisa tiap pemasok"
      />
      <p className="text-xs text-ink-soft" role="status">
        {isFiltering ? `${filtered.length} dari ${rows.length} pemasok` : `${rows.length} pemasok`} · sisa terutang{" "}
        <AnimatedNumber minor={totalSisa} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
      </p>
      <FilterBar
        q={q}
        keepParams={activeSt !== "SEMUA" ? { st: activeSt } : {}}
        pills={BALANCE_OPTIONS.map((s) => ({ value: s, label: BALANCE_LABEL[s], href: hrefFor(s), active: s === activeSt }))}
        searchPlaceholder="Cari nama pemasok…"
      />
      <ContactListTable
        rows={filtered}
        basePath="/buku-pembantu/utang"
        emptyHint="Belum ada tagihan pembelian aktif."
        isFiltering={isFiltering}
        clearHref="/buku-pembantu/utang"
      />
    </div>
  );
}
