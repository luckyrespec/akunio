"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";

const LABELS: Record<string, string> = {
  dasbor: "Dasbor",
  jurnal: "Jurnal",
  ai: "Asisten AI",
  baru: "Tulis Jurnal",
  "buku-besar": "Buku Besar",
  laporan: "Laporan",
  "laba-rugi": "Laba Rugi",
  neraca: "Neraca",
  "arus-kas": "Arus Kas",
  "perubahan-ekuitas": "Perubahan Ekuitas",
  pengaturan: "Pengaturan",
};

function breadcrumb(pathname: string) {
  const segs = pathname.split("/").filter(Boolean);
  return segs.map((s) => LABELS[s] ?? s).join(" / ");
}

export function Topbar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const crumb = breadcrumb(pathname);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-paper/80 px-4 backdrop-blur-sm lg:px-6">
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={onToggleSidebar} aria-label="Toggle sidebar">
            <PanelLeft className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden shrink-0 lg:inline-flex"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>

        <p className="hidden truncate text-xs font-medium uppercase tracking-widest text-ink-soft sm:block">{crumb}</p>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className="hidden items-center gap-2 rounded-full border border-rule bg-canvas px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-paper sm:flex"
            aria-label="Buka pencarian"
          >
            <Search className="size-3.5" />
            <span className="hidden lg:inline">Cari jurnal, akun…</span>
            <span className="ml-1 hidden rounded bg-paper px-1.5 py-0.5 text-[10px] leading-none lg:inline">⌘K</span>
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex size-8 items-center justify-center rounded-full border border-rule bg-canvas text-ink-soft sm:hidden"
            aria-label="Cari"
          >
            <Search className="size-4" />
          </button>
        </div>
      </header>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
