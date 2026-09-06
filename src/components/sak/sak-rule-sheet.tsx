"use client";

import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BookContentRenderer } from "@/components/aturan/book-content-renderer";

export interface SakRuleBlock {
  title: string;
  paragraphRange?: string;
  content: string;
}

interface SakRuleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  description: string;
  blocks: SakRuleBlock[];
  loading: boolean;
  emptyHint?: string;
  bodyFooter?: React.ReactNode;
}

/**
 * Drawer rincian Standar SAK EMKM — dipakai temuan (satu sitasi) dan
 * kas-bank (isi satu Bab). Data dimuat oleh pemanggil.
 */
export function SakRuleSheet({
  open,
  onOpenChange,
  heading,
  description,
  blocks,
  loading,
  emptyHint = "Tidak ada teks standar yang tersedia.",
  bodyFooter,
}: SakRuleSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <BookOpen className="size-4" />
            <span>Standar Akuntansi Keuangan SAK EMKM</span>
          </div>
          <SheetTitle className="font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Aturan SAK..." : heading}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {description}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">
                Mengambil teks rincian standar dari basis data...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {blocks.map((b, i) => (
                <div key={i} className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/60 px-4 py-3 text-xs">
                    <span className="font-semibold text-ink">{b.title}</span>
                    {b.paragraphRange && (
                      <span className="rounded-lg bg-paper px-2.5 py-1 text-[11px] font-semibold text-terra border border-rule shadow-2xs">
                        {b.paragraphRange.toLowerCase().startsWith("paragraf")
                          ? b.paragraphRange
                          : `Paragraf ${b.paragraphRange}`}
                      </span>
                    )}
                  </div>
                  <div className="rounded-2xl border border-rule bg-canvas/30 p-5 font-sans">
                    {b.content ? (
                      <BookContentRenderer
                        content={b.content}
                        textSize="text-xs sm:text-sm"
                      />
                    ) : (
                      <p className="text-xs text-ink-soft">{emptyHint}</p>
                    )}
                  </div>
                </div>
              ))}
              {blocks.length === 0 && (
                <p className="text-xs text-ink-soft">{emptyHint}</p>
              )}
              {bodyFooter}
            </div>
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
