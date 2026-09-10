"use client";

import Link from "next/link";
import { ArrowRight, Loader2, ScrollText } from "lucide-react";
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

export interface JournalDetailLine {
  accountCode: string;
  accountName: string;
  debitMinor: string;
  creditMinor: string;
  memo: string | null;
}

export interface JournalDetailData {
  id: string;
  number: string;
  entryDate: string;
  memo: string;
  status: string;
  lines: JournalDetailLine[];
}

interface JournalDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  entry: JournalDetailData | null;
  error?: string | null;
  emptyHint?: string;
}

/**
 * Drawer rincian jurnal — chrome sama seperti SakRuleSheet
 * (dipakai chat Akunio via EntitySheetProvider, reusable di seluruh app).
 */
export function JournalDetailSheet({
  open,
  onOpenChange,
  loading,
  entry,
  error,
  emptyHint = "Rincian jurnal tidak dapat dimuat.",
}: JournalDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <ScrollText className="size-4" />
            <span>Jurnal Umum</span>
          </div>
          <SheetTitle className="tnum font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Jurnal..." : (entry?.number ?? "Detail Jurnal")}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {entry ? (
              <>
                {entry.entryDate}
                {` • ${entry.status}`}
                {entry.memo ? ` • ${entry.memo}` : ""}
              </>
            ) : (
              "Rincian jurnal dari buku besar usaha Anda."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">Mengambil rincian jurnal dari basis data...</p>
            </div>
          ) : entry ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-rule bg-canvas">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas/80 border-b border-rule text-ink-soft text-[11px]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Akun</th>
                      <th className="px-3 py-1.5 font-medium text-right">Debit</th>
                      <th className="px-3 py-1.5 font-medium text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60 text-ink">
                    {entry.lines.map((l, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5">
                          <span className="font-mono font-semibold text-terra">
                            {l.accountCode}
                          </span>
                          <span className="text-ink-soft ml-1.5">{l.accountName}</span>
                          {l.memo ? (
                            <span className="text-ink-soft ml-1.5">({l.memo})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">
                          {l.debitMinor !== "0" ? Money.formatIdr(l.debitMinor) : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">
                          {l.creditMinor !== "0" ? Money.formatIdr(l.creditMinor) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Link
                href={`/jurnal/${encodeURIComponent(entry.id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
              >
                Buka halaman jurnal
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
