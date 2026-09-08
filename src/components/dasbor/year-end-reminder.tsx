"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissYearEndPromptAction } from "@/server/actions/periods.actions";

export interface YearEndReminderProps {
  year: number;
  periodName: string;
  showBanner: boolean;
  showModal: boolean;
  isReady: boolean;
  blockers: string[];
}

/** Banner + modal pengingat tutup tahun. Banner tutup per sesi; modal
 *  punya "jangan tampilkan periode ini" yang tersimpan per organisasi. */
export function YearEndReminder({
  year,
  periodName,
  showBanner,
  showModal,
  isReady,
  blockers,
}: YearEndReminderProps) {
  const [bannerClosed, setBannerClosed] = useState(false);
  const [modalClosed, setModalClosed] = useState(false);
  const [pending, start] = useTransition();

  function dismissThisPeriod() {
    start(async () => {
      await dismissYearEndPromptAction(periodName);
      setModalClosed(true);
    });
  }

  return (
    <>
      {showBanner && !bannerClosed && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-2xs sm:flex-row sm:items-center"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400">
            <CalendarClock className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">
              Tahun {year} hampir selesai — waktunya tutup buku
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {isReady
                ? "Semua checklist hijau. Kunci tahun ini agar angka terkunci permanen."
                : `${blockers.length} hal perlu dibereskan dulu: ${blockers.join(", ")}.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/tutup-buku">
              <Button size="sm" className="bg-terra text-white hover:bg-terra/90 text-xs gap-1.5 shadow-xs">
                <span>Tutup Tahun {year}</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Tutup pengingat"
              onClick={() => setBannerClosed(true)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {showModal && !modalClosed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pengingat tutup tahun ${year}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-2xl border border-rule bg-paper p-6 shadow-lg animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-ink">
                  Tutup Tahun {year}?
                </h2>
                <p className="mt-1 text-xs text-ink-soft">
                  {isReady
                    ? "Checklist sudah hijau semua. Menutup tahun mengunci angka secara permanen."
                    : `Masih ada ${blockers.length} hal yang perlu dibereskan: ${blockers.join(", ")}.`}
                </p>
              </div>
            </div>
            <Link href="/tutup-buku" className="mt-5 block">
              <Button size="sm" className="h-11 w-full bg-terra text-white hover:bg-terra/90 text-sm gap-1.5 shadow-xs">
                <span>Tutup Tahun {year}</span>
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <div className="mt-3 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalClosed(true)}
                className="text-xs"
              >
                Nanti saja
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={dismissThisPeriod}
                className="text-xs text-ink-soft"
              >
                {pending ? "Menyimpan…" : "Jangan tampilkan periode ini"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
