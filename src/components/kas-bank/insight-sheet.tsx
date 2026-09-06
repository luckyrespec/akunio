"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BookOpen, Loader2 } from "lucide-react";
import { getSakChapterForSheetAction } from "@/server/actions/sak.actions";
import type { SakChapter } from "@/server/db/repos/sak-docs.repo";
import type { DailyInsight } from "@/core/kas-bank/insights";

/** Tombol "Pelajari standar" — membuka isi Bab SAK EMKM dalam sheet. */
export function InsightSheet({ insight }: { insight: DailyInsight }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [chapter, setChapter] = React.useState<SakChapter | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getSakChapterForSheetAction(insight.bab);
      if (!res.ok) throw new Error(res.error);
      setChapter(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat bab.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="h-7 gap-1.5 text-[11px] font-medium border-rule bg-paper hover:bg-canvas hover:text-terra hover:border-terra/40"
      >
        <BookOpen className="size-3.5 text-terra" />
        Pelajari standar
      </Button>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto bg-paper border-rule"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-lg font-semibold text-ink">
            Bab {insight.bab} — {chapter?.title ?? "Standar SAK EMKM"}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-soft">
            {chapter?.description ??
              "Ringkasan aturan terkait insight harian ini."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-6">
          {loading && (
            <p className="flex items-center gap-2 text-xs text-ink-soft">
              <Loader2 className="size-3.5 animate-spin" />
              Memuat isi bab...
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              {error}
            </div>
          )}
          {!loading && !error && chapter && chapter.chunks.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-ink-soft">
                Isi lengkap bab ini belum tersedia di perangkat. Intisari
                praktiknya:
              </p>
              <p className="text-xs font-medium text-ink">{insight.title}</p>
              <p className="text-xs leading-relaxed text-ink-soft">
                {insight.body}
              </p>
            </div>
          )}
          {!loading &&
            !error &&
            chapter &&
            chapter.chunks.map((c) => (
              <article key={c.id} className="space-y-1">
                <h3 className="text-xs font-semibold text-ink">
                  {c.title}
                  {c.paragraphRange && (
                    <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-soft">
                      {c.paragraphRange}
                    </span>
                  )}
                </h3>
                <p className="text-xs leading-relaxed text-ink-soft whitespace-pre-wrap">
                  {c.content}
                </p>
              </article>
            ))}
          <Link
            href={`/aturan?bab=${insight.bab}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-terra hover:underline underline-offset-2"
          >
            <BookOpen className="size-3" />
            Buka buku standar lengkap
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
