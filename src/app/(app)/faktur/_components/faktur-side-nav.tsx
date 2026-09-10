"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, Plus, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "PIUTANG", label: "Piutang", desc: "Faktur penjualan", icon: Receipt, href: "/faktur" },
  { key: "UTANG", label: "Utang", desc: "Tagihan pembelian", icon: Wallet, href: "/faktur?tab=utang" },
  { key: "AGING", label: "Analisis Umur", desc: "Aging piutang", icon: BarChart3, href: "/faktur?tab=aging" },
] as const;

type TabKey = (typeof ITEMS)[number]["key"];

function activeKey(pathname: string, tab: string | null, tipe: string | null): TabKey | null {
  if (pathname === "/faktur/baru") return tipe === "bill" ? "UTANG" : "PIUTANG";
  if (pathname === "/faktur") {
    if (tab === "utang") return "UTANG";
    if (tab === "aging") return "AGING";
    return "PIUTANG";
  }
  return null;
}

export function FakturSideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = activeKey(pathname, searchParams.get("tab"), searchParams.get("tipe"));

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-rule bg-paper lg:h-full lg:min-h-0 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="hidden items-center gap-3 border-b border-rule/70 p-4 lg:flex">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-terra/25 bg-terra/10 text-terra">
          <Receipt className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-bold text-ink">Faktur</h3>
          <p className="text-[11px] text-ink-soft">Piutang &amp; utang usaha</p>
        </div>
      </div>

      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft max-lg:hidden">
        Menu Faktur
      </div>
      <nav className="flex flex-1 flex-row gap-1 overflow-x-auto p-2 pt-0 lg:min-h-0 lg:flex-col lg:space-y-1 lg:overflow-y-auto" aria-label="Kategori faktur">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors focus-ring lg:flex-none",
                isActive
                  ? "border-terra/25 bg-terra/10 font-semibold text-terra shadow-2xs"
                  : "border-transparent text-ink-soft hover:bg-canvas hover:text-ink",
              )}
            >
              <Icon className={cn("size-4 shrink-0", isActive ? "text-terra" : "text-ink-soft")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="hidden truncate text-[11px] font-normal opacity-70 lg:block">
                  {item.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-rule/70 p-3 lg:grid-cols-1">
        <Button
          asChild
          className="h-9 bg-terra text-xs text-white hover:bg-terra/90"
        >
          <Link href="/faktur/baru?tipe=invoice">
            <Plus className="size-4" />
            Buat Faktur
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-9 border-rule text-xs text-ink hover:bg-canvas"
        >
          <Link href="/faktur/baru?tipe=bill">
            <Plus className="size-4" />
            Catat Tagihan
          </Link>
        </Button>
      </div>
    </aside>
  );
}
