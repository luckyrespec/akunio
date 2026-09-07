"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PropsWithChildren } from "react";

const EASE_OUT_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ScrollReveal — sekali masuk viewport, lalu diam. Marketing: ≤400ms ease-out.
export function ScrollReveal({
  children,
  className,
  delay = 0,
  y = 16,
}: PropsWithChildren<{ className?: string; delay?: number; y?: number }>) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.4, delay, ease: EASE_OUT_SOFT }}
    >
      {children}
    </motion.div>
  );
}
