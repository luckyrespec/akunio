"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  IconDashboard,
  IconReceipt,
  IconInventory,
  IconReconciliation,
  IconContacts,
  IconJournal,
  IconLedger,
  IconAssets,
  IconReports,
  IconClosing,
  IconDoctor,
  IconBookOpen,
  IconTax,
  IconSettings,
  IconClose,
  IconBolt,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavUser } from "@/components/nav-user";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AkunioMark } from "@/components/brand/akunio-logo";

type NavChild = {
  href: string;
  label: string;
  desc: string;
};

type NavItem = {
  href: string;
  label: string;
  desc: string;
  icon: typeof IconDashboard;
  match?: (p: string) => boolean;
  children?: NavChild[];
};

type NavGroup = {
  id: string;
  title: string;
  items: NavItem[];
};

const NAVIGATION_GROUPS: NavGroup[] = [
  {
    id: "operasional",
    title: "Operasional",
    items: [
      { href: "/kasir", label: "Kasir", desc: "Kasir cepat untuk toko & warung", icon: IconBolt },
      { href: "/faktur", label: "Faktur & Tagihan", desc: "Buat, kirim, dan pantau piutang–utang usaha", icon: IconReceipt },
      {
        href: "/persediaan/daftar",
        label: "Persediaan & Stok",
        desc: "Kelola barang, jasa, dan stok opname",
        icon: IconInventory,
        match: (p: string) => p.startsWith("/persediaan"),
        children: [
          { href: "/persediaan/daftar", label: "Daftar Barang", desc: "Katalog barang dagang dan stoknya" },
          { href: "/persediaan/jasa", label: "Jasa & Layanan", desc: "Katalog jasa tanpa stok" },
          { href: "/persediaan/opname", label: "Stok Opname", desc: "Hitung fisik dan selisihkan stok" },
        ],
      },
      {
        href: "/kas-bank/pembayaran",
        label: "Kas & Bank",
        desc: "Catat kas masuk, keluar, dan transfer",
        icon: IconReconciliation,
        match: (p: string) => p.startsWith("/kas-bank") || p.startsWith("/rekonsiliasi"),
        children: [
          { href: "/kas-bank/pembayaran", label: "Pembayaran", desc: "Catat uang keluar kas/bank" },
          { href: "/kas-bank/penerimaan", label: "Penerimaan", desc: "Catat uang masuk kas/bank" },
          { href: "/kas-bank/transfer", label: "Transfer Bank", desc: "Pindahkan dana antar rekening" },
          { href: "/kas-bank/histori", label: "Histori Bank", desc: "Riwayat semua mutasi kas/bank" },
          { href: "/kas-bank/rekonsiliasi", label: "Rekonsiliasi Bank", desc: "Cocokkan buku dengan mutasi bank" },
        ],
      },
      { href: "/kontak", label: "Kontak", desc: "Pelanggan, pemasok, dan info pembayarannya", icon: IconContacts },
    ],
  },
  {
    id: "akuntansi",
    title: "Akuntansi",
    items: [
      { href: "/jurnal", label: "Jurnal Umum", desc: "Catat transaksi debit–kredit manual", icon: IconJournal, match: (p: string) => p === "/jurnal" || p === "/jurnal/baru" },
      { href: "/buku-besar", label: "Buku Besar", desc: "Mutasi dan saldo tiap akun", icon: IconLedger },
      { href: "/buku-pembantu", label: "Buku Pembantu", desc: "Rincian piutang, utang, dan persediaan vs kontrol", icon: IconLedger },
      { href: "/aset", label: "Aset Tetap", desc: "Daftar aset dan penyusutannya", icon: IconAssets },
    ],
  },
  {
    id: "laporan",
    title: "Laporan & Evaluasi",
    items: [
      { href: "/laporan", label: "Laporan Keuangan", desc: "Neraca, laba rugi, arus kas, ekuitas", icon: IconReports },
      { href: "/pajak", label: "Pajak & SPT", desc: "Hitung dan catat PPh final UMKM", icon: IconTax, match: (p: string) => p.startsWith("/pajak") },
      { href: "/tutup-buku", label: "Tutup Buku", desc: "Kunci periode agar tak berubah", icon: IconClosing },
      { href: "/temuan", label: "Diagnosa & Anomali", desc: "Temuan otomatis pembukuan bermasalah", icon: IconDoctor },
      { href: "/aturan", label: "Standar SAK EMKM", desc: "Rujukan aturan akuntansi usaha", icon: IconBookOpen, match: (p: string) => p.startsWith("/aturan") },
    ],
  },
  {
    id: "lainnya",
    title: "Lainnya",
    items: [
      { href: "/pengaturan", label: "Pengaturan", desc: "Akun, periode, dan profil usaha", icon: IconSettings },
    ],
  },
];

