"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  FileBarChart,
  LayoutDashboard,
  Library,
  Receipt,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavUser } from "@/components/nav-user";

/**
 * AkunioMark — huruf "A" ledger: dua kaki diagonal + mistar ganda
 * (motif rule-double pembukuan) dalam satu bahasa goresan round-cap.
 * Warna memakai token agar ikut mode Lilin.
 */
function AkunioMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="var(--color-terra)" />
      <g stroke="var(--color-paper)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M16 7.5 9.2 24" />
        <path d="M16 7.5 22.8 24" />
        <path d="M11.9 17.6h8.2" strokeWidth="2" />
        <path d="M11 20.4h10" strokeWidth="2" />
      </g>
    </svg>
  );
}

const STANDARD_ITEMS = [
  { href: "/dasbor", label: "Dasbor", icon: LayoutDashboard },
  { href: "/faktur", label: "Faktur & Tagihan", icon: Receipt },
  { href: "/persediaan", label: "Persediaan & Stok", icon: Boxes, match: (p: string) => p.startsWith("/persediaan") },
  { href: "/rekonsiliasi", label: "Rekonsiliasi Bank", icon: ArrowLeftRight },
  { href: "/aset", label: "Aset Tetap", icon: Building2 },
  { href: "/kontak", label: "Kontak", icon: Users },
  { href: "/jurnal", label: "Jurnal Umum", icon: BookOpen, match: (p: string) => p === "/jurnal" || p === "/jurnal/baru" },
  { href: "/buku-besar", label: "Buku Besar", icon: Library },
  { href: "/laporan", label: "Laporan Keuangan", icon: FileBarChart },
  { href: "/tutup-buku", label: "Tutup Buku", icon: CalendarCheck },
  { href: "/temuan", label: "Diagnosa & Anomali", icon: Search },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings2 },
] as const;

export function SidebarNav({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();

  const isAsistenActive = pathname.startsWith("/asisten");

  const isActive = (href: string, match?: (p: string) => boolean) => {
    if (match) return match(pathname);
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navContent = (isDrawer: boolean = false) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Brand Header */}
        <div className={cn("flex items-center justify-between gap-2", !isDrawer && collapsed && "justify-center")}>
          <div className="flex items-center gap-2.5">
            <AkunioMark className="size-8 shrink-0 shadow-xs" />
            {(isDrawer || !collapsed) && (
              <p className="font-display text-xl font-semibold leading-none tracking-tight text-ink">Akunio</p>
            )}
          </div>
          {isDrawer && onCloseMobile && (
            <Button variant="ghost" size="icon-sm" onClick={onCloseMobile} className="text-ink-soft hover:text-ink">
              <X className="size-4" />
            </Button>
          )}
        </div>

        {/* HERO / PREMIUM ASISTEN AI CARD */}
        <div className="mt-6">
          <Link
            href="/asisten"
            onClick={() => {
              if (isDrawer && onCloseMobile) onCloseMobile();
            }}
            title={!isDrawer && collapsed ? "Akunio AI" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-2xl transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra/50",
              !isDrawer && collapsed
                ? "justify-center p-2 border"
                : "p-2.5 border",
              isAsistenActive
                ? "bg-terra/[0.12] border-terra/60 shadow-xs ring-1 ring-terra/40"
                : "border-terra/30 bg-terra/[0.06] hover:border-terra/50 hover:bg-terra/[0.1] shadow-2xs hover:shadow-xs",
            )}
          >

            {/* Brand mark — motif milik produk, bukan ikon AI generik */}
            <AkunioMark className="size-9 shrink-0 shadow-2xs transition-transform duration-300 [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-105" />

            {/* Label satu baris + petunjuk shortcut */}
            {(isDrawer || !collapsed) && (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-xs font-semibold text-ink tracking-tight">
                  Akunio AI
                </span>
                <kbd className="ml-auto hidden shrink-0 rounded border border-rule/70 bg-paper/80 px-1.5 py-0.5 font-mono text-[11px] font-normal text-ink-soft xl:inline">
                  Ctrl J
                </kbd>
              </span>
            )}
          </Link>
        </div>

        {/* Section Divider & Label */}
        {(isDrawer || !collapsed) && (
          <div className="px-1 pt-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft/70">
            Menu Pembukuan
          </div>
        )}

        {/* Standard Accounting Navigation */}
        <nav className={cn("flex flex-col gap-1", !isDrawer && collapsed && "mt-4")}>
          {STANDARD_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, (item as { match?: (p: string) => boolean }).match);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (isDrawer && onCloseMobile) onCloseMobile();
                }}
                title={!isDrawer && collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors focus-ring",
                  !isDrawer && collapsed && "justify-center px-2 py-2.5",
                  active
                    ? "bg-canvas text-terra font-semibold border border-rule shadow-2xs"
                    : "text-ink-soft hover:bg-canvas/60 hover:text-ink border border-transparent",
                )}
              >
                <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-terra" : "text-ink-soft group-hover:text-ink")} />
                {(isDrawer || !collapsed) && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer: menu pengguna */}
      <div className={cn("flex flex-col gap-2 border-t border-rule/60 pt-3", !isDrawer && collapsed && "items-center border-t-0")}>
        <NavUser collapsed={!isDrawer && collapsed} align={isDrawer ? "start" : "end"} />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (lg and above) */}
      <aside
        className={cn(
          "hidden lg:flex shrink-0 flex-col justify-between overflow-hidden border-r border-rule bg-paper py-6 h-screen sticky top-0 motion-safe:transition-[width,padding] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "w-[4.25rem] px-2.5" : "w-64 px-4 pr-5",
        )}
      >
        {navContent(false)}
      </aside>

      {/* Mobile Drawer (below lg) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-rule bg-paper p-5 shadow-xl transition-transform duration-300">
            {navContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
