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

  const currentLabel = value === "deep" ? "Akunio Analis" : "Akunio Kilat";
  const CurrentIcon = value === "deep" ? Brain : Zap;

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 gap-1.5 rounded-full border border-rule/70 bg-paper px-3 text-xs font-medium text-ink shadow-2xs hover:bg-canvas transition-colors"
      >
        <CurrentIcon className={cn("size-3.5", value === "deep" ? "text-purple-600" : "text-amber-600")} />
        <span>{currentLabel}</span>
        <ChevronDown className="size-3 text-ink-soft" />
      </Button>

      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-60 rounded-xl border border-rule bg-paper p-1.5 text-ink shadow-md backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              onValueChange("fast");
              setIsOpen(false);
            }}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left text-xs transition-colors hover:bg-canvas focus-ring",
              value === "fast" && "bg-canvas font-medium border border-rule/60",
            )}
          >
            <Zap className="mt-0.5 size-4 text-amber-600 shrink-0" />
            <div>
              <div className="font-semibold text-ink">Akunio Kilat (Flash)</div>
              <div className="text-[11px] text-ink-soft">Eksekusi cepat untuk tugas dan pencarian rutin</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onValueChange("deep");
              setIsOpen(false);
            }}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left text-xs transition-colors hover:bg-canvas focus-ring",
              value === "deep" && "bg-canvas font-medium border border-rule/60",
            )}
          >
            <Brain className="mt-0.5 size-4 text-purple-600 shrink-0" />
            <div>
              <div className="font-semibold text-ink">Akunio Analis (Deep Thinking)</div>
              <div className="text-[11px] text-ink-soft">Penalaran bertahap untuk audit & rekonsiliasi kompleks</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
