import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardCheck,
  Clock,
  Plus,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  countStockOpnames,
  getStockOpnameStats,
  listStockOpnamesPaginated,
} from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";
import { OpnameToolbar, type OpnameStatusTab } from "./opname-toolbar";
import { OpnamePagination } from "./opname-pagination";
import { OpnameRowActions } from "./opname-row-actions";

export const metadata = {
  title: "Riwayat Sesi Stok Opname | Akunio",
  description: "Daftar pelaksanaan hitung fisik persediaan dan status penyesuaian double-entry.",
};

const LIMIT_OPTIONS = [10, 25, 50];
const DEFAULT_LIMIT = 25;
const STATUS_TABS: OpnameStatusTab[] = [
  "ALL",
  "DRAFT",
  "REVIEW_DRAFT_JOURNAL",
  "COMPLETED",
  "CANCELLED",
];

export default async function StockOpnameListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; limit?: string; page?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim().slice(0, 100);
  const rawStatus = (sp.status ?? "ALL").toUpperCase();
  const status = (STATUS_TABS as readonly string[]).includes(rawStatus)
    ? (rawStatus as OpnameStatusTab)
    : "ALL";
  const limit = LIMIT_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_LIMIT;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  // withOrg terpisah per query: satu pg client tak boleh query konkuren.
  const [stats, total, rows] = await Promise.all([
    withOrg(ctx.orgId, (tx) => getStockOpnameStats(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) => countStockOpnames(tx, ctx.orgId, { search: q, status })),
    withOrg(ctx.orgId, (tx) => listStockOpnamesPaginated(tx, ctx.orgId, { search: q, status, limit, offset })),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(total, safePage * limit);

  const net = stats.netDifferenceMinor;
  const isDeficit = net < 0n;
  const isSurplus = net > 0n;
  const filtered = Boolean(q) || status !== "ALL";

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <Link
          href="/persediaan/daftar"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Persediaan
        </Link>
      </div>

      <PageHeader
        title="Sesi Stok Opname Fisik"
        eyebrow="Catat hasil hitung fisik gudang, bandingkan dengan stok buku, lalu sesuaikan lewat jurnal."
        actions={
          <Link href="/persediaan/opname/baru">
            <Button className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]">
              <Plus className="size-4 mr-1.5" />
              Mulai Opname Baru
            </Button>
          </Link>
        }
      />

      {/* Kartu ringkasan */}
      <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Sesi Opname
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <ClipboardCheck className="size-4 text-ink" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              {stats.total}{" "}
              <span className="text-sm font-sans text-ink-soft font-normal">sesi</span>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Sudah selesai diposting:</span>
              <strong className="font-mono text-ink text-xs">{stats.completed} sesi</strong>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Menunggu Posting
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <Clock className="size-4 text-terra" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              {stats.review}{" "}
              <span className="text-sm font-sans text-ink-soft font-normal">sesi</span>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Status draf jurnal:</span>
              <span className="text-[11px] font-mono text-terra font-medium">
                {stats.review > 0 ? "Perlu ditinjau" : "Tidak ada"}
              </span>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Nilai Selisih
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <Scale className="size-4 text-terra" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              <AnimatedNumber minor={net} />
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Dari sesi yang tidak dibatalkan:</span>
              <span
                className={
                  isDeficit
                    ? "text-terra font-medium text-xs"
                    : isSurplus
                      ? "text-debit font-medium text-xs"
                      : "text-ink-soft text-xs"
                }
              >
                {isDeficit ? "Selisih kurang" : isSurplus ? "Selisih lebih" : "Tidak ada selisih"}
              </span>
            </div>
          </div>
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.08}>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          <div className="p-4 border-b border-rule bg-canvas/30">
            <Suspense>
              <OpnameToolbar
                key={`${q}|${status}|${limit}`}
                defaultQuery={q}
                defaultStatus={status}
                defaultLimit={limit}
                counts={{
                  all: stats.total,
                  draft: stats.draft,
                  review: stats.review,
                  completed: stats.completed,
                  cancelled: stats.cancelled,
                }}
              />
            </Suspense>
          </div>

          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-sm text-left border-collapse data-table">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/60 border-b border-rule">
                <tr>
                  <th className="py-3.5 px-5 font-medium">Nomor</th>
                  <th className="py-3.5 px-5 font-medium">Tanggal</th>
                  <th className="py-3.5 px-4 font-medium">Status</th>
                  <th className="py-3.5 px-5 font-medium text-right">Nilai Selisih (Rp)</th>
                  <th className="py-3.5 px-5 font-medium">Catatan</th>
                  <th className="py-3.5 px-5 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-ink-soft">
                      <ClipboardCheck className="size-8 mx-auto text-ink-soft/40 mb-2" />
                      <p className="font-serif text-base text-ink font-medium">
                        {filtered ? "Tidak ada sesi yang cocok" : "Belum ada sesi opname"}
                      </p>
                      <p className="text-xs mt-1">
                        {filtered
                          ? "Ubah kata kunci atau status, atau mulai sesi baru."
                          : "Mulai dari tombol Mulai Opname Baru untuk mencatat hitung fisik pertama."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((op, idx) => {
                    const diffMinor = BigInt(op.totalDifferenceValueMinor);
                    const rowDeficit = diffMinor < 0n;
                    const rowSurplus = diffMinor > 0n;

                    return (
                      <tr
                        key={op.id}
                        className="row-enter hover:bg-canvas/40 transition-colors group"
                        style={{ "--row-i": idx } as React.CSSProperties}
                      >
                        <td className="py-3.5 px-5 font-mono text-xs font-semibold text-ink">
                          {op.number}
                        </td>
                        <td className="py-3.5 px-5 font-mono text-xs text-ink-soft">
                          {op.opnameDate}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            variant="outline"
                            className={`text-xs font-mono py-0.5 px-2.5 ${
                              op.status === "COMPLETED"
                                ? "bg-[color-mix(in_oklab,var(--color-debit)_10%,transparent)] text-debit border-debit/30"
                                : op.status === "REVIEW_DRAFT_JOURNAL"
                                  ? "bg-[color-mix(in_oklab,var(--color-terra)_10%,transparent)] text-terra border-terra/30 font-medium"
                                  : op.status === "CANCELLED"
                                    ? "bg-canvas text-ink-soft border-rule line-through"
                                    : "bg-canvas text-ink-soft border-rule"
                            }`}
                          >
                            {op.status === "REVIEW_DRAFT_JOURNAL"
                              ? "Draf Jurnal Terbit"
                              : op.status === "COMPLETED"
                                ? "Selesai Diposting"
                                : op.status === "CANCELLED"
                                  ? "Dibatalkan"
                                  : "Draf Perhitungan"}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum font-semibold">
                          <span
                            className={
                              rowDeficit ? "text-terra" : rowSurplus ? "text-debit" : "text-ink-soft"
                            }
                          >
                            {Money.fromMinor(diffMinor).formatIdr()}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-xs text-ink-soft max-w-xs truncate">
                          {op.notes || "-"}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-center gap-1">
                            <Link href={`/persediaan/opname/${op.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-ink hover:text-terra hover:bg-canvas rounded-lg"
                              >
                                Detail
                                <ArrowUpRight className="size-3.5 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                              </Button>
                            </Link>
                            {op.status === "CANCELLED" && (
                              <OpnameRowActions opnameId={op.id} number={op.number} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      <OpnamePagination
        q={q}
        status={status}
        limit={limit}
        page={safePage}
        totalPages={totalPages}
        total={total}
        from={from}
        to={to}
      />
    </div>
  );
}
