"use client";

import * as React from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { CitationLink } from "@/components/ai-elements/citation-link";
import { assistantRehypePlugins } from "@/components/ai-elements/citation-refs";

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
          "relative max-w-[88%] md:max-w-[80%] rounded-2xl px-5 py-3.5 shadow-xs transition-colors",
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

export interface MessageResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  /** True saat teks masih di-stream (animasi progresif aktif). */
  isAnimating?: boolean;
}

/** Kecepatan reveal typewriter saat stream: atur di sini (karakter per tick). */
const STREAM_TICK_MS = 30;
const STREAM_CHUNK_CHARS = 2;
/** Saat tertinggal jauh (burst besar), kejar proporsional agar tak ada lompatan di akhir. */
const CATCH_UP_DIVISOR = 12;

export const MessageResponse = React.forwardRef<HTMLDivElement, MessageResponseProps>(
  ({ className, children, isAnimating = false, ...props }, ref) => {
    const text = typeof children === "string" ? children : null;
    // Reveal berkecepatan: network mengirim burst besar sekaligus (terutama
    // jawaban hasil sintesis tool), jadi tampilan dikejar bertahap agar
    // terlihat mengetik. Selesai stream → teks penuh sekaligus.
    const [revealed, setRevealed] = React.useState(0);
    React.useEffect(() => {
      if (!isAnimating || text === null) return;
      if (revealed > text.length) {
        setRevealed(text.length);
        return;
      }
      if (revealed >= text.length) return;
      const t = setTimeout(() => {
        setRevealed((r) => {
          const len = text?.length ?? r;
          const backlog = len - r;
          const step = Math.max(STREAM_CHUNK_CHARS, Math.ceil(backlog / CATCH_UP_DIVISOR));
          return Math.min(r + step, len);
        });
      }, STREAM_TICK_MS);
      return () => clearTimeout(t);
    }, [isAnimating, text, revealed]);
    const shown = !isAnimating || text === null ? children : text.slice(0, revealed);
    return (
      <div
        ref={ref}
        className={cn("max-w-none break-words leading-relaxed text-ink text-sm", className)}
        {...props}
      >
        {typeof shown === "string" ? (
          <Streamdown
            mode={isAnimating ? undefined : "static"}
            isAnimating={isAnimating}
            rehypePlugins={assistantRehypePlugins as never}
            components={{ a: CitationLink as never }}
          >
            {shown}
          </Streamdown>
        ) : (
          shown
        )}
      </div>
    );
  },
);
MessageResponse.displayName = "MessageResponse";
