"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Sticky CTA mobile: hanya muncul setelah CTA hero terlewat layar,
// agar tidak menutupi panggung ilustrasi di viewport pertama.
export function StickyCta() {
  // Selalu hidden pada render awal (server + klien sama → tanpa mismatch
  // hidrasi); IntersectionObserver mengoreksi begitu jalan. Tanpa JS,
  // bar tetap tersembunyi tetapi semua CTA ada di konten halaman.
  const [pastHero, setPastHero] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = document.getElementById("hero-cta");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!pastHero}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 p-3 backdrop-blur-md md:hidden",
        !reduce && "transition-transform duration-300",
        !pastHero && "translate-y-full border-transparent",
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <Link
        href="/daftar"
        tabIndex={pastHero ? 0 : -1}
        className="focus-ring flex h-12 items-center justify-center gap-2 rounded-lg bg-ink text-sm font-semibold text-paper active:translate-y-px"
      >
        Mulai pembukuan Anda
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
