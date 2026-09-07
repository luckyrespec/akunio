"use client";

import { useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export type StageStatus = "idle" | "typing" | "done";

const STATUS_TEXT: Record<StageStatus, string> = {
  idle: "Akunio siap membantu",
  typing: "Akunio mengetik…",
  done: "Berhasil disiapkan!",
};

/** Panel kanan onboarding: medallion Akunio dengan tilt 3D mengikuti mouse. */
export function AkunioStage({
  status,
  stepLabel,
}: {
  status: StageStatus;
  stepLabel: string | null;
}) {
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
      <div className="flex flex-col items-center gap-5">
        <motion.div style={tiltStyle} className="relative">
          <motion.div
            style={reduced ? undefined : { x: glowX, y: glowY }}
            className="absolute inset-0 -z-10 scale-125 rounded-full bg-terra/20 blur-3xl"
          />
          <motion.img
            src="/brand/akunio-logo-mark.svg"
            alt=""
            draggable={false}
            animate={reduced ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="size-32 drop-shadow-xl select-none"
          />
          <motion.span
            animate={reduced ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            className="absolute -left-16 top-6 rounded-full border border-rule bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink shadow-xs"
          >
            Seimbang ✓
          </motion.span>
          <motion.span
            animate={reduced ? undefined : { y: [0, 7, 0] }}
            transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
            className="absolute -right-14 bottom-8 rounded-full border border-rule bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink shadow-xs"
          >
            SAK EMKM
          </motion.span>
        </motion.div>

        <div className="flex items-center gap-2 rounded-full border border-rule bg-paper px-3.5 py-1.5 shadow-xs">
          <span className="relative flex size-2">
            {!reduced && (
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  status === "done" ? "bg-emerald-500" : "bg-terra"
                }`}
              />
            )}
            <span
              className={`relative inline-flex size-2 rounded-full ${
                status === "done" ? "bg-emerald-500" : "bg-terra"
              }`}
            />
          </span>
          <span className="text-xs font-medium text-ink">{STATUS_TEXT[status]}</span>
        </div>
        {stepLabel && (
          <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
            {stepLabel}
          </span>
        )}
      </div>
    </div>
  );
}
