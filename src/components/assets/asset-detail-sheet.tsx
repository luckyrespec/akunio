"use client";

import Link from "next/link";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Money } from "@/core/money/money";

export interface AssetDetailData {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  acquisitionDate: string;
  acquisitionCostMinor: string;
  salvageValueMinor: string;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedMinor: string;
  bookValueMinor: string;
  postedPeriods: number;
  totalPeriods: number;
}

interface AssetDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  asset: AssetDetailData | null;
  error?: string | null;
  emptyHint?: string;
}

/**
 * Drawer rincian aset tetap — chrome sama seperti SakRuleSheet
 * (dipakai chat Akunio via EntitySheetProvider, reusable di seluruh app).
 */
export function AssetDetailSheet({
  open,
  onOpenChange,
  loading,
  asset,
  error,
  emptyHint = "Rincian aset tidak dapat dimuat.",
}: AssetDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <Building2 className="size-4" />
            <span>Aset Tetap</span>
          </div>
          <SheetTitle className="font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Aset..." : (asset?.name ?? "Detail Aset")}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {asset ? (
              <>
                <span className="font-mono font-semibold text-ink">{asset.code}</span>
                {` • ${asset.category}`}
                {` • ${asset.status}`}
              </>
            ) : (
              "Rincian aset tetap usaha Anda."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">Mengambil rincian aset dari basis data...</p>
            </div>
          ) : asset ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Harga Perolehan
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {Money.formatIdr(asset.acquisitionCostMinor)}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Nilai Buku
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {Money.formatIdr(asset.bookValueMinor)}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Akumulasi Susut
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {Money.formatIdr(asset.accumulatedMinor)}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Masa Manfaat
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {asset.usefulLifeMonths} bln
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/60 px-4 py-3 text-xs">
                <span className="font-semibold text-ink">Penyusutan</span>
                <span className="text-[11px] text-ink-soft">
                  {asset.depreciationMethod === "STRAIGHT_LINE" ? "Garis Lurus" : "Saldo Menurun"}
                  {` • ${asset.postedPeriods}/${asset.totalPeriods} periode`}
                </span>
              </div>

              <Link
                href={`/aset/${encodeURIComponent(asset.id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
              >
                Buka halaman aset
                <ArrowRight className="size-3" />
              </Link>
            </div>
          ) : (
            <p className="text-xs text-ink-soft">{error || emptyHint}</p>
          )}
        </div>

        <SheetFooter className="p-6 pt-4 border-t border-rule/50 bg-paper">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full text-xs font-medium cursor-pointer"
          >
            Tutup Rujukan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
