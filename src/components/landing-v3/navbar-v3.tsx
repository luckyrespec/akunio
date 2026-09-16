"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight, ChevronDown, PenLine, Newspaper } from "lucide-react";
import { AkunioLogoLockupV3 } from "@/components/brand/akunio-logo-v3";
import { Button } from "@/components/ui/button";

export function NavbarV3({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!dropOpen) return;
    const handlePointer = (e: PointerEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dropOpen]);

  const navLinks = [
    { href: "#naik-kelas", label: "Naik Kelas" },
    { href: "#harga", label: "Harga" },
  ];

  // Siapkan rute /blog & /news — tautan aktif setelah halamannya dibuat.
  const contentLinks = [
    { icon: PenLine, label: "Blog", desc: "Tips pembukuan usaha" },
    { icon: Newspaper, label: "News", desc: "Kabar terbaru Akunio" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? "border-b border-rule/80 bg-paper/90 backdrop-blur-md shadow-xs py-3"
          : "bg-canvas/60 backdrop-blur-xs py-4"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="focus-ring rounded-lg">
          <AkunioLogoLockupV3 />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-soft">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-ink hover:underline decoration-terra underline-offset-4"
            >
              {link.label}
            </a>
          ))}
          <div ref={dropRef} className="relative">
            <button
              type="button"
              onClick={() => setDropOpen((v) => !v)}
              aria-expanded={dropOpen}
              aria-haspopup="menu"
              className="focus-ring flex items-center gap-1 rounded-md transition-colors hover:text-ink"
            >
              Blog &amp; News
              <ChevronDown
                className={`size-3.5 transition-transform duration-200 ${dropOpen ? "rotate-180" : ""}`}
              />
            </button>
            {dropOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-rule bg-paper p-1.5 shadow-md"
              >
                {contentLinks.map((item) => (
                  <div
                    key={item.label}
                    role="menuitem"
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                  >
                    <item.icon className="mt-0.5 size-4 shrink-0 text-terra" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {item.label}
                        </span>
                        <span className="rounded-md bg-terra/10 px-1.5 py-px text-[11px] font-bold uppercase tracking-wider text-terra">
                          Segera
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* CTA Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          {isLoggedIn ? (
            <Button asChild size="sm" className="bg-ink hover:bg-ink/85 text-paper">
              <Link href="/dashboard" className="flex items-center gap-1.5">
                <span>Buka Dashboard</span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-ink hover:bg-paper">
                <Link href="/masuk">Masuk</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-terra hover:brightness-110 text-white shadow-xs font-semibold"
              >
                <Link href="/daftar" className="flex items-center gap-1.5">
                  <span>Mulai Gratis</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Hamburger Trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden rounded-lg p-2 text-ink hover:bg-paper focus-ring"
          aria-label="Toggle Navigation Menu"
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile Drawer Dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-b border-rule bg-paper px-4 pt-3 pb-6 shadow-md animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col gap-1 text-sm font-medium text-ink">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2 hover:bg-canvas transition-colors"
              >
                {link.label}
              </a>
            ))}
            <p className="px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
              Blog &amp; News
            </p>
            {contentLinks.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 pl-4"
              >
                <item.icon className="size-4 shrink-0 text-terra" />
                <span className="text-sm font-medium text-ink-soft">
                  {item.label}
                </span>
                <span className="rounded-md bg-terra/10 px-1.5 py-px text-[11px] font-bold uppercase tracking-wider text-terra">
                  Segera
                </span>
              </div>
            ))}
            <div className="mt-4 pt-4 border-t border-rule flex flex-col gap-2">
              {isLoggedIn ? (
                <Button asChild className="w-full bg-ink text-paper">
                  <Link href="/dashboard">Buka Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="w-full justify-center">
                    <Link href="/masuk">Masuk ke Akun</Link>
                  </Button>
                  <Button asChild className="w-full bg-terra text-white hover:brightness-110 justify-center">
                    <Link href="/daftar">Mulai Gratis Sekarang</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
