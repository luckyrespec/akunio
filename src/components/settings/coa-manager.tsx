"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Coins,
  CreditCard,
  Scale,
  TrendingUp,
  TrendingDown,
  Search,
  FolderTree,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CreateAccountDialog } from "@/components/settings/create-account-dialog";
import { AccountRowMenu } from "@/components/settings/account-row-menu";
import { cn } from "@/lib/utils";

export interface AccountItem {
  id: string;
  code: string;
  name: string;
  type: "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";
  normal: string;
  parentCode: string | null;
  isCash: boolean;
  isBank: boolean;
  contra: boolean;
  archivedAt: Date | null;
}

interface CoaManagerProps {
  accounts: AccountItem[];
  userRole?: string;
}

const TYPE_META = {
  ASET: {
    label: "Aset",
    icon: Coins,
    color: "text-emerald-600 dark:text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    badgeBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  LIABILITAS: {
    label: "Liabilitas",
    icon: CreditCard,
    color: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-500/10 border-amber-500/30",
    badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  EKUITAS: {
    label: "Ekuitas",
    icon: Scale,
    color: "text-purple-600 dark:text-purple-300",
    bg: "bg-purple-500/10 border-purple-500/30",
    badgeBg: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  PENDAPATAN: {
    label: "Pendapatan",
    icon: TrendingUp,
    color: "text-sky-600 dark:text-sky-300",
    bg: "bg-sky-500/10 border-sky-500/30",
    badgeBg: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  BEBAN: {
    label: "Beban",
    icon: TrendingDown,
    color: "text-rose-600 dark:text-rose-300",
    bg: "bg-rose-500/10 border-rose-500/30",
    badgeBg: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
} as const;

export function CoaManager({ accounts, userRole }: CoaManagerProps) {
  const [search, setSearch] = React.useState("");
  const [selectedType, setSelectedType] = React.useState<string>("ALL");
  const [collapsedCodes, setCollapsedCodes] = React.useState<Set<string>>(new Set());

  // Build hierarchy and calculate leveling
  const { leveledAccounts, parentMap, childrenMap } = React.useMemo(() => {
    const pMap = new Map<string, AccountItem>();
    const cMap = new Map<string, string[]>();

    for (const a of accounts) {
      pMap.set(a.code, a);
      if (a.parentCode) {
        const list = cMap.get(a.parentCode) || [];
        list.push(a.code);
        cMap.set(a.parentCode, list);
      }
    }

    const leveled = accounts.map((a) => {
      let level = 1;
      let cur = a.parentCode;
      while (cur && pMap.has(cur)) {
        level += 1;
        cur = pMap.get(cur)?.parentCode ?? null;
      }

      const hasChildren = (cMap.get(a.code)?.length ?? 0) > 0;
      const isHeader = hasChildren || level === 1;

      return {
        ...a,
        level,
        hasChildren,
        isHeader,
        childrenCount: cMap.get(a.code)?.length ?? 0,
      };
    });

    return {
      leveledAccounts: leveled,
      parentMap: pMap,
      childrenMap: cMap,
    };
  }, [accounts]);

  const toggleCollapse = React.useCallback((code: string) => {
    setCollapsedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const expandAll = React.useCallback(() => {
    setCollapsedCodes(new Set());
  }, []);

  const collapseAll = React.useCallback(() => {
    const allHeaders = new Set<string>();
    for (const a of leveledAccounts) {
      if (a.hasChildren) allHeaders.add(a.code);
    }
    setCollapsedCodes(allHeaders);
  }, [leveledAccounts]);

  // Filter accounts taking tree visibility & search into account
  const visibleAccounts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const isSearching = Boolean(q);

    return leveledAccounts.filter((a) => {
      const matchType = selectedType === "ALL" || a.type === selectedType;
      if (!matchType) return false;

      if (isSearching) {
        const matchQuery =
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.parentCode && a.parentCode.toLowerCase().includes(q));
        return matchQuery;
      }

      // If not searching, check if any ancestor is collapsed
      let cur = a.parentCode;
      while (cur) {
        if (collapsedCodes.has(cur)) {
          return false;
        }
        cur = parentMap.get(cur)?.parentCode ?? null;
      }

      return true;
    });
  }, [leveledAccounts, selectedType, search, collapsedCodes, parentMap]);

  const canEdit = userRole !== "VIEWER";

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Bagan Akun (Chart of Accounts)</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Hierarki akun bertingkat dengan struktur pohon collapsible untuk mempermudah navigasi akun induk dan sub-akun.
          </p>
        </div>

        {/* Actions: Expand/Collapse All + Create Account */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 rounded-xl border border-rule bg-canvas/60 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={expandAll}
              className="rounded-lg px-2.5 py-1 text-ink-soft hover:text-ink hover:bg-paper transition-colors font-medium"
            >
              Buka Semua
            </button>
            <span className="text-rule">•</span>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-lg px-2.5 py-1 text-ink-soft hover:text-ink hover:bg-paper transition-colors font-medium"
            >
              Tutup Semua
            </button>
          </div>

          {canEdit && (
            <CreateAccountDialog existingAccounts={accounts} />
          )}
        </div>
      </div>

      {/* Filter Tabs & Search Bar with Animated Indicator */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 rounded-2xl border border-rule bg-paper p-2.5 shadow-2xs">
        {/* Category Pill Filters with motion layoutId */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedType("ALL")}
            className={cn(
              "relative h-7.5 rounded-xl px-3 text-xs font-medium transition-colors shrink-0",
              selectedType === "ALL" ? "text-paper font-semibold" : "text-ink-soft hover:text-ink hover:bg-canvas/50"
            )}
          >
            {selectedType === "ALL" && (
              <motion.div
                layoutId="coa-active-tab-pill"
                className="absolute inset-0 rounded-xl bg-ink shadow-2xs"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10">Semua</span>
          </button>

          {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            const isSelected = selectedType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={cn(
                  "relative flex items-center gap-1.5 h-7.5 rounded-xl px-3 text-xs font-medium transition-colors shrink-0",
                  isSelected ? "text-paper font-semibold" : "text-ink-soft hover:text-ink hover:bg-canvas/50"
                )}
              >
                {isSelected && (
                  <motion.div
                    layoutId="coa-active-tab-pill"
                    className="absolute inset-0 rounded-xl bg-ink shadow-2xs"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                <Icon className={cn("size-3.5 relative z-10 transition-colors", isSelected ? "text-paper" : meta.color)} />
                <span className="relative z-10">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2 size-3.5 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode atau nama akun..."
            className="h-7.5 w-full rounded-xl border border-rule bg-canvas/60 pl-8 pr-3 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra transition-[border-color,box-shadow]"
          />
        </div>
      </div>

      {/* COA Tree Leveled Table - Box with consistent fixed height */}
      <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs flex flex-col h-[calc(100vh-16.5rem)] min-h-[460px]">
        <div className="overflow-x-auto overflow-y-auto flex-1 paper-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-xs shadow-2xs">
              <tr className="border-b border-rule text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Struktur Akun & Nama</th>
                <th className="px-3 py-3">Level</th>
                <th className="px-3 py-3">Kategori</th>
                <th className="px-3 py-3">Saldo Normal</th>
                <th className="px-3 py-3">Peran Akun</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/50">
              <AnimatePresence initial={false}>
                {visibleAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-ink-soft">
                      <FolderTree className="size-8 mx-auto mb-2 text-ink-soft/40" />
                      <p className="font-semibold text-ink">Tidak ada akun yang cocok</p>
                      <p className="text-[11px] mt-0.5">Coba ubah kata kunci pencarian atau pilih kategori lain.</p>
                    </td>
                  </tr>
                ) : (
                  visibleAccounts.map((a) => {
                    const meta = TYPE_META[a.type];
                    const Icon = meta.icon;
                    const isArchived = Boolean(a.archivedAt);
                    const isCollapsed = collapsedCodes.has(a.code);

                    // Hierarchical Tree Indentation
                    const indentPadding =
                      a.level === 1
                        ? "pl-4"
                        : a.level === 2
                        ? "pl-9"
                        : a.level === 3
                        ? "pl-14"
                        : "pl-20";

                    return (
                      <motion.tr
                        key={a.id}
                        layout="position"
                        initial={{ opacity: 0, y: -6, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.99 }}
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                          mass: 0.8,
                          opacity: { duration: 0.16 },
                        }}
                        className={cn(
                          "transition-colors group",
                          a.isHeader
                            ? "bg-canvas/35 hover:bg-canvas/60 font-semibold"
                            : "hover:bg-canvas/30",
                          isArchived && "opacity-60 bg-canvas/20",
                        )}
                      >
                        {/* Kode & Nama with Collapsible Tree Toggle */}
                        <td className={cn("py-2.5 pr-4", indentPadding)}>
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Collapsible toggle chevron for headers */}
                            {a.hasChildren ? (
                              <button
                                type="button"
                                onClick={() => toggleCollapse(a.code)}
                                className="flex size-5 shrink-0 items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-paper transition-colors cursor-pointer"
                                aria-label={isCollapsed ? "Buka sub-akun" : "Tutup sub-akun"}
                                title={isCollapsed ? "Buka sub-akun" : "Tutup sub-akun"}
                              >
                                <motion.div
                                  animate={{ rotate: isCollapsed ? 0 : 90 }}
                                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                >
                                  <ChevronRight className="size-3.5" />
                                </motion.div>
                              </button>
                            ) : (
                              <div className="size-5 shrink-0 flex items-center justify-center text-rule">
                                <span className="size-1 rounded-full bg-rule/90" />
                              </div>
                            )}

                            {/* Node Type Icon Indicator */}
                            {a.level === 1 ? (
                              <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg border", meta.bg)}>
                                <Icon className={cn("size-3.5", meta.color)} />
                              </div>
                            ) : a.hasChildren ? (
                              <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-canvas border border-rule text-ink-soft">
                                {isCollapsed ? (
                                  <Folder className="size-3 text-amber-500" />
                                ) : (
                                  <FolderOpen className="size-3 text-amber-500" />
                                )}
                              </div>
                            ) : (
                              <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-canvas/60 text-ink-soft">
                                <FileText className="size-3 text-ink-soft/70" />
                              </div>
                            )}

                            {/* Account Code */}
                            <span
                              className={cn(
                                "font-mono text-xs tracking-tight shrink-0",
                                a.level === 1 ? "font-bold text-ink" : "text-ink-soft",
                              )}
                            >
                              {a.code}
                            </span>

                            <span className="text-rule shrink-0">•</span>

                            {/* Account Name */}
                            <span
                              className={cn(
                                "truncate text-xs cursor-pointer select-none",
                                a.level === 1 ? "font-bold text-ink" : a.isHeader ? "font-semibold text-ink" : "text-ink font-normal",
                              )}
                              title={a.name}
                              onClick={() => a.hasChildren && toggleCollapse(a.code)}
                            >
                              {a.name}
                            </span>

                            {/* Cash/Bank/Contra badges */}
                            {a.isCash && (
                              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 shrink-0 font-medium">
                                Kas
                              </Badge>
                            )}
                            {a.isBank && (
                              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-500/15 shrink-0 font-medium">
                                Bank
                              </Badge>
                            )}
                            {a.contra && (
                              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-500/15 shrink-0 font-medium">
                                Kontra
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Level Badge */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono border",
                              a.level === 1
                                ? "bg-ink text-paper border-ink font-bold"
                                : a.level === 2
                                ? "bg-canvas border-rule text-ink font-medium"
                                : "bg-canvas/50 border-rule/60 text-ink-soft",
                            )}
                          >
                            Lvl {a.level}
                          </span>
                        </td>

                        {/* Kategori Type */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border", meta.badgeBg)}>
                            <Icon className="size-3 shrink-0" />
                            <span>{meta.label}</span>
                          </span>
                        </td>

                        {/* Saldo Normal */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] font-mono font-semibold px-2 py-0.5 border",
                              a.normal === "D"
                                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/15"
                                : "border-terra/40 text-terra bg-terra/10",
                            )}
                          >
                            {a.normal === "D" ? "Debit (D)" : "Kredit (K)"}
                          </Badge>
                        </td>

                        {/* Role: Header vs Posting */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {a.hasChildren ? (
                            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-amber-500 inline-block" />
                              <span>Induk ({a.childrenCount})</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                              <span>Posting Jurnal</span>
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {isArchived ? (
                            <Badge variant="outline" className="border-rule text-ink-soft text-[11px]">
                              Diarsipkan
                            </Badge>
                          ) : (
                            <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                              Aktif
                            </Badge>
                          )}
                        </td>

                        {/* Aksi: menu dropdown */}
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          {canEdit && (
                            <div className="flex items-center justify-center">
                              <AccountRowMenu
                                account={{ id: a.id, code: a.code, name: a.name, archivedAt: a.archivedAt }}
                              />
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
