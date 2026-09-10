"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Package } from "lucide-react";
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

export interface ItemDetailData {
  id: string;
  code: string;
  name: string;
  itemType: string | null;
  category: string | null;
  unit: string | null;
  barcode: string | null;
  appBarcode: string | null;
  currentQty: string;
  minStockAlert: string | null;
  averageCostMinor: string;
  totalCostMinor: string;
  standardSellingPriceMinor: string;
  hasPhoto: boolean;
}

interface ItemDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  item: ItemDetailData | null;
  error?: string | null;
  emptyHint?: string;
}

/**
 * Drawer rincian barang persediaan — chrome sama seperti SakRuleSheet
 * (dipakai chat Akunio via ItemSheetProvider, reusable di seluruh app).
 * Data dimuat oleh pemanggil.
 */
export function ItemDetailSheet({
  open,
  onOpenChange,
  loading,
  item,
  error,
  emptyHint = "Rincian barang tidak dapat dimuat.",
}: ItemDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <Package className="size-4" />
            <span>Katalog Persediaan</span>
          </div>
          <SheetTitle className="font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Barang..." : (item?.name ?? "Detail Barang")}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {item ? (
              <>
                <span className="font-mono font-semibold text-ink">{item.code}</span>
                {item.category ? ` • ${item.category}` : ""}
                {item.unit ? ` • ${item.unit}` : ""}
              </>
            ) : (
              "Rincian barang dari katalog persediaan usaha Anda."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">Mengambil rincian barang dari basis data...</p>
            </div>
          ) : item ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Sisa Stok
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {item.currentQty} {item.unit ?? ""}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Harga Jual
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {Money.formatIdr(item.standardSellingPriceMinor)}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Modal Rata-Rata
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {Money.formatIdr(item.averageCostMinor)}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    Nilai Buku
                  </p>
                  <p className="tnum mt-1 font-display text-lg font-semibold text-ink">
                    {Money.formatIdr(item.totalCostMinor)}
                  </p>
                </div>
              </div>

              {(item.barcode || item.appBarcode) && (
                <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/60 px-4 py-3 text-xs">
                  <span className="font-semibold text-ink">Barcode</span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {[item.appBarcode, item.barcode].filter(Boolean).join(" • ")}
                  </span>
                </div>
              )}

              <Link
                href={`/persediaan/daftar/${encodeURIComponent(item.id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
              >
                Buka halaman barang
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
