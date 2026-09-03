"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  FileBarChart,
  LayoutDashboard,
  Library,
  Search,
  Settings2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { authClient } from "@/server/auth/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const STANDARD_ITEMS = [
  { href: "/dasbor", label: "Dasbor", icon: LayoutDashboard },
  { href: "/jurnal", label: "Jurnal Umum", icon: BookOpen, match: (p: string) => p === "/jurnal" || p === "/jurnal/baru" },
  { href: "/buku-besar", label: "Buku Besar", icon: Library },
  { href: "/laporan", label: "Laporan Keuangan", icon: FileBarChart },
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

  async function keluar() {
    await authClient.signOut();
    window.location.href = "/masuk";
  }

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
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-terra text-white shadow-xs">
              <BadgeCheck className="size-4" />
            </div>
            {(isDrawer || !collapsed) && (
              <div className="min-w-0">
                <p className="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-ink">Neraca</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-soft mt-0.5">SaaS Akuntansi SME</p>
              </div>
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
            title={!isDrawer && collapsed ? "Asisten AI Nara" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-2xl transition-all duration-200 overflow-hidden",
              !isDrawer && collapsed
                ? "justify-center p-2.5 border"
                : "p-3 border",
              isAsistenActive
                ? "bg-gradient-to-br from-terra/15 via-terra/10 to-amber-500/10 border-terra/50 shadow-sm ring-1 ring-terra/30"
                : "bg-gradient-to-br from-canvas/80 via-paper to-canvas border-rule hover:border-terra/40 hover:bg-canvas shadow-2xs hover:shadow-xs",
            )}
          >
            {/* Soft Ambient Light on Active */}
            {isAsistenActive && (
              <div className="absolute -right-6 -top-6 size-20 rounded-full bg-terra/15 blur-xl pointer-events-none" />
            )}

            {/* Glowing Icon Container */}
            <div
              className={cn(
                "relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300",
                isAsistenActive
                  ? "bg-terra text-white shadow-xs shadow-terra/30"
                  : "bg-canvas border border-rule group-hover:border-terra/40 group-hover:bg-terra/10 text-terra",
              )}
            >
              <Sparkles className={cn("size-4 transition-transform group-hover:scale-110", isAsistenActive && "animate-pulse")} />
              {/* Online pulse dot */}
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-paper" />
            </div>

            {/* Label and Value Proposition */}
            {(isDrawer || !collapsed) && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display text-xs font-semibold text-ink tracking-tight flex items-center gap-1.5">
                    <span>Asisten AI</span>
                    <span className="inline-flex items-center rounded-md bg-terra/15 px-1.5 py-0.2 text-[9px] font-bold text-terra uppercase tracking-wider">
                      Copilot
                    </span>
                  </span>
                </div>
                <p className="text-[10px] text-ink-soft leading-tight mt-0.5 truncate group-hover:text-ink transition-colors">
                  Catat transaksi & tanya laporan
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Section Divider & Label */}
        {(isDrawer || !collapsed) && (
          <div className="px-1 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft/70">
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
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
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

      {/* Footer Nav Controls */}
      <div className={cn("flex flex-col gap-2 pt-4 border-t border-rule/60", !isDrawer && collapsed && "items-center border-t-0")}>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={keluar}
          className={cn("justify-start text-ink-soft hover:text-destructive text-xs h-8", !isDrawer && collapsed && "size-8 justify-center p-0")}
          title={!isDrawer && collapsed ? "Keluar" : undefined}
        >
          <span className={!isDrawer && collapsed ? "" : "truncate"}>{!isDrawer && collapsed ? "⎋" : "Keluar dari Sesi"}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (lg and above) */}
      <aside
        className={cn(
          "hidden lg:flex shrink-0 flex-col justify-between overflow-hidden border-r border-rule bg-paper py-6 transition-[width,padding] duration-[240ms]",
          collapsed ? "w-[4.25rem] px-2.5" : "w-64 px-4 pr-5",
        )}
        style={{ transitionTimingFunction: "var(--ease-out-soft, cubic-bezier(0.22,1,0.36,1))" }}
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
