"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Search,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SakChapter, SakChunkItem } from "@/server/db/repos/sak-docs.repo";

interface AturanClientProps {
  chapters: SakChapter[];
  initialBab: number;
}

/**
 * Helper to parse inline markdown (bold, italic, code) and clean OCR punctuation artifacts
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  // 1. Bersihkan spasi liar sebelum tanda baca dan normalkan artefak bold seperti **.** atau **:**
  const normalized = text
    .replace(/([_*])\s+([.,;:])/g, "$1$2")
    .replace(/\*\*\s*([.:;])\s*\*\*/g, "$1")
    .replace(/([^\s\d])\s+([.:;])/g, "$1$2");

  const parts: React.ReactNode[] = [];
  let remaining = normalized;
  let partKey = 0;

  while (remaining.length > 0) {
    // 1. Bold: **...** atau __...__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      parts.push(
        <strong key={partKey++} className="font-semibold text-ink">
          {renderInlineMarkdown(boldMatch[2])}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 2. Italic: _..._ atau *...*
    const italicMatch = remaining.match(/^(_|\*)([^\r\n]+?)\1/);
    if (italicMatch) {
      parts.push(
        <em key={partKey++} className="italic text-ink/95">
          {renderInlineMarkdown(italicMatch[2])}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 3. Inline code: `...`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code
          key={partKey++}
          className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-terra border border-rule/70"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Teks biasa sampai token markdown berikutnya
    const nextSpecial = remaining.search(/(\*\*|__|_|\*|`)/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Simbol lepas
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

/**
 * Helper to render paragraphs and bullet/lettered lists with clean book typography
 */
function BookContentRenderer({ content }: { content: string }) {
  // Split content by paragraphs or list tokens and sanitize empty/leaked lines
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      // Abaikan baris yang hanya berisi tanda hubung/bullet kosong (- atau •)
      if (/^[-•*_—–\s]+$/.test(l)) return false;
      // Abaikan baris judul bab bocor seperti "###### **BAB 5**"
      if (/^#{1,6}\s*\**\s*BAB\s+\d+/i.test(l)) return false;
      return true;
    });

  return (
    <div className="space-y-4 text-base leading-relaxed text-ink/90 font-sans [text-justify:inter-word]">
      {lines.map((line, lIdx) => {
        // Cek jika baris adalah sub-heading markdown (misal "###### **Dasar Akrual**")
        const headingMatch = /^#{1,6}\s*(.*)$/.exec(line);
        if (headingMatch) {
          const rawHeading = headingMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
          if (rawHeading) {
            return (
              <h4
                key={lIdx}
                className="font-serif font-bold text-ink text-base pt-3 pb-1 tracking-tight"
              >
                {renderInlineMarkdown(rawHeading)}
              </h4>
            );
          }
          return null;
        }

        // Cek apakah baris ini memuat sub-daftar (a), (b), (c)
        if (/\([a-z0-9]+\)\s+/i.test(line)) {
          // Tokenize berdasarkan (a), (b), (c)
          const parts = line.split(/(?=\s*\([a-z0-9]+\)\s+)/i).map((p) => p.trim()).filter(Boolean);

          return (
            <div key={lIdx} className="space-y-2.5 my-3">
              {parts.map((part, pIdx) => {
                const itemMatch = /^\(([a-z0-9]+)\)\s+([\s\S]*)$/i.exec(part);
                if (itemMatch) {
                  const badge = itemMatch[1].toLowerCase();
                  const itemText = itemMatch[2];

                  return (
                    <div
                      key={pIdx}
                      className="group/item flex items-start gap-3.5 px-3.5 py-2.5 bg-canvas/40 hover:bg-canvas/80 rounded-xl border border-rule/60 transition-all duration-150"
                    >
                      <span className="inline-flex items-center justify-center size-6 min-w-6 rounded-md bg-terra text-white font-mono font-bold text-xs shadow-xs shrink-0 mt-0.5">
                        {badge}
                      </span>
                      <span className="flex-1 text-ink leading-relaxed font-normal text-justify [text-justify:inter-word] hyphens-auto">
                        {renderInlineMarkdown(itemText)}
                      </span>
                    </div>
                  );
                }

                // Teks pembuka sebelum item list
                return (
                  <p key={pIdx} className="text-ink leading-relaxed font-semibold text-justify [text-justify:inter-word] hyphens-auto">
                    {renderInlineMarkdown(part)}
                  </p>
                );
              })}
            </div>
          );
        }

        // Cek jika format bullet biasa "- " atau "• "
        if (/^[-•]\s+/i.test(line)) {
          const cleanText = line.replace(/^[-•]\s+/i, "");
          return (
            <div
              key={lIdx}
              className="flex items-start gap-3.5 px-3.5 py-2 bg-canvas/30 rounded-xl border border-rule/50 my-2"
            >
              <span className="size-2 rounded-full bg-terra shrink-0 mt-2 ring-4 ring-terra/15" />
              <span className="flex-1 text-ink leading-relaxed text-justify [text-justify:inter-word] hyphens-auto">
                {renderInlineMarkdown(cleanText)}
              </span>
            </div>
          );
        }

        // Paragraf narasi biasa
        return (
          <p key={lIdx} className="leading-relaxed text-ink/90 text-justify [text-justify:inter-word] hyphens-auto">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

export function AturanClient({ chapters, initialBab }: AturanClientProps) {
  const searchParams = useSearchParams();

  // Selected Bab
  const [selectedBab, setSelectedBab] = React.useState<number>(() => {
    const fromParam = searchParams.get("bab");
    const num = fromParam ? parseInt(fromParam, 10) : initialBab;
    return chapters.some((c) => c.bab === num) ? num : 1;
  });

  const [searchQuery, setSearchQuery] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Sync state if URL changes
  React.useEffect(() => {
    const fromParam = searchParams.get("bab");
    if (fromParam) {
      const num = parseInt(fromParam, 10);
      if (!isNaN(num) && chapters.some((c) => c.bab === num)) {
        setSelectedBab(num);
      }
    }
  }, [searchParams, chapters]);

  const handleSelectBab = (bab: number) => {
    setSelectedBab(bab);
    const url = new URL(window.location.href);
    url.searchParams.set("bab", bab.toString());
    window.history.pushState({}, "", url.toString());

    // Scroll hanya pembaca kanan ke atas
    const mainEl = document.getElementById("aturan-reader-content");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const activeChapter = chapters.find((c) => c.bab === selectedBab) ?? chapters[0];

  // Filter chapters in sidebar if search query is provided
  const filteredChapters = React.useMemo(() => {
    if (!searchQuery.trim()) return chapters;
    const q = searchQuery.toLowerCase();
    return chapters.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        `bab ${c.bab}`.includes(q) ||
        `bab ${String(c.bab).padStart(2, "0")}`.includes(q) ||
        c.chunks.some((ch) => ch.title.toLowerCase().includes(q) || ch.content.toLowerCase().includes(q)),
    );
  }, [chapters, searchQuery]);

  const copyCitation = (chunk: SakChunkItem) => {
    const citationText = `SAK EMKM Bab ${activeChapter.bab} (${activeChapter.title}) - ${chunk.title} ${chunk.paragraphRange ? `[${chunk.paragraphRange}]` : ""}`;
    navigator.clipboard.writeText(citationText);
    setCopiedId(chunk.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const prevBab = activeChapter.bab > 1 ? activeChapter.bab - 1 : null;
  const nextBab = activeChapter.bab < chapters.length ? activeChapter.bab + 1 : null;

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-canvas"
      data-assistant-context={`Bab ${activeChapter.bab}: ${activeChapter.title}`}
    >
      {/* 1. DOCKED SIDEBAR (FIXED, ONLY INTERNAL NAV SCROLLS) */}
      <aside className="w-72 xl:w-84 shrink-0 border-r border-rule bg-paper flex flex-col h-full overflow-hidden">
        {/* Header Bab */}
        <div className="p-4 border-b border-rule shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-terra text-white shadow-xs">
              <BookOpen className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-sm font-bold text-ink truncate tracking-tight">
                Standar SAK EMKM
              </h3>
              <p className="text-xs text-ink-soft font-mono">Edisi 2024 • 18 Bab Lengkap</p>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-soft" />
            <Input
              type="text"
              placeholder="Cari kata kunci aturan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-canvas/70 border-rule focus-visible:ring-terra/30"
            />
          </div>
        </div>

        {/* List Bab Navigation (Independent Scroll) */}
        <nav className="p-2 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-3 py-1.5 text-xs font-bold text-ink-soft uppercase tracking-wider">
            Daftar Bab Standar
          </div>

          {filteredChapters.length === 0 ? (
            <div className="text-center py-6 text-xs text-ink-soft">
              Tidak ada Bab yang cocok dengan kata kunci.
            </div>
          ) : (
            filteredChapters.map((c) => {
              const isActive = c.bab === selectedBab;
              return (
                <button
                  key={c.bab}
                  type="button"
                  onClick={() => handleSelectBab(c.bab)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs transition-all text-left group",
                    isActive
                      ? "bg-terra/12 text-ink font-bold shadow-2xs ring-1 ring-terra/30"
                      : "text-ink-soft hover:bg-canvas hover:text-ink",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        "size-5.5 rounded-md flex items-center justify-center text-xs font-mono shrink-0 transition-all font-bold",
                        isActive
                          ? "bg-terra text-white shadow-2xs"
                          : "bg-canvas text-ink-soft group-hover:text-ink border border-rule",
                      )}
                    >
                      {String(c.bab).padStart(2, "0")}
                    </span>
                    <span className="truncate text-xs tracking-tight">{c.title}</span>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-mono shrink-0 tabular-nums px-1.5 py-0.5 rounded",
                      isActive
                        ? "bg-terra/20 text-terra font-semibold"
                        : "text-ink-soft group-hover:bg-canvas"
                    )}
                  >
                    {c.chunks.length} klausul
                  </span>
                </button>
              );
            })
          )}
        </nav>
      </aside>

      {/* 2. MAIN READER: THE ONLY PANE THAT SCROLLS */}
      <main
        id="aturan-reader-content"
        className="flex-1 min-w-0 h-full overflow-y-auto bg-canvas/30 px-4 sm:px-8 lg:px-12 py-8 sm:py-12 custom-scrollbar"
      >
        {/* CONTINUOUS BOOK SHEET: +25% WIDER (max-w-4xl / 56rem) */}
        <div className="max-w-4xl mx-auto bg-paper rounded-2xl sm:rounded-3xl border border-rule shadow-xs p-6 sm:p-12 lg:p-16 space-y-12">
          {/* BOOK CHAPTER HEADER (EDITORIAL MASTHEAD) */}
          <header className="space-y-5 pb-8 border-b-2 border-rule">
            <div className="flex items-center justify-between gap-3 border-b border-rule/50 pb-3">
              <span className="text-xs font-bold text-terra tracking-widest uppercase flex items-center gap-2">
                <Bookmark className="size-3.5 text-terra" />
                Ikatan Akuntan Indonesia • SAK EMKM
              </span>
              <span className="text-xs text-ink-soft font-mono font-medium">
                Berlaku Efektif 2024
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <div className="inline-block text-xs font-mono font-bold text-terra uppercase tracking-widest bg-terra/10 border border-terra/20 px-2.5 py-0.5 rounded-md">
                BAB {String(activeChapter.bab).padStart(2, "0")}
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif font-black text-ink tracking-tight leading-tight">
                {activeChapter.title}
              </h1>
            </div>

            {activeChapter.description && (
              <p className="text-base text-ink-soft leading-relaxed italic border border-rule/70 p-4 bg-canvas/40 rounded-xl text-justify [text-justify:inter-word]">
                {activeChapter.description}
              </p>
            )}
          </header>

          {/* CONTINUOUS READING BODY (NOT CARDS) */}
          <div className="space-y-10 divide-y divide-rule/60">
            {activeChapter.chunks.map((chunk, idx) => {
              const isCopied = copiedId === chunk.id;

              return (
                <section
                  key={chunk.id}
                  id={`par-${chunk.chunkIndex}`}
                  className={cn("space-y-4 group scroll-mt-8", idx > 0 && "pt-9")}
                >
                  {/* Section / Clause Header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg sm:text-xl font-bold text-ink font-serif tracking-tight">
                        {chunk.title}
                      </h2>
                      {chunk.paragraphRange && (
                        <span className="inline-flex items-center rounded-md bg-terra/10 px-2 py-0.5 text-xs font-mono text-terra font-bold border border-terra/25">
                          {chunk.paragraphRange}
                        </span>
                      )}
                    </div>

                    {/* Subtle hover copy citation button */}
                    <button
                      type="button"
                      onClick={() => copyCitation(chunk)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-ink-soft hover:text-terra flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-canvas border border-transparent hover:border-rule"
                      title="Salin rujukan resmi Bab dan Paragraf"
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3.5 text-emerald-600" />
                          <span className="text-emerald-600 font-semibold">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span className="font-medium">Salin Sitasi</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Clean Book Text Content & Lists (Justified & Hyphenated) */}
                  <BookContentRenderer content={chunk.content} />
                </section>
              );
            })}
          </div>

          {/* BOOK FOOTER NAVIGATION */}
          <footer className="pt-10 border-t-2 border-rule flex flex-col sm:flex-row items-center justify-between gap-4">
            {prevBab ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSelectBab(prevBab)}
                className="w-full sm:w-auto gap-2 text-xs font-medium bg-paper border-rule hover:bg-canvas hover:border-terra/40 text-ink"
              >
                <ArrowLeft className="size-3.5 text-terra" />
                <span>Bab {String(prevBab).padStart(2, "0")}: {chapters.find((c) => c.bab === prevBab)?.title}</span>
              </Button>
            ) : <div className="hidden sm:block" />}

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("aturan-reader-content");
                el?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="text-xs text-ink-soft hover:text-terra font-medium transition-colors"
            >
              ↑ Kembali ke atas
            </button>

            {nextBab && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSelectBab(nextBab)}
                className="w-full sm:w-auto gap-2 text-xs font-medium ml-auto bg-paper border-rule hover:bg-canvas hover:border-terra/40 text-ink"
              >
                <span>Bab {String(nextBab).padStart(2, "0")}: {chapters.find((c) => c.bab === nextBab)?.title}</span>
                <ArrowRight className="size-3.5 text-terra" />
              </Button>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
