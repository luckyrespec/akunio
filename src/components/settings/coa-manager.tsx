"use client";

import * as React from "react";
import {
  Coins,
  CreditCard,
  Scale,
  TrendingUp,
  TrendingDown,
  Search,
  Layers,
  FolderTree,
  FileSpreadsheet,
  CheckCircle2,
  Archive,
  ArrowRight,
  Folder,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ArchiveToggle } from "@/components/settings/archive-toggle";
import { CreateAccountDialog } from "@/components/settings/create-account-dialog";
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
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40",
  },
  LIABILITAS: {
    label: "Liabilitas",
    icon: CreditCard,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    badgeBg: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40",
  },
  EKUITAS: {
    label: "Ekuitas",
    icon: Scale,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    badgeBg: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/40",
  },
  PENDAPATAN: {
    label: "Pendapatan",
    icon: TrendingUp,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    badgeBg: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40",
  },
  BEBAN: {
    label: "Beban",
    icon: TrendingDown,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    badgeBg: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40",
  },
} as const;

export function CoaManager({ accounts, userRole }: CoaManagerProps) {
  const [search, setSearch] = React.useState("");
  const [selectedType, setSelectedType] = React.useState<string>("ALL");

  // Build hierarchy and calculate leveling
  const { leveledAccounts, stats } = React.useMemo(() => {
    const parentMap = new Map<string, AccountItem>();
    const childrenMap = new Map<string, string[]>();

    for (const a of accounts) {
      parentMap.set(a.code, a);
      if (a.parentCode) {
        const list = childrenMap.get(a.parentCode) || [];
        list.push(a.code);
        childrenMap.set(a.parentCode, list);
      }
    }

    const leveled = accounts.map((a) => {
      let level = 1;
      let cur = a.parentCode;
      while (cur && parentMap.has(cur)) {
        level += 1;
        cur = parentMap.get(cur)?.parentCode ?? null;
      }

      const hasChildren = (childrenMap.get(a.code)?.length ?? 0) > 0;
      const isHeader = hasChildren || level === 1;

      return {
        ...a,
        level,
        hasChildren,
        isHeader,
        childrenCount: childrenMap.get(a.code)?.length ?? 0,
      };
    });

    const activeCount = accounts.filter((a) => !a.archivedAt).length;
    const archivedCount = accounts.filter((a) => a.archivedAt).length;

    return {
      leveledAccounts: leveled,
      stats: {
        total: accounts.length,
        active: activeCount,
        archived: archivedCount,
      },
    };
  }, [accounts]);

  // Filter accounts
  const filteredAccounts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return leveledAccounts.filter((a) => {
      const matchType = selectedType === "ALL" || a.type === selectedType;
      const matchQuery =
        !q ||
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.parentCode && a.parentCode.toLowerCase().includes(q));
      return matchType && matchQuery;
    });
  }, [leveledAccounts, selectedType, search]);

  const canEdit = userRole !== "VIEWER";

  return (
    <div className="space-y-4">
      {/* Header & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-bold text-ink">Bagan Akun (Chart of Accounts)</h2>
            <Badge variant="outline" className="font-mono text-[10px] text-ink-soft border-rule">
              {stats.total} Akun
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">
            Hierarki akun bertingkat (Level 1 Induk, Level 2 Grup, Level 3 Posting) untuk pencatatan transaksi & laporan IFRS.
          </p>
        </div>

        {/* Action Button: Create Account Modal */}
        {canEdit && (
          <div className="shrink-0">
            <CreateAccountDialog existingAccounts={accounts} />
          </div>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 rounded-2xl border border-rule bg-paper p-2.5 shadow-2xs">
        {/* Category Pill Filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedType("ALL")}
            className={cn(
              "h-7 rounded-xl px-2.5 text-xs font-medium transition-all shrink-0",
              selectedType === "ALL"
                ? "bg-ink text-paper font-semibold shadow-2xs"
                : "text-ink-soft hover:bg-canvas hover:text-ink",
            )}
          >
            Semua ({accounts.length})
          </button>

          {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            const count = accounts.filter((a) => a.type === t).length;
            const isSelected = selectedType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={cn(
                  "flex items-center gap-1.5 h-7 rounded-xl px-2.5 text-xs font-medium transition-all shrink-0",
                  isSelected
                    ? cn("bg-ink text-paper font-semibold shadow-2xs")
                    : "text-ink-soft hover:bg-canvas hover:text-ink",
                )}
              >
                <Icon className={cn("size-3.5", isSelected ? "text-paper" : meta.color)} />
                <span>{meta.label}</span>
                <span className="text-[10px] opacity-70">({count})</span>
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
            className="h-7 w-full rounded-xl border border-rule bg-canvas/60 pl-8 pr-3 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra"
          />
        </div>
      </div>

      {/* COA Leveled Table */}
      <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-rule bg-canvas/70 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Kode & Nama Akun</th>
                <th className="px-3 py-3">Leveling</th>
                <th className="px-3 py-3">Kategori</th>
                <th className="px-3 py-3">Saldo Normal</th>
                <th className="px-3 py-3">Peran Akun</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-ink-soft">
                    <FolderTree className="size-8 mx-auto mb-2 text-ink-soft/40" />
                    <p className="font-semibold text-ink">Tidak ada akun yang cocok</p>
                    <p className="text-[11px] mt-0.5">Coba ubah kata kunci pencarian atau filter kategori.</p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((a) => {
                  const meta = TYPE_META[a.type];
                  const Icon = meta.icon;
                  const isArchived = Boolean(a.archivedAt);

                  // Indentation based on level
                  const indentPadding =
                    a.level === 1
                      ? "pl-4"
                      : a.level === 2
                      ? "pl-8"
                      : a.level === 3
                      ? "pl-12"
                      : "pl-16";

                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "transition-colors group",
                        a.isHeader
                          ? "bg-canvas/30 font-semibold"
                          : "hover:bg-canvas/40",
                        isArchived && "opacity-60 bg-canvas/20",
                      )}
                    >
                      {/* Kode & Nama with Hierarchical Indentation & Tree Branch */}
                      <td className={cn("py-2.5 pr-4", indentPadding)}>
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Tree Icon Indicator */}
                          {a.level === 1 ? (
                            <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg border", meta.bg)}>
                              <Icon className={cn("size-3.5", meta.color)} />
                            </div>
                          ) : a.isHeader ? (
                            <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-canvas border border-rule text-ink-soft">
                              <Folder className="size-3 text-amber-500" />
                            </div>
                          ) : (
                            <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-canvas/60 text-ink-soft">
                              <FileText className="size-3 text-ink-soft/70" />
                            </div>
                          )}

                          {/* Code */}
                          <span
                            className={cn(
                              "font-mono text-xs tracking-tight shrink-0",
                              a.level === 1 ? "font-bold text-ink" : "text-ink-soft",
                            )}
                          >
                            {a.code}
                          </span>

                          <span className="text-rule shrink-0">•</span>

                          {/* Name */}
                          <span
                            className={cn(
                              "truncate text-xs",
                              a.level === 1 ? "font-bold text-ink" : a.isHeader ? "font-semibold text-ink" : "text-ink font-normal",
                            )}
                            title={a.name}
                          >
                            {a.name}
                          </span>

                          {/* Cash/Bank tags */}
                          {a.isCash && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-600 bg-emerald-50/50 shrink-0">
                              Kas
                            </Badge>
                          )}
                          {a.isBank && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-500/30 text-blue-600 bg-blue-50/50 shrink-0">
                              Bank
                            </Badge>
                          )}
                          {a.contra && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-rose-500/30 text-rose-600 bg-rose-50/50 shrink-0">
                              Kontra
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Level Badge */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono border",
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
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border", meta.badgeBg)}>
                          <Icon className="size-3" />
                          <span>{meta.label}</span>
                        </span>
                      </td>

                      {/* Saldo Normal */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono font-semibold px-2 py-0.5",
                            a.normal === "D"
                              ? "border-blue-500/30 text-blue-700 bg-blue-50/50 dark:bg-blue-950/20"
                              : "border-purple-500/30 text-purple-700 bg-purple-50/50 dark:bg-purple-950/20",
                          )}
                        >
                          {a.normal === "D" ? "Debit (D)" : "Kredit (K)"}
                        </Badge>
                      </td>

                      {/* Role: Header vs Posting */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {a.isHeader ? (
                          <span className="text-[11px] text-ink-soft font-medium flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-amber-500 inline-block" />
                            <span>Induk ({a.childrenCount})</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                            <span>Posting Jurnal</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {isArchived ? (
                          <Badge variant="outline" className="border-rule text-ink-soft text-[10px]">
                            Diarsipkan
                          </Badge>
                        ) : (
                          <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">
                            Aktif
                          </Badge>
                        )}
                      </td>

                      {/* Aksi Archive */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {canEdit && (
                          <ArchiveToggle accountId={a.id} archived={isArchived} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
