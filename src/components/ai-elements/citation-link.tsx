"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { parseCitationHref } from "@/components/ai-elements/citation-refs";
import { useCitationSheet } from "@/components/ai-elements/citation-sheet";
import { cn } from "@/lib/utils";

const CHIP =
  "inline-flex items-center gap-1 rounded-md border border-terra/30 bg-terra/5 px-1.5 py-0.5 align-baseline text-[11px] font-medium text-terra transition-colors hover:border-terra/50 hover:bg-terra/10";

/**
 * Override tag <a> Streamdown untuk sitasi inline Akunio.
 * - "sak:11:11.1" → chip pembuka drawer SAK (atau fallback link /aturan).
 * - "jurnal:JE-…" → chip link daftar jurnal terfilter nomor.
 * - lainnya → anchor biasa.
 */
export function CitationLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const sheet = useCitationSheet();
  const ref = parseCitationHref(href ?? "");
  const label = children ?? "Rujukan";

  if (ref.kind === "sak") {
    if (sheet) {
      return (
        <button
          type="button"
          onClick={() => sheet.openSak(ref.bab, ref.paragraph)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka SAK EMKM Bab ${ref.bab}${ref.paragraph ? ` §${ref.paragraph}` : ""}`}
        >
          <BookOpen className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <a href={`/aturan?bab=${encodeURIComponent(ref.bab)}`} className={CHIP}>
        <BookOpen className="size-3" />
        <span>{label}</span>
      </a>
    );
  }

  if (ref.kind === "jurnal") {
    return (
      <Link href={`/jurnal?q=${encodeURIComponent(ref.number)}`} className={CHIP} title={ref.number}>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <a href={ref.href} target="_blank" rel="noreferrer" className="text-terra underline underline-offset-2">
      {label}
    </a>
  );
}
