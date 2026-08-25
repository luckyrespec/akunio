"use client";

import { useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  duration = 3000,
  className,
  borderRadius = "0.75rem",
}: {
  children: React.ReactNode;
  duration?: number;
  className?: string;
  borderRadius?: string;
}) {
  const reduce = useReducedMotion();
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    if (reduce) return;
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMs = length / duration;
      progress.set((time * pxPerMs) % length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px)`;

  return (
    <div className={cn("relative", className)} style={{ borderRadius }}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        style={{ borderRadius }}
      >
        <rect
          ref={pathRef}
          fill="none"
          stroke="var(--color-terra)"
          strokeOpacity={reduce ? 0.35 : 0.5}
          strokeWidth={1.5}
          width="100%"
          height="100%"
          rx={borderRadius}
        />
      </svg>
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute size-[88px] rounded-full opacity-60"
          style={{
            transform,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-terra) 45%, transparent), transparent 65%)",
          }}
        />
      )}
      <div className="relative" style={{ borderRadius }}>
        {children}
      </div>
    </div>
  );
}
