"use client";

import { useSyncExternalStore } from "react";
import { motion } from "motion/react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Entrance tunggal yang tenang untuk momen vonis — diam bila reduced motion. */
export function Entrance({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [...EASE_OUT] }}
    >
      {children}
    </motion.div>
  );
}

/** Isian meter stok: transform scaleX (GPU), bukan width. */
export function MeterFill({ fill, title }: { fill: number; title?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className="absolute inset-y-0 left-0 origin-left rounded-full bg-terra"
      style={{ width: `${fill}%` }}
      title={title}
      initial={false}
      animate={{ scaleX: reduced ? 1 : [0, 1] }}
      transition={{ duration: 0.5, ease: [...EASE_OUT] }}
    />
  );
}
