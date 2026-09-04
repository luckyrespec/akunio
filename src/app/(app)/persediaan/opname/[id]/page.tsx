import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Scale,
  Building2,
  Calendar,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getStockOpnameWithItems } from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import { GenerateDraftButton } from "./generate-draft-button";
import { Reveal } from "@/components/motion";

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
  const isSurplus = totalDiffMinor > 0n;

  return (
    <div className="space-y-6">
      {/* Header & Status Bar */}
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
                <Calendar className="w-3 h-3 text-[var(--color-terra)]" />
                Tanggal Hitung: {opname.opnameDate}
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
                  : "Draf Perhitungan"}
              </Badge>
            </div>
            {opname.notes && (
              <p className="text-sm text-[var(--color-ink-soft)] mt-2 italic">
                "{opname.notes}"
              </p>
            )}
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-3">
            {opname.status === "DRAFT" && (
              <GenerateDraftButton opnameId={opname.id} />
            )}

            {opname.journalEntryId && (
              <Link href={`/jurnal`}>
                <Button className="h-10 px-4 rounded-[var(--radius-lg)] bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90 transition-opacity font-medium shadow-sm">
                  <FileText className="w-4 h-4 mr-2 text-[var(--color-terra)]" />
                  Buka Draf Jurnal Penyesuaian
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Reveal>

      {/* KPI Reconcile Summary Card */}
      <Reveal delay={0.05}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-6 rounded-[var(--radius-xl)] bg-[var(--color-paper)] border border-[var(--color-rule)] shadow-[var(--elevation-sm)]">
            <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em]">Total Barang Diinspeksi</span>
              <Layers className="w-4 h-4" />
            </div>
            <div className="text-3xl font-serif text-[var(--color-ink)] tnum">
              {opname.items.length}{" "}
              <span className="text-base font-sans text-[var(--color-ink-soft)] font-normal">
                SKU
              </span>
            </div>
          </div>

          <div className="p-6 rounded-[var(--radius-xl)] bg-[var(--color-paper)] border border-[var(--color-rule)] shadow-[var(--elevation-sm)]">
            <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em]">Item Berselisih Fisik</span>
              <Scale className="w-4 h-4 text-[var(--color-terra)]" />
            </div>
            <div className="text-3xl font-serif text-[var(--color-ink)] tnum">
              {opname.items.filter((i) => Number(i.differenceQty) !== 0).length}{" "}
              <span className="text-base font-sans text-[var(--color-ink-soft)] font-normal">
                Item
              </span>
            </div>
          </div>

          <div className={`p-6 rounded-[var(--radius-xl)] border shadow-[var(--elevation-sm)] ${
            isDeficit
              ? "bg-[color-mix(in_oklab,var(--color-terra)_4%,var(--color-paper))] border-[color-mix(in_oklab,var(--color-terra)_30%,var(--color-rule))]"
              : isSurplus
              ? "bg-[color-mix(in_oklab,var(--color-debit)_4%,var(--color-paper))] border-[color-mix(in_oklab,var(--color-debit)_30%,var(--color-rule))]"
              : "bg-[var(--color-paper)] border-[var(--color-rule)]"
          }`}>
            <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em]">Dampak Selisih Finansial</span>
              {isDeficit ? (
                <AlertTriangle className="w-4 h-4 text-[var(--color-terra)]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[var(--color-debit)]" />
              )}
            </div>
            <div className={`text-3xl font-serif tnum font-medium ${
              isDeficit
                ? "text-[var(--color-terra)]"
                : isSurplus
                ? "text-[var(--color-debit)]"
                : "text-[var(--color-ink)]"
            }`}>
              {Money.fromMinor(totalDiffMinor).formatIdr()}
            </div>
            <div className="mt-2 text-xs text-[var(--color-ink-soft)]">
              {isDeficit ? "Beban Kerugian/Hilang Persediaan" : isSurplus ? "Pendapatan/Koreksi Selisih Lebih" : "Saldo Fisik Cocok Sempurna"}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Rincian Lembar Hitung Opname */}
      <Reveal delay={0.1}>
        <div className="border border-[var(--color-rule)] rounded-[var(--radius-2xl)] bg-[var(--color-paper)] overflow-hidden shadow-[var(--elevation-sm)]">
          <div className="p-4 sm:p-5 border-b border-[var(--color-rule)] bg-[var(--color-canvas)]/30 flex items-center justify-between">
            <h2 className="font-serif font-medium text-base text-[var(--color-ink)]">
              Lembar Komparasi Saldo Sistem vs Fisik Aktual
            </h2>
            <span className="text-xs font-mono text-[var(--color-ink-soft)]">
              Aturan Opsi A: AI merekomendasikan jurnal draf sebelum posting imutabel
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
                        {Money.fromMinor(it.unitCostMinor).formatIdr()}
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
  );
}
