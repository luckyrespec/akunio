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
        "flex w-full flex-wrap items-center gap-1.5 overflow-x-auto py-1 scrollbar-none",
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
  suggestion: string;
  onClick?: (suggestion: string) => void;
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => onClick?.(suggestion)}
      className={cn(
        "h-7 rounded-md border border-ink/15 bg-paper px-2.5 text-xs font-normal text-ink/85 shadow-none transition-colors hover:border-ink/30 hover:bg-ink/5 hover:text-ink active:scale-[0.98]",
        className
      )}
      {...props}
    >
      {suggestion}
    </Button>
  );
}
