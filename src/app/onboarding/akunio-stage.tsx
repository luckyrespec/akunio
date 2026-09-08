"use client";

import { useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { AkunioAvatar } from "./akunio-avatar";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export type StageStatus = "idle" | "typing" | "done";

/** Panel kanan onboarding: hanya avatar Akunio yang hidup + tilt 3D mouse. */
export function AkunioStage({ status }: { status: StageStatus }) {
  const reduced = usePrefersReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [7, -7]), {
    stiffness: 120,
    damping: 16,
  });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-9, 9]), {
    stiffness: 120,
    damping: 16,
  });
  const glowX = useSpring(useTransform(mx, [0, 1], [-22, 22]), {
    stiffness: 90,
    damping: 18,
  });
  const glowY = useSpring(useTransform(my, [0, 1], [-16, 16]), {
    stiffness: 90,
    damping: 18,
  });

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduced) return;
      const r = e.currentTarget.getBoundingClientRect();
      mx.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      my.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    },
    [mx, my, reduced],
  );
  const onLeave = useCallback(() => {
    mx.set(0.5);
    my.set(0.5);
  }, [mx, my]);

  const tiltStyle = reduced
    ? undefined
    : { rotateX, rotateY, transformStyle: "preserve-3d" as const };

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="sticky top-0 hidden h-dvh w-80 shrink-0 items-center justify-center lg:flex"
      style={reduced ? undefined : { perspective: 900 }}
      aria-hidden
    >
      <motion.div style={tiltStyle} className="relative">
        <motion.div
          style={reduced ? undefined : { x: glowX, y: glowY }}
          className="absolute inset-0 -z-10 scale-125 rounded-full bg-terra/20 blur-3xl"
        />
        {/* Pop kecil tiap ganti status; lompat gembira sekali saat selesai. */}
        <motion.div
          key={status}
          initial={reduced ? undefined : { scale: 0.93, y: status === "done" ? 10 : 0 }}
          animate={reduced ? undefined : { scale: 1, y: status === "done" ? [10, -12, 0] : 0 }}
          transition={
            reduced
              ? undefined
              : status === "done"
                ? { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
                : { duration: 0.22, ease: "easeOut" }
          }
        >
          {/* Napas mengambang — satu-satunya loop gerak badan. */}
          <motion.div
            animate={reduced ? undefined : { y: [0, -7, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            className="size-40"
          >
            <AkunioAvatar status={status} />
          </motion.div>
        </motion.div>
        {/* Serpih ledger melayang — warna produk, gerak pelan tanpa henti. */}
        {!reduced && (
          <>
            <motion.span
              aria-hidden
              className="absolute -top-2 right-8 size-2 rounded-full bg-debit"
              animate={{ y: [0, -10, 0], opacity: [0.9, 0.4, 0.9] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              aria-hidden
              className="absolute top-16 -right-3 size-1.5 rounded-full bg-terra"
              transition={{ duration: 4.1, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              animate={{ y: [0, 9, 0], opacity: [0.9, 0.4, 0.9] }}
            />
            <motion.span
              aria-hidden
              className="absolute top-10 -left-4 size-2 rounded-full border-2 border-terra/60"
              transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
              animate={{ y: [0, -8, 0], opacity: [0.8, 0.35, 0.8] }}
            />
          </>
        )}
      </motion.div>
    </div>
  );
}
