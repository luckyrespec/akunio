"use client";

import * as React from "react";

/**
 * Helper to parse inline markdown (bold, italic, code) and clean OCR punctuation artifacts
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const normalized = text
    .replace(/([_*])\s+([.,;:])/g, "$1$2")
    .replace(/\*\*\s*([.:;])\s*\*\*/g, "$1")
    .replace(/([^\s\d])\s+([.:;])/g, "$1$2");

  const parts: React.ReactNode[] = [];
  let remaining = normalized;
  let partKey = 0;

  while (remaining.length > 0) {
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

    const nextSpecial = remaining.search(/(\*\*|__|_|\*|`)/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export interface BookContentRendererProps {
  content: string;
  textSize?: string;
}

/**
 * Shared component to render SAK EMKM rule book content with paragraphs,
 * lists (a, b, c), bullets, and markdown typography.
 */
export function BookContentRenderer({
  content,
  textSize = "text-base",
}: BookContentRendererProps) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (/^[-•*_—–\s]+$/.test(l)) return false;
      if (/^#{1,6}\s*\**\s*BAB\s+\d+/i.test(l)) return false;
      return true;
    });

  return (
    <div className={`space-y-4 leading-relaxed text-ink/90 font-sans [text-justify:inter-word] ${textSize}`}>
      {lines.map((line, lIdx) => {
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

        if (/\([a-z0-9]+\)\s+/i.test(line)) {
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

                return (
                  <p key={pIdx} className="text-ink leading-relaxed font-semibold text-justify [text-justify:inter-word] hyphens-auto">
                    {renderInlineMarkdown(part)}
                  </p>
                );
              })}
            </div>
          );
        }

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

        return (
          <p key={lIdx} className="leading-relaxed text-ink/90 text-justify [text-justify:inter-word] hyphens-auto">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}
