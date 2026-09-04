"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const PILL_TRANSITION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] as const };

export function JournalTabs({ tab }: { tab: "manual" | "draft" }) {
  return (
    <div className="flex items-center rounded-lg border border-rule bg-paper p-1 shadow-xs">
      <Link
        href="/jurnal"
        className={cn(
          "relative rounded-md px-3.5 py-1.5 text-xs font-medium transition-[color,background-color,box-shadow]",
          tab === "manual"
            ? "text-terra font-semibold"
            : "text-ink-soft hover:text-ink hover:bg-canvas/50",
        )}
      >
        {tab === "manual" && (
          <motion.span
            layoutId="jurnal-tab-pill"
            transition={PILL_TRANSITION}
            className="absolute inset-0 rounded-md bg-canvas shadow-xs"
          />
        )}
        <span className="relative z-10">Entri Manual</span>
      </Link>
      <Link
        href="/jurnal?tab=draft"
        className={cn(
          "relative rounded-md px-3.5 py-1.5 text-xs font-medium transition-[color,background-color,box-shadow]",
          tab === "draft"
            ? "text-terra font-semibold"
            : "text-ink-soft hover:text-ink hover:bg-canvas/50",
        )}
      >
        {tab === "draft" && (
          <motion.span
            layoutId="jurnal-tab-pill"
            transition={PILL_TRANSITION}
            className="absolute inset-0 rounded-md bg-canvas shadow-xs"
          />
        )}
        <span className="relative z-10">Draft AI</span>
      </Link>
    </div>
  );
}
