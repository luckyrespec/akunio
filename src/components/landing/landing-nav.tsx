"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { AkunioLogoLockup } from "@/components/brand/akunio-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#masalah", label: "Masalah" },
  { href: "#solusi", label: "Solusi" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#naik-kelas", label: "Naik kelas" },
  { href: "#faq", label: "FAQ" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-200",
        scrolled ? "border-b border-rule bg-paper/90 backdrop-blur-md" : "border-b border-transparent bg-transparent",
      )}
    >
      <nav aria-label="Navigasi utama" className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Akunio — beranda">
          <AkunioLogoLockup markClassName="size-8" showTagline={false} />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="focus-ring rounded-lg px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/masuk"
            className="focus-ring rounded-lg px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
          >
            Masuk
          </Link>
          <Link
            href="/daftar"
            className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-xs transition-all hover:bg-ink/80 active:translate-y-px"
          >
            Mulai pembukuan Anda
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? "Tutup menu" : "Buka menu"}
          className="focus-ring grid size-11 place-items-center rounded-lg text-ink md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open && (
        <div id="landing-menu" className="border-t border-rule bg-paper px-4 pt-2 pb-5 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-sm font-medium text-ink hover:bg-ink/5"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-3 grid gap-2">
            <Link
              href="/masuk"
              onClick={() => setOpen(false)}
              className="focus-ring rounded-lg border border-rule px-4 py-3 text-center text-sm font-semibold text-ink"
            >
              Masuk
            </Link>
            <Link
              href="/daftar"
              onClick={() => setOpen(false)}
              className="focus-ring rounded-lg bg-ink px-4 py-3 text-center text-sm font-semibold text-paper"
            >
              Mulai pembukuan Anda
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
