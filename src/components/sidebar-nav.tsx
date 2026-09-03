"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  FileBarChart,
  LayoutDashboard,
  Library,
  MessageCircle,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { authClient } from "@/server/auth/auth-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const ITEMS = [
  { href: "/dasbor", label: "Dasbor", icon: LayoutDashboard },
  { href: "/jurnal", label: "Jurnal Umum", icon: BookOpen, match: (p: string) => p === "/jurnal" || p === "/jurnal/baru" },
  { href: "/asisten", label: "Asisten AI", icon: Sparkles },
  { href: "/buku-besar", label: "Buku Besar", icon: Library },
  { href: "/laporan", label: "Laporan", icon: FileBarChart },
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

  const isActive = (href: string, match?: (p: string) => boolean) => {
    if (match) return match(pathname);
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navContent = (isDrawer: boolean = false) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className={cn("flex items-center justify-between gap-2", !isDrawer && collapsed && "justify-center")}>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-terra text-white shadow-xs">
              <BadgeCheck className="size-4" />
            </div>
            {(isDrawer || !collapsed) && (
              <div className="min-w-0">
                <p className="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-ink">Neraca</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-soft">Pembukuan ber-IFRS · SME</p>
              </div>
            )}
          </div>
          {isDrawer && onCloseMobile && (
            <Button variant="ghost" size="icon-sm" onClick={onCloseMobile} className="text-ink-soft hover:text-ink">
              <X className="size-4" />
            </Button>
          )}
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {ITEMS.map((item) => {
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
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  !isDrawer && collapsed && "justify-center px-2",
                  active
                    ? "bg-terra/10 text-terra font-semibold border border-terra/25 shadow-2xs"
                    : "text-ink hover:bg-canvas text-ink-soft hover:text-ink border border-transparent",
                )}
              >
                <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-terra" : "text-ink-soft group-hover:text-ink")} />
                {(isDrawer || !collapsed) && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          <Link
            href="/temuan"
            onClick={() => {
              if (isDrawer && onCloseMobile) onCloseMobile();
            }}
            title={!isDrawer && collapsed ? "Temuan" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              !isDrawer && collapsed && "justify-center px-2",
              isActive("/temuan")
                ? "bg-terra/10 text-terra font-semibold border border-terra/25 shadow-2xs"
                : "text-ink hover:bg-canvas text-ink-soft hover:text-ink border border-transparent",
            )}
          >
            <Search className={cn("size-4 shrink-0 transition-colors", isActive("/temuan") ? "text-terra" : "text-ink-soft group-hover:text-ink")} />
            {(isDrawer || !collapsed) && <span className="truncate">Temuan</span>}
          </Link>
        </nav>
      </div>

      <div className={cn("flex flex-col gap-2 pt-4 border-t border-rule/60", !isDrawer && collapsed && "items-center border-t-0")}>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={keluar}
          className={cn("justify-start text-ink-soft hover:text-destructive", !isDrawer && collapsed && "size-8 justify-center p-0")}
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
          collapsed ? "w-[4.25rem] px-2" : "w-64 px-4 pr-6",
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
