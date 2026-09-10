"use client";

import Link from "next/link";
import { ArrowRight, Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface AccountDetailData {
  id: string;
  code: string;
  name: string;
  type: string;
  normal: string;
  parentCode: string | null;
  isCash: boolean;
  isBank: boolean;
  archived: boolean;
}

interface AccountDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  account: AccountDetailData | null;
  error?: string | null;
  emptyHint?: string;
}

/**
 * Drawer rincian akun COA — chrome sama seperti SakRuleSheet
 * (dipakai chat Akunio via EntitySheetProvider, reusable di seluruh app).
 */
export function AccountDetailSheet({
  open,
  onOpenChange,
  loading,
  account,
  error,
  emptyHint = "Rincian akun tidak dapat dimuat.",
}: AccountDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <Landmark className="size-4" />
            <span>Bagan Akun (COA)</span>
          </div>
          <SheetTitle className="font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Akun..." : (account?.name ?? "Detail Akun")}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {account ? (
              <>
                <span className="font-mono font-semibold text-ink">{account.code}</span>
                {` • ${account.type}`}
                {` • Normal ${account.normal === "D" ? "Debit" : "Kredit"}`}
              </>
            ) : (
              "Rincian akun dari bagan akun usaha Anda."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">Mengambil rincian akun dari basis data...</p>
            </div>
          ) : account ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/60 px-4 py-3 text-xs">
                <span className="font-semibold text-ink">Jenis Akun</span>
                <span className="rounded-lg bg-paper px-2.5 py-1 text-[11px] font-semibold text-terra border border-rule shadow-2xs">
                  {account.type}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">Normal</p>
                  <p className="mt-1 font-display text-lg font-semibold text-ink">
                    {account.normal === "D" ? "Debit" : "Kredit"}
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">Keterangan</p>
                  <p className="mt-1 font-display text-lg font-semibold text-ink">
                    {account.isCash ? "Kas" : account.isBank ? "Bank" : account.parentCode ? `Induk ${account.parentCode}` : "—"}
                  </p>
                </div>
              </div>
              {account.archived && (
                <p className="text-xs text-ink-soft">Akun ini sedang diarsipkan.</p>
              )}
              <Link
                href={`/buku-besar/${encodeURIComponent(account.id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
              >
                Buka buku besar akun
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
