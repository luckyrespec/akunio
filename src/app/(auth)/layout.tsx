"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { Spotlight } from "@/components/aceternity/spotlight";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Layout bersama /masuk + /daftar: panel kiri (merek + demo) mount sekali
// sehingga tidak me-reset saat navigasi. Hanya scene demo yang berganti
// (crossfade di AuthBrandPanel) dan form kanan yang slide masuk.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = pathname === "/daftar" ? ("daftar" as const) : ("masuk" as const);
  const reduce = useReducedMotion();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.4fr_1fr]">
      <div className="relative hidden overflow-y-auto bg-ink text-paper lg:block">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 beams-pan">
            <BackgroundBeams />
          </div>
          <Spotlight className="-top-32 auth-drift" />
          <div className="absolute top-1/3 -right-28 size-[420px] rounded-full bg-terra opacity-25 blur-3xl orb-drift" />
        </div>
        <AuthBrandPanel mode={mode} />
      </div>
      <div className="relative grid place-items-center overflow-hidden bg-paper px-(--gutter) py-10 lg:border-l lg:border-rule">
        {reduce ? (
          <div className="w-full max-w-md">{children}</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="w-full max-w-md"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
