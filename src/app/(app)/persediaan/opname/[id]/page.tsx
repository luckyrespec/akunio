import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  Minus,
  PackageSearch,
  TableProperties,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getStockOpnameWithItems } from "@/server/db/repos/inventory.repo";
import { getEntryWithLines, listEntryDocuments } from "@/server/db/repos/journals.repo";
import { Money } from "@/core/money/money";
import { GenerateDraftButton, CancelOpnameButton, DeleteOpnameButton } from "./generate-draft-button";
import { OpnameCostCell } from "./opname-cost-cell";
import { OpnameJournalPanel } from "./opname-journal-panel";
import { Reveal } from "@/components/motion";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StockOpnameDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireContext();
  const opname = await getStockOpnameWithItems(db, ctx.orgId, id);

  if (!opname) notFound();

  const [journal, journalDocs] = opname.journalEntryId
    ? await Promise.all([
        getEntryWithLines(db, ctx.orgId, opname.journalEntryId),
        listEntryDocuments(db, ctx.orgId, opname.journalEntryId),
      ])
    : [null, []];

  const totalDiffMinor = opname.totalDifferenceValueMinor;
  const isDeficit = totalDiffMinor < 0n;
  const isSurplus = totalDiffMinor > 0n;
  const isDraftSession = opname.status === "DRAFT" && !opname.journalEntryId;
  const hasUnpricedDiff =
    isDraftSession &&
    opname.items.some((i) => BigInt(i.unitCostMinor) === 0n && Number(i.differenceQty) !== 0);

  const DiffIcon = isDeficit ? TrendingDown : isSurplus ? TrendingUp : Minus;
  const diffIconColor = isDeficit ? "text-terra" : "text-debit";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Reveal>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-6 border-b border-[var(--color-rule)]">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/persediaan/opname">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 -ml-2 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  Kembali ke Daftar
                </Button>
              </Link>
              <span className="text-xs text-[var(--color-ink-soft)]">•</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-[var(--color-canvas)] text-[var(--color-ink-soft)] border border-[var(--color-rule)]">
                <CalendarDays className="w-3 h-3 text-[var(--color-terra)]" />
                {opname.opnameDate}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[var(--color-ink)] font-normal">
                Stok Opname {opname.number}
              </h1>
              <Badge
                variant="outline"
                className={`text-xs font-mono py-0.5 px-2.5 ${
                  opname.status === "COMPLETED"
                    ? "bg-[color-mix(in_oklab,var(--color-debit)_10%,transparent)] text-[var(--color-debit)] border-[var(--color-debit)]/30"
                    : opname.status === "REVIEW_DRAFT_JOURNAL"
                    ? "bg-[color-mix(in_oklab,var(--color-terra)_10%,transparent)] text-[var(--color-terra)] border-[var(--color-terra)]/30"
                    : "bg-[var(--color-canvas)] text-[var(--color-ink-soft)] border-[var(--color-rule)]"
                }`}
              >
                {opname.status === "REVIEW_DRAFT_JOURNAL"
                  ? "Draf Jurnal Terbit"
                  : opname.status === "COMPLETED"
                  ? "Selesai & Diposting"
                  : opname.status === "IN_PROGRESS"
                  ? "Dalam Proses"
                  : opname.status === "CANCELLED"
                  ? "Dibatalkan"
                  : "Draf Perhitungan"}
              </Badge>
            </div>
            {opname.notes && (
              <p className="text-sm text-[var(--color-ink-soft)] mt-2 italic whitespace-pre-line">
                &ldquo;{opname.notes}&rdquo;
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isDraftSession && <GenerateDraftButton opnameId={opname.id} />}
            {(opname.status === "DRAFT" ||
              opname.status === "IN_PROGRESS" ||
              opname.status === "REVIEW_DRAFT_JOURNAL") && (
              <CancelOpnameButton
                opnameId={opname.id}
                hasJournal={Boolean(opname.journalEntryId)}
              />
            )}
            {opname.status === "CANCELLED" && (
              <DeleteOpnameButton opnameId={opname.id} number={opname.number} />
            )}
          </div>
        </div>
      </Reveal>

      {/* Kiri: ringkasan + lembar hitung. Kanan: jurnal penyesuaian (lebih lebar). */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_470px] xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.05}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-[var(--radius-xl)] bg-[var(--color-paper)] border border-[var(--color-rule)] shadow-[var(--elevation-sm)]">
                <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-[0.1em]">
                    Barang Dihitung
                  </span>
                  <PackageSearch className="w-4 h-4" />
                </div>
                <div className="text-2xl font-serif text-[var(--color-ink)] tnum">
                  {opname.items.length}{" "}
                  <span className="text-sm font-sans text-[var(--color-ink-soft)] font-normal">
                    SKU
                  </span>
                </div>
              </div>

              <div className="p-5 rounded-[var(--radius-xl)] bg-[var(--color-paper)] border border-[var(--color-rule)] shadow-[var(--elevation-sm)]">
                <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-[0.1em]">
                    Barang Berselisih
                  </span>
                  <ArrowLeftRight className="w-4 h-4 text-[var(--color-terra)]" />
                </div>
                <div className="text-2xl font-serif text-[var(--color-ink)] tnum">
                  {opname.items.filter((i) => Number(i.differenceQty) !== 0).length}{" "}
                  <span className="text-sm font-sans text-[var(--color-ink-soft)] font-normal">
                    item
                  </span>
                </div>
              </div>

              <div
                className={`p-5 rounded-[var(--radius-xl)] border shadow-[var(--elevation-sm)] ${
                  isDeficit
                    ? "bg-[color-mix(in_oklab,var(--color-terra)_4%,var(--color-paper))] border-[color-mix(in_oklab,var(--color-terra)_30%,var(--color-rule))]"
                    : isSurplus
                      ? "bg-[color-mix(in_oklab,var(--color-debit)_4%,var(--color-paper))] border-[color-mix(in_oklab,var(--color-debit)_30%,var(--color-rule))]"
                      : "bg-[var(--color-paper)] border-[var(--color-rule)]"
                }`}
              >
                <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-[0.1em]">
                    Nilai Selisih
                  </span>
                  <DiffIcon className={`w-4 h-4 ${diffIconColor}`} />
                </div>
                <div
                  className={`text-2xl font-serif tnum font-medium ${
                    isDeficit
                      ? "text-[var(--color-terra)]"
                      : isSurplus
                        ? "text-[var(--color-debit)]"
                        : "text-[var(--color-ink)]"
                  }`}
                >
                  {Money.fromMinor(totalDiffMinor).formatIdr()}
                </div>
                <div className="mt-2 text-xs text-[var(--color-ink-soft)]">
                  {isDeficit
                    ? "Beban kerugian persediaan"
                    : isSurplus
                      ? "Pendapatan selisih lebih"
                      : hasUnpricedDiff
                        ? "Isi harga modal di tabel agar selisihnya bernilai"
                        : "Fisik cocok dengan buku"}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="border border-[var(--color-rule)] rounded-[var(--radius-2xl)] bg-[var(--color-paper)] overflow-hidden shadow-[var(--elevation-sm)]">
              <div className="p-4 sm:p-5 border-b border-[var(--color-rule)] bg-[var(--color-canvas)]/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TableProperties className="w-4 h-4 text-[var(--color-ink-soft)]" />
                  <h2 className="font-serif font-medium text-base text-[var(--color-ink)]">
                    Perbandingan Stok Sistem dan Fisik
                  </h2>
                </div>
                <span className="hidden sm:block text-xs font-mono text-[var(--color-ink-soft)]">
                  Stok buku mengikuti hasil fisik setelah jurnal diposting
                </span>
              </div>

              <div className="overflow-x-auto min-w-full">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-[var(--color-ink-soft)] bg-[var(--color-canvas)]/60 border-b border-[var(--color-rule)]">
                    <tr>
                      <th className="py-3 px-5 font-medium">Barang (SKU)</th>
                      <th className="py-3 px-4 font-medium text-right">Stok Sistem</th>
                      <th className="py-3 px-4 font-medium text-right">Hitung Fisik</th>
                      <th className="py-3 px-4 font-medium text-right">Selisih Unit</th>
                      <th className="py-3 px-5 font-medium text-right">Harga Modal</th>
                      <th className="py-3 px-5 font-medium text-right">Nilai Selisih (Rp)</th>
                      <th className="py-3 px-5 font-medium">Keterangan / Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-rule)]/60">
                    {opname.items.map((it) => {
                      const diff = Number(it.differenceQty);
                      const diffVal = it.differenceValueMinor;
                      const hasDiscrepancy = diff !== 0;
                      const costEditable =
                        isDraftSession && BigInt(it.currentAverageCostMinor) === 0n && hasDiscrepancy;

                      return (
                        <tr
                          key={it.id}
                          className={`hover:bg-[var(--color-canvas)]/40 transition-colors ${
                            hasDiscrepancy ? "bg-[var(--color-canvas)]/10" : ""
                          }`}
                        >
                          <td className="py-3.5 px-5">
                            <div className="font-medium text-[var(--color-ink)]">{it.itemName}</div>
                            <div className="text-xs font-mono text-[var(--color-ink-soft)]">
                              {it.itemCode}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tnum text-[var(--color-ink-soft)]">
                            {Number(it.systemQty).toLocaleString("id-ID")} {it.unit}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tnum font-semibold text-[var(--color-ink)]">
                            {Number(it.physicalQty).toLocaleString("id-ID")} {it.unit}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tnum">
                            <span
                              className={`font-semibold ${
                                diff < 0
                                  ? "text-[var(--color-terra)]"
                                  : diff > 0
                                    ? "text-[var(--color-debit)]"
                                    : "text-[var(--color-ink-soft)]"
                              }`}
                            >
                              {diff > 0 ? `+${diff}` : diff} {it.unit}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono tnum text-[var(--color-ink-soft)]">
                            <OpnameCostCell
                              opnameId={opname.id}
                              itemId={it.itemId}
                              unitCostMinor={it.unitCostMinor.toString()}
                              differenceQty={diff}
                              editable={costEditable}
                            />
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono tnum font-semibold">
                            <span
                              className={
                                diffVal < 0n
                                  ? "text-[var(--color-terra)]"
                                  : diffVal > 0n
                                    ? "text-[var(--color-debit)]"
                                    : "text-[var(--color-ink-soft)]"
                              }
                            >
                              {Money.fromMinor(diffVal).formatIdr()}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-xs text-[var(--color-ink-soft)]">
                            {it.reason ? (
                              <span className="px-2 py-0.5 rounded bg-[var(--color-canvas)] border border-[var(--color-rule)]">
                                {it.reason}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="lg:sticky lg:top-6">
            <OpnameJournalPanel
              opnameId={opname.id}
              opnameStatus={opname.status}
              journal={
                journal
                  ? {
                      id: journal.id,
                      number: journal.number,
                      entryDate: journal.entryDate,
                      memo: journal.memo,
                      status: journal.status,
                      lines: journal.lines.map((l) => ({
                        id: l.id,
                        accountCode: l.accountCode,
                        accountName: l.accountName,
                        debitMinor: l.debitMinor.toString(),
                        creditMinor: l.creditMinor.toString(),
                        memo: l.memo,
                      })),
                    }
                  : null
              }
              documents={journalDocs.map((d) => ({
                id: d.id,
                fileName: d.fileName,
                sizeBytes: d.sizeBytes,
              }))}
            />
          </div>
        </Reveal>
      </div>
    </div>
  );
}
