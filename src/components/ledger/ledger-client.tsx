"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Coins,
  CreditCard,
  Scale,
  TrendingUp,
  TrendingDown,
  Search,
  Eye,
  FileText,
  Filter,
  FolderTree,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion";

export interface AccountBalanceItem {
  id: string;
  code: string;
  name: string;
  type: "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";
  normal: "D" | "K";
  parentCode: string | null;
  archivedAt: string | null;
  debitMinor: string;
  creditMinor: string;
  balanceMinor: string;
  transactionCount: number;
}

interface LedgerClientProps {
  accounts: AccountBalanceItem[];
}

const TYPE_META = {
  ASET: {
    label: "Aset",
    icon: Coins,
    color: "text-ink-soft",
    bg: "bg-canvas border-rule",
    badgeBg: "bg-canvas text-ink-soft border-rule",
  },
  LIABILITAS: {
    label: "Liabilitas",
    icon: CreditCard,
    color: "text-ink-soft",
    bg: "bg-canvas border-rule",
    badgeBg: "bg-canvas text-ink-soft border-rule",
  },
  EKUITAS: {
    label: "Ekuitas",
    icon: Scale,
    color: "text-ink-soft",
    bg: "bg-canvas border-rule",
    badgeBg: "bg-canvas text-ink-soft border-rule",
  },
  PENDAPATAN: {
    label: "Pendapatan",
    icon: TrendingUp,
    color: "text-ink-soft",
    bg: "bg-canvas border-rule",
    badgeBg: "bg-canvas text-ink-soft border-rule",
  },
  BEBAN: {
    label: "Beban",
    icon: TrendingDown,
    color: "text-ink-soft",
    bg: "bg-canvas border-rule",
    badgeBg: "bg-canvas text-ink-soft border-rule",
  },
} as const;

