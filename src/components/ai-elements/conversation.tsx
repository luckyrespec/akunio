"use client";

import * as React from "react";
import { ArrowDown, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationContextValue {
  isAtBottom: boolean;
  scrollToBottom: () => void;
}

const ConversationContext = React.createContext<ConversationContextValue>({
  isAtBottom: true,
  scrollToBottom: () => {},
});

export function useConversation() {
  return React.useContext(ConversationContext);
}

export interface ConversationProps extends React.HTMLAttributes<HTMLDivElement> {
  autoScroll?: boolean;
  onDropFiles?: (files: File[]) => void;
}

export const Conversation = React.forwardRef<HTMLDivElement, ConversationProps>(
  ({ className, children, autoScroll = true, onDropFiles, ...props }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = React.useState(true);
    const [isDragging, setIsDragging] = React.useState(false);
    const dragCounter = React.useRef(0);

    const handleScroll = React.useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const threshold = 60;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
      setIsAtBottom(atBottom);
    }, []);

    const scrollToBottom = React.useCallback(() => {
      const el = containerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }, []);

    React.useEffect(() => {
      if (autoScroll && isAtBottom) {
        const el = containerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });

    // Drag and drop support across the entire conversation area
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setIsDragging(false);
        dragCounter.current = 0;
      }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const filesArray = Array.from(e.dataTransfer.files);
        onDropFiles?.(filesArray);
      }
    };

    React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

    return (
      <ConversationContext.Provider value={{ isAtBottom, scrollToBottom }}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden paper-scrollbar transition-colors",
            isDragging && "bg-terra/5",
            className,
          )}
          {...props}
        >
          {/* Full-Window Drop Overlay (ChatGPT / Gemini style) */}
          {isDragging && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-paper/85 backdrop-blur-xs border-2 border-dashed border-terra p-6 animate-in fade-in-0 pointer-events-none">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-terra/15 text-terra shadow-sm mb-3">
                <UploadCloud className="size-8" />
              </div>
              <h3 className="font-display text-base font-bold text-ink">Lepaskan berkas di sini untuk melampirkan</h3>
              <p className="text-xs text-ink-soft mt-1">Berkas akan langsung disematkan ke percakapan Akunio</p>
            </div>
          )}

          {children}
        </div>
      </ConversationContext.Provider>
    );
  },
);
Conversation.displayName = "Conversation";

export function ConversationContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-4xl lg:max-w-5xl flex-col gap-4 p-4 md:p-6", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ConversationScrollButton({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useConversation();

  // WAJIB sticky (bukan absolute): tombol ini dirender di dalam kontainer scroll,
  // dan elemen absolute ikut kegulung bersama konten. Sticky bottom-4 menempelkannya
  // ke viewport area percakapan. Wrapper h-0 agar tidak menambah ruang kosong.
  // Tombol memudar (bukan unmount) saat sudah di paling bawah.
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 -mt-8 flex h-0 justify-end pr-4">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={scrollToBottom}
        className={cn(
          "pointer-events-auto size-8 rounded-full border border-rule bg-paper/90 text-ink shadow-md backdrop-blur-xs transition-all duration-200 hover:bg-canvas active:scale-[0.98]",
          isAtBottom
            ? "pointer-events-none translate-y-2 opacity-0"
            : "translate-y-0 opacity-100",
          className,
        )}
        aria-label="Scroll to bottom"
        tabIndex={isAtBottom ? -1 : undefined}
        {...props}
      >
        <ArrowDown className="size-4 text-ink-soft" />
      </Button>
    </div>
  );
}

export function ConversationEmptyState({
  icon,
  title,
  description,
  children,
  className,
  ...props
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "my-auto flex flex-col items-center justify-center py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-canvas/80 shadow-2xs border border-rule">{icon}</div>}
      <h3 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-md text-xs md:text-sm text-ink-soft leading-relaxed">{description}</p>}
      {children && <div className="mt-6 w-full max-w-xl">{children}</div>}
    </div>
  );
}
