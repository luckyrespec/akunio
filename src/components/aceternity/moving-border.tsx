"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  active = false,
  duration = 3000,
  className,
  borderRadius = "0.75rem",
}: {
  children: React.ReactNode;
  active?: boolean;
  duration?: number;
  className?: string;
  borderRadius?: string;
}) {
  const reduce = useReducedMotion();

  if (!active) {
    return (
      <div className={cn("relative", className)} style={{ borderRadius }}>
        <div className="relative" style={{ borderRadius }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden p-[1px]", className)} style={{ borderRadius }}>
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-[-100%]"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, transparent 0deg, var(--color-terra) 180deg, transparent 360deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: duration / 1000,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      )}
      <div className="relative rounded-[inherit] bg-paper" style={{ borderRadius }}>
        {children}
      </div>
    </div>
  );
}
