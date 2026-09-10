"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface ContactDetailData {
  id: string;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
}

interface ContactDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  contact: ContactDetailData | null;
  error?: string | null;
  emptyHint?: string;
}

/**
 * Drawer rincian kontak — chrome sama seperti SakRuleSheet
 * (dipakai chat Akunio via EntitySheetProvider, reusable di seluruh app).
 */
export function ContactDetailSheet({
  open,
  onOpenChange,
  loading,
  contact,
  error,
  emptyHint = "Rincian kontak tidak dapat dimuat.",
}: ContactDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg bg-paper border-rule"
      >
        <SheetHeader className="p-6 pb-4 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-terra">
            <Users className="size-4" />
            <span>Kontak {contact?.type === "VENDOR" ? "Pemasok" : contact?.type === "BOTH" ? "Pelanggan & Pemasok" : "Pelanggan"}</span>
          </div>
          <SheetTitle className="font-display text-xl font-bold text-ink mt-1">
            {loading ? "Memuat Kontak..." : (contact?.name ?? "Detail Kontak")}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft leading-relaxed">
            {contact ? (
              <>
                {contact.type}
                {contact.paymentTermsDays !== null ? ` • Termin ${contact.paymentTermsDays} hari` : ""}
              </>
            ) : (
              "Rincian kontak pelanggan/pemasok usaha Anda."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-ink-soft">
              <Loader2 className="size-6 animate-spin text-terra" />
              <p className="text-xs">Mengambil rincian kontak dari basis data...</p>
            </div>
          ) : contact ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-rule bg-canvas/60 px-4 py-3 text-xs space-y-1.5">
                {contact.phone && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-ink-soft shrink-0">Telepon</span>
                    <strong className="text-right font-medium text-ink">{contact.phone}</strong>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-ink-soft shrink-0">Email</span>
                    <strong className="text-right font-medium text-ink break-all">{contact.email}</strong>
                  </div>
                )}
                {contact.address && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-ink-soft shrink-0">Alamat</span>
                    <strong className="text-right font-medium text-ink">{contact.address}</strong>
                  </div>
                )}
                {contact.notes && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-ink-soft shrink-0">Catatan</span>
                    <strong className="text-right font-medium text-ink">{contact.notes}</strong>
                  </div>
                )}
                {!contact.phone && !contact.email && !contact.address && !contact.notes && (
                  <p className="text-ink-soft">Belum ada info tambahan untuk kontak ini.</p>
                )}
              </div>

              <Link
                href="/kontak"
                className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
              >
                Buka daftar kontak
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
