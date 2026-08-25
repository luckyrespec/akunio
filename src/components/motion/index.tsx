"use client";

import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Money } from "@/core/money/money";

const EASE_OUT_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Reveal — gentle entrance for cards, headers, panels
export function Reveal({
  children,
  delay = 0,
  className,
}: PropsWithChildren<{ delay?: number; className?: string }>) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE_OUT_SOFT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger — sequential reveal for grids/lists (max ~6 items stagger visually)
export function Stagger({
  children,
  className,
  staggerDelay = 0.06,
}: PropsWithChildren<{ className?: string; staggerDelay?: number }>) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: staggerDelay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_SOFT } },
};

// StaggerItem — RSC-safe child for <Stagger> grids (use instead of raw motion.div)
export function StaggerItem({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// PageTransition — route content fade + lift
export function PageTransition({ children }: PropsWithChildren) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT_SOFT }}
    >
      {children}
    </motion.div>
  );
}

// Pressable — micro-interaction for buttons/cards
export function Pressable({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// AnimatedNumber — KPI counting up on first view (RSC-safe: pass serializable minor units)
export function AnimatedNumber({
  minor,
  className,
}: {
  minor: bigint | number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(() => (reduce ? Number(minor) : 0));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(Number(minor));
      return;
    }
    const controls = animate(0, Number(minor), {
      duration: 0.8,
      ease: EASE_OUT_SOFT,
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [inView, minor, reduce]);

  return (
    <span ref={ref} className={className}>
      {Money.fromMinor(BigInt(Math.round(display))).formatIdr()}
    </span>
  );
}
