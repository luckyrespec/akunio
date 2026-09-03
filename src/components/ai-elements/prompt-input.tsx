"use client";

import * as React from "react";
import { CornerDownLeft, Square } from "lucide-react";
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
          "relative flex flex-col w-full rounded-3xl border border-rule bg-paper p-3 md:p-3.5 shadow-sm transition-all focus-within:border-terra/70 focus-within:ring-2 focus-within:ring-terra/15",
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

export function PromptInputHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  if (React.Children.count(children) === 0) return null;
  return (
    <div className={cn("mb-2 flex flex-wrap items-center gap-1.5", className)} {...props}>
      {children}
    </div>
  );
}

export function PromptInputBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative flex-1", className)} {...props}>
      {children}
    </div>
  );
}

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
    if (e.key === "Enter") {
      if (e.altKey || e.shiftKey) {
        // Alt+Enter or Shift+Enter allows newline without sending
        return;
      }
      e.preventDefault();
      onSubmit?.();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
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
        "max-h-[220px] min-h-[42px] w-full resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-0",
        className,
      )}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

export function PromptInputFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-2 flex items-center justify-between gap-2 pt-2 border-t border-rule/50", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PromptInputTools({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} {...props}>
      {children}
    </div>
  );
}

export interface PromptInputButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const PromptInputButton = React.forwardRef<
  HTMLButtonElement,
  PromptInputButtonProps
>(({ className, active, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-all shadow-2xs",
        active
          ? "border-terra/40 bg-terra/10 text-terra"
          : "border-rule/70 bg-canvas/60 text-ink-soft hover:bg-canvas hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
PromptInputButton.displayName = "PromptInputButton";

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
        className={cn("size-8 rounded-full shadow-2xs transition-transform active:scale-95", className)}
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
        "size-8 rounded-full bg-terra text-white shadow-2xs transition-transform hover:bg-terra/90 active:scale-95 disabled:opacity-35 disabled:hover:bg-terra",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label="Kirim pesan (Enter)"
      title="Kirim (Enter, Alt+Enter untuk baris baru)"
      {...props}
    >
      <CornerDownLeft className="size-4" />
    </Button>
  );
});
PromptInputSubmit.displayName = "PromptInputSubmit";
