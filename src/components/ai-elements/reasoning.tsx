"use client";

import * as React from "react";
import { ChevronDown, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReasoningContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
  duration?: number;
}

const ReasoningContext = React.createContext<ReasoningContextValue>({
  isOpen: false,
  setIsOpen: () => {},
  isStreaming: false,
});

export interface ReasoningProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isStreaming?: boolean;
  duration?: number;
}

export function Reasoning({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  isStreaming = false,
  duration,
  className,
  children,
  ...props
}: ReasoningProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen || isStreaming);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const setIsOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming, setIsOpen]);

  return (
    <ReasoningContext.Provider value={{ isOpen, setIsOpen, isStreaming, duration }}>
      <div
        className={cn(
          "my-2.5 rounded-xl border border-rule/80 bg-canvas/60 text-xs text-ink-soft transition-colors",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

export function ReasoningTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isOpen, setIsOpen, isStreaming, duration } = React.useContext(ReasoningContext);

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex w-full items-center justify-between px-3.5 py-2 font-medium transition-colors hover:text-ink text-ink-soft",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <Brain className={cn("size-3.5", isStreaming ? "animate-pulse text-terra" : "text-ink-soft")} />
        <span>{children ?? (isStreaming ? "Sedang menimbang aturan akuntansi..." : "Proses Berpikir (Chain of Thought)")}</span>
        {duration !== undefined && !isStreaming && (
          <span className="rounded bg-rule/50 px-1.5 py-0.5 text-[11px] font-mono text-ink-soft">
            {duration.toFixed(1)}s
          </span>
        )}
      </div>
      <ChevronDown
        className={cn("size-3.5 transition-transform duration-200", isOpen && "rotate-180")}
      />
    </button>
  );
}

export function ReasoningContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = React.useContext(ReasoningContext);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "border-t border-rule/70 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink/80 bg-canvas/30",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