function ParentNavItem({
  item,
  isDrawer,
  collapsed,
  isActive,
  onCloseMobile,
}: {
  item: NavItem;
  isDrawer: boolean;
  collapsed: boolean;
  isActive: (href: string, match?: (p: string) => boolean) => boolean;
  onCloseMobile?: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(item.href, item.match);
  const [expanded, setExpanded] = useState(active);
  const showText = isDrawer || !collapsed;

  if (!showText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            onClick={() => {
              if (isDrawer && onCloseMobile) onCloseMobile();
            }}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors focus-ring justify-center",
              active
                ? "bg-canvas text-terra font-semibold border border-rule shadow-2xs"
                : "text-ink-soft hover:bg-canvas/60 hover:text-ink border border-transparent"
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-terra" : "text-ink-soft group-hover:text-ink"
              )}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.desc}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring",
          active
            ? "bg-canvas text-terra font-semibold border border-rule shadow-2xs"
            : "text-ink-soft hover:bg-canvas/60 hover:text-ink border border-transparent"
        )}
      >
        <Icon
          className={cn(
            "size-4 shrink-0 transition-colors",
            active ? "text-terra" : "text-ink-soft group-hover:text-ink"
          )}
        />
        <span className="truncate flex-1 text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform motion-safe:duration-200 motion-safe:ease-[var(--ease-in-out)]",
            expanded && "rotate-180"
          )}
        />
      </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.desc}
        </TooltipContent>
      </Tooltip>
      <div
        className={cn(
          "grid transition-[grid-template-rows] motion-safe:duration-240 motion-safe:ease-[var(--ease-out)]",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!expanded}>
          <div className="ml-4 flex flex-col gap-0.5 border-l border-rule/70 pl-2">
          {(item.children ?? []).map((child) => {
            const childActive = isActive(child.href);
            return (
              <Tooltip key={child.href}>
                <TooltipTrigger asChild>
              <Link
                href={child.href}
                onClick={() => {
                  if (isDrawer && onCloseMobile) onCloseMobile();
                }}
                className={cn(
                  "truncate rounded-lg px-2.5 py-1.5 text-xs transition-colors focus-ring",
                  childActive
                    ? "bg-canvas text-terra font-semibold border border-rule shadow-2xs"
                    : "text-ink-soft hover:bg-canvas/60 hover:text-ink border border-transparent"
                )}
              >
                {child.label}
              </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {child.desc}
                </TooltipContent>
              </Tooltip>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({  collapsed,
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
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/dasbor" || pathname.startsWith("/dasbor/");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navContent = (isDrawer: boolean = false) => (
    <div className="flex h-full flex-col justify-between">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Brand Header */}
        <div className={cn("flex items-center justify-between gap-2 shrink-0", !isDrawer && collapsed && "justify-center")}>
          <div className="flex items-center gap-2.5">
            <AkunioMark className="size-8 shrink-0 shadow-xs" />
            {(isDrawer || !collapsed) && (
              <p className="font-display text-xl font-semibold leading-none tracking-tight text-ink">Akunio</p>
            )}
          </div>
          {isDrawer && onCloseMobile && (
            <Button variant="ghost" size="icon-sm" onClick={onCloseMobile} className="text-ink-soft hover:text-ink">
              <IconClose className="size-4" />
            </Button>
          )}
        </div>

        {/* HERO / FITUR UTAMA: AKUNIO AI (Tombol Utama Terpisah & Ter-highlight) */}
        <div className="mt-5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/asisten"
                onClick={() => {
                  if (isDrawer && onCloseMobile) onCloseMobile();
                }}
                className={cn(
                  "group relative flex items-center justify-between rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra/50 shadow-xs",
                  !isDrawer && collapsed
                    ? "justify-center p-2.5 text-center"
                    : "px-3.5 py-2.5",
                  isAsistenActive
                    ? "bg-terra text-paper border border-terra/90 shadow-sm"
                    : "bg-terra/15 text-terra border border-terra/30 hover:bg-terra/20 hover:border-terra/50 hover:shadow-sm",
                )}
              >
                {/* Label saat collapsed vs expanded */}
                {!isDrawer && collapsed ? (
                  <span className="text-xs font-bold tracking-tight">AI</span>
                ) : (
                  <>
                    <span className="truncate text-xs font-bold tracking-wide">
                      Asisten Akunio
                    </span>
                    <kbd
                      className={cn(
                        "hidden shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium xl:inline transition-colors",
                        isAsistenActive
                          ? "bg-paper/20 text-paper border border-paper/30"
                          : "bg-paper/90 text-terra border border-terra/30",
                      )}
                    >
                      Ctrl J
                    </kbd>
                  </>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              Asisten Akunio · Tanya &amp; Catat Transaksi
            </TooltipContent>
          </Tooltip>
        </div>

        {/* DASHBOARD (Di atas Operasional, Di bawah AI) */}
        <div className="mt-2 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard"
                onClick={() => {
                  if (isDrawer && onCloseMobile) onCloseMobile();
                }}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors focus-ring",
                  !isDrawer && collapsed && "justify-center px-2 py-2",
                  isActive("/dashboard")
                    ? "bg-canvas text-terra font-semibold border border-rule shadow-2xs"
                    : "text-ink-soft hover:bg-canvas/60 hover:text-ink border border-transparent",
                )}
              >
                <IconDashboard
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive("/dashboard") ? "text-terra" : "text-ink-soft group-hover:text-ink",
                  )}
                />
                {(isDrawer || !collapsed) && <span className="truncate">Dashboard</span>}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              Ringkasan kas, laba, dan yang perlu perhatian
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Separator antara Fitur Atas dan Menu Navigasi Operasional */}
        <div className="mt-3 mb-2 border-b border-rule/70 shrink-0" />

        {/* Grouped Navigation List dengan scrollbar halus */}
        <nav
          className={cn(
            "flex-1 min-h-0 overflow-y-auto pr-0.5 -mr-0.5 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            !isDrawer && collapsed && "space-y-3",
          )}
        >
          {NAVIGATION_GROUPS.map((group, groupIdx) => (
            <div key={group.id} className={cn("flex flex-col gap-1", !isDrawer && collapsed && groupIdx > 0 && "pt-2 border-t border-rule/50")}>
              {/* Header Label Grup */}
              {(isDrawer || !collapsed) && (
                <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft/70">
                  {group.title}
                </div>
              )}

              {/* Item-item Navigasi */}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  if (item.children) {
                    return (
                      <ParentNavItem
                        key={item.href}
                        item={item}
                        isDrawer={isDrawer}
                        collapsed={!isDrawer && !!collapsed}
                        isActive={isActive}
                        onCloseMobile={onCloseMobile}
                      />
                    );
                  }
                  const Icon = item.icon;
                  const active = isActive(item.href, item.match);
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          onClick={() => {
                            if (isDrawer && onCloseMobile) onCloseMobile();
                          }}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring",
                            !isDrawer && collapsed && "justify-center px-2 py-2",
                            active
                              ? "bg-canvas text-terra font-semibold border border-rule shadow-2xs"
                              : "text-ink-soft hover:bg-canvas/60 hover:text-ink border border-transparent",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0 transition-colors",
                              active ? "text-terra" : "text-ink-soft group-hover:text-ink",
                            )}
                          />
                          {(isDrawer || !collapsed) && <span className="truncate">{item.label}</span>}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {item.desc}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
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
