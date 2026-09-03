"use client";

import * as React from "react";
import { CornerDownLeft, Square, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface PromptInputProps extends React.HTMLAttributes<HTMLDivElement> {
  onSubmit?: () => void;
  onDropFiles?: (files: File[]) => void;
}

export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ className, onSubmit, onDropFiles, children, ...props }, ref) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // Only set to false if leaving the root container
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const filesArray = Array.from(e.dataTransfer.files);
        onDropFiles?.(filesArray);
      }
    };

    return (
      <div
        ref={ref}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col w-full rounded-3xl border border-rule bg-paper p-3 md:p-3.5 shadow-sm transition-all focus-within:border-terra/70 focus-within:ring-2 focus-within:ring-terra/15",
          isDragging && "border-dashed border-terra ring-2 ring-terra/30 bg-terra/5",
          className,
        )}
        {...props}
      >
        {/* Drop Zone Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-paper/90 backdrop-blur-xs border-2 border-dashed border-terra animate-in fade-in-0">
            <UploadCloud className="size-8 text-terra animate-bounce mb-1" />
            <p className="font-display font-semibold text-xs text-ink">Lepaskan berkas di sini untuk melampirkan</p>
            <p className="text-[10px] text-ink-soft">Mendukung gambar (PNG, JPG) dan dokumen PDF</p>
          </div>
        )}

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
  tooltip?: string;
}

export const PromptInputButton = React.forwardRef<
  HTMLButtonElement,
  PromptInputButtonProps
>(({ className, active, tooltip, children, ...props }, ref) => {
  const button = (
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

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
});
PromptInputButton.displayName = "PromptInputButton";

export interface PromptInputSubmitProps
  extends React.ComponentPropsWithoutRef<typeof Button> {
  isStreaming?: boolean;
  tooltip?: string;
  onStop?: () => void;
}

export const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  PromptInputSubmitProps
>(({ className, isStreaming = false, tooltip, onStop, onClick, disabled, ...props }, ref) => {
  const content = isStreaming ? (
    <Button
      ref={ref}
      type="button"
      size="icon"
      variant="destructive"
      className={cn("size-8 rounded-full shadow-2xs transition-transform active:scale-95", className)}
      onClick={onStop}
      aria-label="Hentikan jawaban"
      {...props}
    >
      <Square className="size-3.5 fill-current" />
    </Button>
  ) : (
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
      aria-label="Kirim pesan"
      {...props}
    >
      <CornerDownLeft className="size-4" />
    </Button>
  );

  const defaultTooltip = isStreaming
    ? "Hentikan respon"
    : "Kirim pesan (Enter, Alt+Enter untuk baris baru)";

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top">{tooltip || defaultTooltip}</TooltipContent>
    </Tooltip>
  );
});
PromptInputSubmit.displayName = "PromptInputSubmit";
