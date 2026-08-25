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
} from "lucide-react";
import { authClient } from "@/server/auth/auth-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const ITEMS = [
  { href: "/dasbor", label: "Dasbor", icon: LayoutDashboard },
  { href: "/jurnal", label: "Jurnal Umum", icon: BookOpen, match: (p: string) => p === "/jurnal" || p === "/jurnal/baru" },
  { href: "/asisten", label: "Nara", icon: Sparkles },
  { href: "/buku-besar", label: "Buku Besar", icon: Library },
  { href: "/laporan", label: "Laporan", icon: FileBarChart },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings2 },
] as const;

export function SidebarNav({
  collapsed,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
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

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col justify-between overflow-hidden border-r border-rule bg-paper py-6 transition-all duration-[240ms]",
        collapsed ? "w-[4.25rem] px-2" : "w-64 px-4 pr-6",
      )}
      style={{ transitionTimingFunction: "var(--ease-out-soft, cubic-bezier(0.22,1,0.36,1))" }}
    >
      <div>
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-terra text-paper">
            <BadgeCheck className="size-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-[1.35rem] font-semibold leading-none tracking-tight">Neraca</p>
              <p className="text-[10px] uppercase tracking-widest text-ink-soft">Pembukuan ber-IFRS · SME</p>
            </div>
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
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  collapsed && "justify-center px-2",
                  active ? "bg-canvas font-medium text-terra" : "text-ink hover:bg-canvas",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-terra" : "text-ink-soft group-hover:text-ink")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {active && !collapsed && <span className="ml-auto h-5 w-0.5 rounded-full bg-terra" aria-hidden />}
              </Link>
            );
          })}

          {/* Draft AI quick link when on Jurnal AI drafts? keep as item above handles it — this is for Temuan */}
          <Link
            href="/temuan"
            title={collapsed ? "Temuan" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-2",
              isActive("/temuan") ? "bg-canvas font-medium text-terra" : "text-ink hover:bg-canvas",
            )}
          >
            <Search className={cn("size-4 shrink-0", isActive("/temuan") ? "text-terra" : "text-ink-soft group-hover:text-ink")} />
            {!collapsed && <span className="truncate">Temuan</span>}
            {isActive("/temuan") && !collapsed && <span className="ml-auto h-5 w-0.5 rounded-full bg-terra" aria-hidden />}
          </Link>
        </nav>
      </div>

      <div className={cn("flex flex-col gap-1", collapsed && "items-center")}>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={keluar}
          className={cn("justify-start text-ink-soft", collapsed && "size-8 justify-center p-0")}
          title={collapsed ? "Keluar" : undefined}
        >
          <span className={collapsed ? "" : "truncate"}>{collapsed ? "⎋" : "Keluar"}</span>
        </Button>
      </div>
    </aside>
  );
}
