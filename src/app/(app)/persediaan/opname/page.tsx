import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  ClipboardCheck,
  Calendar,
  Layers,
  Scale,
  ArrowUpRight,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listStockOpnames } from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";

export const metadata = {
  title: "Riwayat Sesi Stok Opname | Akunio",
  description: "Daftar pelaksanaan hitung fisik persediaan dan status penyesuaian double-entry.",
};

export default async function StockOpnameListPage() {
  const ctx = await requireContext();
  const opnames = await listStockOpnames(db, ctx.orgId);

  const completedCount = opnames.filter((o) => o.status === "COMPLETED").length;
  const draftJournalCount = opnames.filter((o) => o.status === "REVIEW_DRAFT_JOURNAL").length;
  const totalDifferenceMinor = opnames.reduce(
    (sum, o) => sum + BigInt(o.totalDifferenceValueMinor),
    0n,
  );

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <Link
          href="/persediaan/daftar"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Master Persediaan
        </Link>
      </div>

      {/* Standard Page Header */}
      <PageHeader
        title="Sesi Stok Opname Fisik"
        eyebrow="Rekonsiliasi kuantitas fisik gudang dengan saldo sistem buku besar dan pembentukan jurnal penyesuaian."
        actions={
          <Link href="/persediaan/opname/baru">
            <Button className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]">
              <Plus className="size-4 mr-1.5" />
              Mulai Opname Baru
            </Button>
          </Link>
        }
      />

      {/* KPI Cards — Bolder Elevation & Stat Indicators */}
      <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Total Sesi Terlaksana
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <ClipboardCheck className="size-4 text-ink" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              {opnames.length}{" "}
              <span className="text-sm font-sans text-ink-soft font-normal">Sesi</span>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Status Selesai:</span>
              <strong className="font-mono text-ink text-xs">{completedCount} Selesai</strong>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Menunggu Review Draf Jurnal
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <Clock className="size-4 text-terra" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              {draftJournalCount}{" "}
              <span className="text-sm font-sans text-ink-soft font-normal">Perlu Konfirmasi</span>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Alur:</span>
              <span className="text-[11px] font-mono text-terra font-medium">Opsi A (Manusia Memutuskan)</span>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Akumulasi Selisih Finansial
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <Scale className="size-4 text-terra" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              <AnimatedNumber minor={totalDifferenceMinor} />
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Net Valuasi:</span>
              <span className={totalDifferenceMinor < 0n ? "text-terra font-medium text-xs" : "text-debit font-medium text-xs"}>
                {totalDifferenceMinor < 0n ? "Defisit Bersih" : "Surplus / Seimbang"}
              </span>
            </div>
          </div>
        </StaggerItem>
      </Stagger>

      {/* Data Table Swiss 2.0 — Sesi Opname */}
      <Reveal delay={0.08}>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          <div className="p-4 border-b border-rule flex items-center justify-between bg-canvas/30">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-ink-soft" />
              <h2 className="font-serif font-medium text-sm text-ink">
                Daftar Pelaksanaan Hitung Fisik
              </h2>
            </div>
            <span className="text-xs font-mono text-ink-soft">
              {opnames.length} sesi tercatat
            </span>
          </div>

          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-sm text-left border-collapse data-table">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/60 border-b border-rule">
                <tr>
                  <th className="py-3.5 px-5 font-medium">Nomor Sesi</th>
                  <th className="py-3.5 px-5 font-medium">Tanggal Pelaksanaan</th>
                  <th className="py-3.5 px-4 font-medium">Status Rekonsiliasi</th>
                  <th className="py-3.5 px-5 font-medium text-right">Dampak Selisih (Rp)</th>
                  <th className="py-3.5 px-5 font-medium">Catatan / Lokasi</th>
                  <th className="py-3.5 px-5 font-medium text-center">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {opnames.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-ink-soft">
                      <ClipboardCheck className="size-8 mx-auto text-ink-soft/40 mb-2" />
                      <p className="font-serif text-base text-ink font-medium">Belum ada sesi stok opname</p>
                      <p className="text-xs mt-1">
                        Klik "Mulai Opname Baru" untuk melaksanakan hitung fisik gudang pertama Anda.
                      </p>
                    </td>
                  </tr>
                ) : (
                  opnames.map((op) => {
                    const diffMinor = BigInt(op.totalDifferenceValueMinor);
                    const isDeficit = diffMinor < 0n;
                    const isSurplus = diffMinor > 0n;

                    return (
                      <tr
                        key={op.id}
                        className="hover:bg-canvas/40 transition-colors group"
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
                                : "bg-canvas text-ink-soft border-rule"
                            }`}
                          >
                            {op.status === "REVIEW_DRAFT_JOURNAL"
                              ? "Draf Jurnal Terbit"
                              : op.status === "COMPLETED"
                              ? "Selesai Diposting"
                              : "Draf Perhitungan"}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum font-semibold">
                          <span
                            className={
                              isDeficit
                                ? "text-terra"
                                : isSurplus
                                ? "text-debit"
                                : "text-ink-soft"
                            }
                          >
                            {Money.fromMinor(diffMinor).formatIdr()}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-xs text-ink-soft max-w-xs truncate">
                          {op.notes || "-"}
                        </td>
                        <td className="py-3.5 px-5 text-center">
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
    </div>
  );
}
