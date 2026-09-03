"use client";

import * as React from "react";
import { Zap, Brain, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ModelPreset = "fast" | "deep";

export interface ModelSelectorProps {
  value: ModelPreset;
  onValueChange: (val: ModelPreset) => void;
  className?: string;
  disabled?: boolean;
}

export function ModelSelector({
  value,
  onValueChange,
  className,
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const currentLabel = value === "deep" ? "Nara Analis" : "Nara Kilat";
  const CurrentIcon = value === "deep" ? Brain : Zap;

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      >
        <CurrentIcon className={cn("size-3.5", value === "deep" ? "text-purple-500" : "text-amber-500")} />
        <span>{currentLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </Button>

      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-56 rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              onValueChange("fast");
              setIsOpen(false);
            }}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg p-2 text-left text-xs transition-colors hover:bg-accent",
              value === "fast" && "bg-accent font-medium",
            )}
          >
            <Zap className="mt-0.5 size-4 text-amber-500 shrink-0" />
            <div>
              <div className="font-semibold text-foreground">Nara Kilat (Flash)</div>
              <div className="text-[11px] text-muted-foreground">Eksekusi cepat untuk tugas dan pencarian rutin</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onValueChange("deep");
              setIsOpen(false);
            }}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg p-2 text-left text-xs transition-colors hover:bg-accent",
              value === "deep" && "bg-accent font-medium",
            )}
          >
            <Brain className="mt-0.5 size-4 text-purple-500 shrink-0" />
            <div>
              <div className="font-semibold text-foreground">Nara Analis (Deep Thinking)</div>
              <div className="text-[11px] text-muted-foreground">Penalaran bertahap untuk audit & rekonsiliasi kompleks</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
