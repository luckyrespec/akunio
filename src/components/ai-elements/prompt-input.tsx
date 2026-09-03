"use client";

import * as React from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PromptInputProps extends React.HTMLAttributes<HTMLDivElement> {
  onSubmit?: () => void;
}

export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ className, onSubmit, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col w-full rounded-2xl border border-border/80 bg-card p-3 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
PromptInput.displayName = "PromptInput";

export interface PromptInputTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onSubmit?: () => void;
}

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ className, onSubmit, onChange, ...props }, ref) => {
  const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    onChange?.(e);
  };

  React.useImperativeHandle(ref, () => internalRef.current as HTMLTextAreaElement);

  return (
    <textarea
      ref={internalRef}
      rows={1}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      className={cn(
        "max-h-[200px] min-h-[36px] w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0",
        className,
      )}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

export function PromptInputActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-2 flex items-center justify-between gap-2 pt-1 border-t border-border/30", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PromptInputSubmitProps
  extends React.ComponentPropsWithoutRef<typeof Button> {
  isStreaming?: boolean;
  onStop?: () => void;
}

export const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  PromptInputSubmitProps
>(({ className, isStreaming = false, onStop, onClick, disabled, ...props }, ref) => {
  if (isStreaming) {
    return (
      <Button
        ref={ref}
        type="button"
        size="icon"
        variant="destructive"
        className={cn("size-8 rounded-full shadow-xs transition-transform active:scale-95", className)}
        onClick={onStop}
        aria-label="Stop response"
        {...props}
      >
        <Square className="size-3.5 fill-current" />
      </Button>
    );
  }

  return (
    <Button
      ref={ref}
      type="button"
      size="icon"
      className={cn(
        "size-8 rounded-full bg-primary text-primary-foreground shadow-xs transition-transform hover:opacity-90 active:scale-95 disabled:opacity-40",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label="Send message"
      {...props}
    >
      <ArrowUp className="size-4" />
    </Button>
  );
});
PromptInputSubmit.displayName = "PromptInputSubmit";
