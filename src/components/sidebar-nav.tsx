"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/server/auth/auth-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const ITEMS = [
  { href: "/dasbor", label: "Dasbor" },
  { href: "/jurnal", label: "Jurnal Umum" },
  { href: "/buku-besar", label: "Buku Besar" },
  { href: "/laporan", label: "Laporan" },
  { href: "/pengaturan", label: "Pengaturan" },
];

export function SidebarNav() {
  const pathname = usePathname();

  async function keluar() {
    await authClient.signOut();
    window.location.href = "/masuk";
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col justify-between py-8 pr-6">
      <div>
        <p className="font-display text-2xl tracking-tight">Neraca</p>
        <p className="mt-1 text-xs text-ink-soft">Pembukuan ber-IFRS · SME</p>

        <nav className="mt-8 flex flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "bg-canvas font-medium text-terra"
                  : "text-ink hover:bg-canvas",
              )}
            >
              {item.label}
            </Link>
          ))}

          {/* Milestone M2: Copilot */}
          <Link
            href="/jurnal/ai"
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              pathname === "/jurnal/ai" || pathname.startsWith("/jurnal/ai/")
                ? "bg-canvas font-medium text-terra"
                : "text-ink hover:bg-canvas",
            )}
          >
            Asisten AI
          </Link>
          {/* Milestone M4 */}
          <span className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-ink-soft/50">
            Temuan <Badge variant="outline">Segera</Badge>
          </span>
        </nav>
      </div>

      <div className="flex flex-col gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={keluar} className="justify-start text-ink-soft">
          Keluar
        </Button>
      </div>
    </aside>
  );
}
