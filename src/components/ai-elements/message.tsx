"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant";
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ from, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-from={from}
        className={cn(
          "group flex w-full gap-4 text-sm",
          from === "user" ? "justify-end" : "justify-start",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Message.displayName = "Message";

export interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant";
}

export const MessageContent = React.forwardRef<HTMLDivElement, MessageContentProps>(
  ({ className, children, from, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative max-w-[88%] md:max-w-[80%] rounded-2xl px-5 py-3.5 shadow-xs transition-all",
          from === "user"
            ? "bg-ink text-white shadow-xs dark:bg-terra dark:text-white"
            : "border border-rule bg-paper text-ink",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
MessageContent.displayName = "MessageContent";

function renderFormattedContent(text: string) {
  // Normalize bullet points that might be concatenated without newlines (e.g. "bantu: - Catat ... - Buat ...")
  // Replace patterns like " - " or ": - " into "\n- "
  let normalized = text
    .replace(/([^\n])\s+-\s+/g, "$1\n- ")
    .replace(/:\s*-\s+/g, ":\n- ");

  // Split into lines
  const lines = normalized.split("\n");
  const elements: React.ReactNode[] = [];
  let currentListItems: string[] = [];
  let blockKey = 0;

  const flushList = () => {
    if (currentListItems.length > 0) {
      elements.push(
        <ul key={`ul-${blockKey++}`} className="my-2 ml-4 list-disc space-y-1 text-ink/90">
          {currentListItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed pl-1 marker:text-terra">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentListItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is a bullet point (- or * or •)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      currentListItems.push(bulletMatch[1]);
      continue;
    }

    // Check if line is a numbered list (1. 2.)
    const numberMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numberMatch) {
      flushList();
      elements.push(
        <div key={`ol-${blockKey++}`} className="my-1.5 flex items-start gap-2 leading-relaxed">
          <span className="font-semibold text-terra shrink-0 text-xs mt-0.5">
            {trimmed.slice(0, trimmed.indexOf(" ") + 1)}
          </span>
          <span>{renderInlineMarkdown(numberMatch[1])}</span>
        </div>
      );
      continue;
    }

    flushList();

    if (!trimmed) {
      // Empty line / paragraph break
      elements.push(<div key={`br-${blockKey++}`} className="h-2" />);
      continue;
    }

    // Normal paragraph line
    elements.push(
      <p key={`p-${blockKey++}`} className="my-1.5 leading-relaxed">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushList();
  return elements;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Parse inline bold (**...**), inline italic (*...* or _..._), and inline code (`...`)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partKey = 0;

  while (remaining.length > 0) {
    // 1. Check for bold **...** or __...__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      parts.push(
        <strong key={partKey++} className="font-semibold text-ink">
          {boldMatch[2]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 2. Check for italic *...* or _..._ (single asterisk or underscore without spaces at edges)
    const italicMatch = remaining.match(/^(\*|_)([^\s*_](?:.*?[^\s*_])?)\1/);
    if (italicMatch) {
      parts.push(
        <em key={partKey++} className="italic text-ink/95">
          {italicMatch[2]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 3. Check for inline code `...`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code
          key={partKey++}
          className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px] text-terra border border-rule/70"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Plain text up to next special char (*, _, `)
    const nextSpecial = remaining.search(/(\*|_|`)/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Unpaired formatting symbol or single asterisk
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export const MessageResponse = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed text-ink",
        "prose-p:leading-relaxed prose-p:my-1.5 prose-headings:font-display prose-headings:text-ink",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? renderFormattedContent(children) : children}
    </div>
  );
});
MessageResponse.displayName = "MessageResponse";
