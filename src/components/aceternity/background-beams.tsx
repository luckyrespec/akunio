"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const BEAM_COUNT = 14;

export function BackgroundBeams({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const paths = useMemo(
    () =>
      Array.from({ length: BEAM_COUNT }, (_, i) => {
        const x = (i + 1) * 90;
        return `M${-x} -40 C ${-x + 160} 220, ${x + 240} 420, ${x + 420} 900`;
      }),
    [],
  );

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg className="absolute inset-0 size-full" viewBox="0 0 900 900" preserveAspectRatio="xMidYMid slice">
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-rule)" strokeOpacity={0.5} strokeWidth={1} />
        ))}
      </svg>
      {!reduce && (
        <svg className="absolute inset-0 size-full" viewBox="0 0 900 900" preserveAspectRatio="xMidYMid slice">
          {paths.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="var(--color-terra)"
              strokeOpacity={0.28}
              strokeWidth={1.5}
              initial={{ pathLength: 0, pathOffset: 0 }}
              animate={{ pathLength: [0, 0.18, 0], pathOffset: [0, 0.9, 1] }}
              transition={{
                duration: 9 + (i % 5),
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.7,
              }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