export function LedgerClient({ accounts }: LedgerClientProps) {
  const [search, setSearch] = React.useState("");
  const [selectedType, setSelectedType] = React.useState<string>("ALL");
  const [onlyWithTransactions, setOnlyWithTransactions] = React.useState(false);
  const [collapsedCodes, setCollapsedCodes] = React.useState<Set<string>>(new Set());

  // Build hierarchy and calculate leveling identical to COA Manager
  const { leveledAccounts, parentMap } = React.useMemo(() => {
    const pMap = new Map<string, AccountBalanceItem>();
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

  // Filter accounts taking tree visibility, category, active transactions, & search into account
  const visibleAccounts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const isSearching = Boolean(q);

    return leveledAccounts.filter((a) => {
      const matchType = selectedType === "ALL" || a.type === selectedType;
      if (!matchType) return false;

      if (onlyWithTransactions && a.transactionCount === 0) {
        return false;
      }

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
  }, [leveledAccounts, selectedType, onlyWithTransactions, search, collapsedCodes, parentMap]);

  // Overall statistics
  const summary = React.useMemo(() => {
    let totalDebit = 0n;
    let totalCredit = 0n;
    let activeAccounts = 0;

    for (const a of accounts) {
      const d = BigInt(a.debitMinor || "0");
      const c = BigInt(a.creditMinor || "0");
      totalDebit += d;
      totalCredit += c;
      if (a.transactionCount > 0) activeAccounts++;
    }

    return {
      totalDebit,
      totalCredit,
      totalAccounts: accounts.length,
      activeAccounts,
    };
  }, [accounts]);

  return (
    <div className="space-y-4">
      {/* Top Stat Overview Cards */}
      <Reveal delay={0.04}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Akun COA
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-xl sm:text-2xl font-bold text-ink">
                {summary.totalAccounts}
              </span>
              <span className="text-xs text-ink-soft">
                ({summary.activeAccounts} bermutasi)
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Mutasi Debit
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-bold text-debit">
              {Money.fromMinor(summary.totalDebit).formatIdr()}
            </p>
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Mutasi Kredit
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-bold text-credit">
              {Money.fromMinor(summary.totalCredit).formatIdr()}
            </p>
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Status Keseimbangan
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {summary.totalDebit === summary.totalCredit ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Seimbang (Balanced)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Selisih: {Money.fromMinor(summary.totalDebit - summary.totalCredit).formatIdr()}
                </span>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Filter Tabs, Search Bar & Tree Actions */}
      <Reveal delay={0.08}>
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 rounded-2xl border border-rule bg-paper p-2.5 shadow-2xs">
          {/* Category Pill Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedType("ALL")}
              className={cn(
                "relative h-7.5 rounded-xl px-3 text-xs font-medium transition-colors focus-ring shrink-0",
                selectedType === "ALL" ? "text-paper font-semibold" : "text-ink-soft hover:text-ink hover:bg-canvas/50",
              )}
            >
              {selectedType === "ALL" && (
                <motion.div
                  layoutId="buku-besar-active-tab-pill"
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
                    "relative flex items-center gap-1.5 h-7.5 rounded-xl px-3 text-xs font-medium transition-colors focus-ring shrink-0",
                    isSelected ? "text-paper font-semibold" : "text-ink-soft hover:text-ink hover:bg-canvas/50",
                  )}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="buku-besar-active-tab-pill"
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

          {/* Search, Filter Toggle, & Expand/Collapse All Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Expand / Collapse All Tree */}
            <div className="hidden sm:flex items-center gap-1 rounded-xl border border-rule bg-canvas/60 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={expandAll}
                className="rounded-lg px-2.5 py-1 text-ink-soft hover:text-ink hover:bg-paper transition-colors font-medium focus-ring"
              >
                Buka Semua
              </button>
              <span className="text-rule">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded-lg px-2.5 py-1 text-ink-soft hover:text-ink hover:bg-paper transition-colors font-medium focus-ring"
              >
                Tutup Semua
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOnlyWithTransactions((prev) => !prev)}
              className={cn(
                "h-7.5 rounded-xl border px-2.5 text-xs font-medium transition-colors focus-ring flex items-center gap-1.5 shrink-0",
                onlyWithTransactions
                  ? "border-terra/40 bg-terra/10 text-terra font-semibold"
                  : "border-rule bg-canvas/60 text-ink-soft hover:text-ink hover:bg-paper",
              )}
              title="Hanya tampilkan akun yang memiliki mutasi transaksi"
            >
              <Filter className="size-3" />
              <span>Ada Mutasi</span>
            </button>

            <div className="relative w-full sm:w-56 md:w-60">
              <Search className="absolute left-2.5 top-2 size-3.5 text-ink-soft" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode atau nama akun..."
                className="h-7.5 w-full rounded-xl border border-rule bg-canvas/60 pl-8 pr-3 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra transition-[border-color,box-shadow]"
              />
            </div>
          </div>
        </div>
      </Reveal>

      {/* COA TreeView Table Container with Fixed Height & Paper-Scrollbar */}
      <Reveal delay={0.1}>
        <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs flex flex-col h-[calc(100vh-17.5rem)] min-h-[480px]">
          <div className="overflow-x-auto overflow-y-auto flex-1 paper-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-xs shadow-2xs">
                <tr className="border-b border-rule text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Struktur Akun & Nama</th>
                  <th className="px-3 py-3">Kategori</th>
                  <th className="px-3 py-3">Normal</th>
                  <th className="px-4 py-3 text-right">Total Debit</th>
                  <th className="px-4 py-3 text-right">Total Kredit</th>
                  <th className="px-4 py-3 text-right">Saldo Akhir</th>
                  <th className="px-3 py-3 text-center">Mutasi</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/50">
                <AnimatePresence initial={false}>
                  {visibleAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-16 text-center text-ink-soft">
                        <FolderTree className="size-8 mx-auto mb-2 text-ink-soft/40" />
                        <p className="font-semibold text-ink text-sm">Tidak ada akun yang sesuai</p>
                        <p className="text-xs mt-1">Coba sesuaikan kata kunci pencarian atau ubah filter kategori.</p>
                      </td>
                    </tr>
                  ) : (
                    visibleAccounts.map((a) => {
                      const meta = TYPE_META[a.type];
                      const Icon = meta.icon;
                      const dMinor = BigInt(a.debitMinor || "0");
                      const cMinor = BigInt(a.creditMinor || "0");
                      const bMinor = BigInt(a.balanceMinor || "0");
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
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -3 }}
                          transition={{ duration: 0.15 }}
                          className={cn(
                            "transition-colors group",
                            a.isHeader
                              ? "bg-canvas/35 hover:bg-canvas/60 font-semibold"
                              : "hover:bg-canvas/30",
                          )}
                        >
                          {/* Kode & Nama with TreeView Chevron, Folder & Leaf Icons */}
                          <td className={cn("py-2.5 pr-4", indentPadding)}>
                            <div className="flex items-center gap-2 min-w-0">
                              {/* Collapsible toggle chevron */}
                              {a.hasChildren ? (
                                <button
                                  type="button"
                                  onClick={() => toggleCollapse(a.code)}
                                  className="flex size-5 shrink-0 items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-paper transition-colors cursor-pointer focus-ring"
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

                              {/* Level/Folder Icon */}
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
                            </div>
                          </td>

                          {/* Category Badge */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <Badge variant="outline" className={cn("text-[11px] py-0 px-2 font-medium", meta.badgeBg)}>
                              {meta.label}
                            </Badge>
                          </td>

                          {/* Saldo Normal */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-mono text-xs text-ink-soft font-medium">
                              {a.normal === "D" ? "Debit (D)" : "Kredit (K)"}
                            </span>
                          </td>

                          {/* Total Debit */}
                          <td className="px-4 py-2.5 text-right font-mono text-ink">
                            {dMinor > 0n ? (
                              <span className="text-debit font-medium">
                                {Money.fromMinor(dMinor).formatIdr()}
                              </span>
                            ) : (
                              <span className="text-ink-soft/30">—</span>
                            )}
                          </td>

                          {/* Total Kredit */}
                          <td className="px-4 py-2.5 text-right font-mono text-ink">
                            {cMinor > 0n ? (
                              <span className="text-credit font-medium">
                                {Money.fromMinor(cMinor).formatIdr()}
                              </span>
                            ) : (
                              <span className="text-ink-soft/30">—</span>
                            )}
                          </td>

                          {/* Saldo Akhir */}
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-ink">
                            {Money.fromMinor(bMinor).formatIdr()}
                          </td>

                          {/* Mutasi Count */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium font-mono",
                                a.transactionCount > 0
                                  ? "bg-canvas text-ink border border-rule/70"
                                  : "text-ink-soft/40",
                              )}
                            >
                              {a.transactionCount}
                            </span>
                          </td>

                          {/* Action: Dedicated Page Link */}
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <Link href={`/buku-besar/${a.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-rule bg-canvas hover:bg-paper text-ink gap-1.5 group-hover:border-terra/50 transition-colors"
                              >
                                <Eye className="size-3 text-terra" />
                                <span>Detail</span>
                              </Button>
                            </Link>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary Bar */}
          <div className="border-t border-rule bg-canvas/80 px-4 py-2.5 flex items-center justify-between text-xs text-ink-soft shrink-0">
            <span>
              Menampilkan {visibleAccounts.length} dari {accounts.length} akun
            </span>
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span>
                Debit: <strong className="text-debit">{Money.fromMinor(summary.totalDebit).formatIdr()}</strong>
              </span>
              <span>
                Kredit: <strong className="text-credit">{Money.fromMinor(summary.totalCredit).formatIdr()}</strong>
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
