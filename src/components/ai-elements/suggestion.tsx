"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SuggestionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Suggestions({ className, children, ...props }: SuggestionsProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center gap-2 py-1 scrollbar-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SuggestionProps
  extends Omit<React.ComponentProps<typeof Button>, "onClick"> {
  suggestion?: string;
  onClick?: (suggestion: string) => void;
  icon?: React.ReactNode;
  label?: string;
  description?: string;
}

export function Suggestion({
  suggestion = "",
  onClick,
  icon,
  label,
  description,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) {
  const valueToPass = suggestion || (typeof children === "string" ? children : label || "");

  // Card layout when icon or description is provided
  if (icon || description || label) {
    return (
      <button
        type="button"
        onClick={() => onClick?.(valueToPass)}
        className={cn(
          "group flex w-full items-start gap-3 rounded-2xl border border-rule bg-paper p-3.5 text-left text-xs shadow-2xs transition-all duration-200 ease-out hover:border-terra/70 hover:shadow-xs hover:bg-canvas/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra/30",
          className
        )}
      >
        {icon && (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-canvas text-terra shadow-2xs group-hover:scale-105 transition-transform duration-200">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-ink text-xs sm:text-sm group-hover:text-terra transition-colors duration-200">
            {label || children}
          </div>
          {description && (
            <div className="mt-0.5 text-[11px] text-ink-soft leading-relaxed line-clamp-2">
              {description}
            </div>
          )}
        </div>
      </button>
    );
  }

  // Standard chip / pill suggestion button
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => onClick?.(valueToPass)}
      className={cn(
        "h-7 rounded-lg border border-ink/15 bg-paper px-2.5 text-xs font-normal text-ink/85 shadow-none transition-colors hover:border-ink/30 hover:bg-ink/5 hover:text-ink active:scale-[0.99]",
        className
      )}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
}
