"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { SakRuleSheet } from "@/components/sak/sak-rule-sheet";
import { getSakChapterForSheetAction } from "@/server/actions/sak.actions";
import type { SakChapter } from "@/server/db/repos/sak-docs.repo";
import type { DailyInsight } from "@/core/kas-bank/insights";

/** Tombol Pelajari standar. Membuka isi Bab SAK EMKM dalam sheet. */
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

  const blocks =
    chapter && !error
      ? chapter.chunks.map((c) => ({
          title: c.title,
          paragraphRange: c.paragraphRange,
          content: c.content,
        }))
      : [];

  return (
    <>
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
      <SakRuleSheet
        open={open}
        onOpenChange={setOpen}
        heading={`Bab ${insight.bab}: ${chapter?.title ?? "Standar SAK EMKM"}`}
        description={
          chapter?.description ?? "Ringkasan aturan terkait insight harian ini."
        }
        loading={loading}
        blocks={error ? [{ title: "Gagal memuat", content: error }] : blocks}
        emptyHint="Isi lengkap bab ini belum tersedia di perangkat."
        bodyFooter={
          <Link
            href={`/aturan?bab=${insight.bab}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-terra hover:underline underline-offset-2"
          >
            <BookOpen className="size-3" />
            Buka buku standar lengkap
          </Link>
        }
      />
    </>
  );
}
