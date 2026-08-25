"use client";

import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function GlowCard({
  children,
  className,
  intensity = "soft",
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: "soft" | "medium";
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("group/glow relative rounded-2xl", className)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover/glow:opacity-100",
          reduce && "hidden",
          intensity === "soft"
            ? "[background:radial-gradient(360px_circle_at_50%_0%,color-mix(in_oklab,var(--color-terra)_14%,transparent),transparent_70%)]"
            : "[background:radial-gradient(480px_circle_at_50%_0%,color-mix(in_oklab,var(--color-terra)_22%,transparent),transparent_70%)]",
        )}
      />
      <div className="relative h-full rounded-2xl border border-rule bg-paper shadow-xs transition-shadow duration-500 group-hover/glow:shadow-md">
        {children}
      </div>
    </div>
  );
}
