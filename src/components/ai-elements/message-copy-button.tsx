"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { copyTextToClipboard } from "@/components/ai-elements/copy-text";
import { cn } from "@/lib/utils";

/** Tombol salin kecil untuk setiap bubble pesan (user & asisten). */
export function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="message-copy"
      aria-label={copied ? "Tersalin" : "Salin pesan"}
      title={copied ? "Tersalin" : "Salin pesan"}
      className={cn(
        "rounded-md p-1 text-ink-soft transition-all hover:bg-canvas hover:text-ink",
        "opacity-60 hover:opacity-100 focus-visible:opacity-100",
        "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
      )}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}
