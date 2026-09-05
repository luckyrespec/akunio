"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, AnimatedNumber } from "@/components/motion";
import {
  Plus,
  Play,
  TrendingDown,
  Coins,
  PackageCheck,
  AlertCircle,
  ExternalLink,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RunDepreciationDialog } from "./run-depreciation-dialog";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface PeriodOption {
  name: string;
  status: string;
}

export function AsetClient({
  initialAssets,
  accounts,
  openPeriods,
}: {
  initialAssets: any[];
  accounts: AccountOption[];
  openPeriods: PeriodOption[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [runDepDialogOpen, setRunDepDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Summary — semua dari data nyata
  const totalCostMinor = assets.reduce(
    (sum, a) => sum + BigInt(a.acquisitionCostMinor),
    0n,
  );
  const activeAssets = assets.filter((a) => a.status === "ACTIVE");

  const CATEGORIES = ["KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR", "BANGUNAN", "TANAH"] as const;
  const composition = CATEGORIES.map((cat) => {
    const cost = assets
      .filter((a) => a.category === cat)
      .reduce((sum, a) => sum + BigInt(a.acquisitionCostMinor), 0n);
    return { cat, cost };
  }).filter((c) => c.cost > 0n);

  const STATUS_SEGMENTS = [
    { key: "ALL", label: "Semua", icon: LayoutGrid },
    { key: "ACTIVE", label: "Aktif", icon: PackageCheck },
    { key: "FULLY_DEPRECIATED", label: "Lunas Susut", icon: TrendingDown },
    { key: "DISPOSED", label: "Dilepas", icon: AlertCircle },
  ] as const;

  const filteredAssets = assets.filter((a) => {
    if (categoryFilter !== "ALL" && a.category !== categoryFilter) return false;
    if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Daftar Aset Tetap"
        eyebrow="Pencatatan inventaris aset, penyusutan otomatis, dan pelaporan nilai buku (SAK EMKM)."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setRunDepDialogOpen(true)}
              className="border-terra/40 text-terra hover:bg-terra/10 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] text-xs h-9 rounded-xl"
            >
              <Play className="size-4 mr-1.5" />
              Jalankan Penyusutan
            </Button>

            <Link href="/aset/baru">
              <Button className="bg-terra text-white hover:bg-terra/90 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] text-xs h-9 rounded-xl shadow-2xs">
                <Plus data-icon="inline-start" />
                Tambah Aset
              </Button>
            </Link>
          </div>
        }
      />

      {/* Panel armada — nilai perolehan + komposisi kategori */}
      <Reveal>
        <div className="matte-card grid gap-6 rounded-2xl border border-rule bg-paper p-5 sm:p-6 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">
              <Coins className="size-3.5" />
              Total Nilai Perolehan
            </p>
            <p className="tnum mt-2 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              <AnimatedNumber minor={totalCostMinor} />
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              {assets.length} unit terdaftar · {activeAssets.length} aktif disusutkan
            </p>
            <Link
              href="/aset/baru"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-terra hover:underline"
            >
              <Plus className="size-3" />
              Daftarkan aset baru
            </Link>
          </div>

          <div className="min-w-0 lg:border-l lg:border-rule/70 lg:pl-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Komposisi per Kategori
            </p>
            {composition.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {composition.map((c) => {
                  const pct = totalCostMinor > 0n ? Number((c.cost * 100n) / totalCostMinor) : 0;
                  return (
                    <li key={c.cat}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-medium text-ink">{c.cat.replace(/_/g, " ")}</span>
                        <span className="tnum shrink-0 font-semibold text-ink">
                          {Money.formatIdr(c.cost)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                        <div className="h-full rounded-full bg-ink/70" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-soft">
                Belum ada aset — daftarkan aset pertama untuk melihat komposisinya.
              </p>
            )}
          </div>
        </div>
      </Reveal>

      {/* Filter: kategori + status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs" role="tablist" aria-label="Filter kategori">
          {["ALL", "KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR", "BANGUNAN", "TANAH"].map(
            (cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                className={`relative px-3 py-1.5 rounded-full font-medium transition-colors focus-ring ${
                  categoryFilter === cat
                    ? "text-paper dark:text-white"
                    : "bg-canvas border border-rule text-ink hover:bg-paper"
                }`}
              >
                {categoryFilter === cat && (
                  <motion.span
                    layoutId="aset-cat-pill"
                    transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute inset-0 rounded-full bg-ink shadow-xs dark:bg-terra"
                  />
                )}
                <span className="relative z-10">
                {cat === "ALL" ? "Semua Kategori" : cat.replace(/_/g, " ")}
                </span>
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-rule bg-canvas p-1 text-[11px]" role="tablist" aria-label="Filter status">
          {STATUS_SEGMENTS.map((s) => {
            const count = s.key === "ALL" ? assets.length : assets.filter((a) => a.status === s.key).length;
            const selected = statusFilter === s.key;
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setStatusFilter(s.key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold transition-colors focus-ring ${
                  selected ? "bg-paper text-terra shadow-2xs" : "text-ink-soft hover:text-ink"
                }`}
              >
                <Icon className="size-3.5" />
                {s.label}
                <span className="tnum font-normal opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <Reveal delay={0.08}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={categoryFilter}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-canvas/70 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Aset</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Tgl Perolehan</th>
                <th className="px-4 py-3 text-right">Biaya Perolehan</th>
                <th className="px-4 py-3">Metode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 text-ink">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ink-soft">
                    Belum ada aset tetap terdaftar. Klik "+ Tambah Aset" untuk mendaftarkan aset baru.
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-terra">
                      {asset.code}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/aset/${asset.id}`}
                        className="hover:text-terra transition-colors flex items-center gap-1 group"
                      >
                        {asset.name}
                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {asset.category.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-ink-soft font-mono">
                      {asset.acquisitionDate}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {Money.formatIdr(BigInt(asset.acquisitionCostMinor))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-canvas px-1.5 py-0.5 border border-rule/70 text-[11px] font-mono">
                        {asset.depreciationMethod === "STRAIGHT_LINE" ? "Garis Lurus" : "Saldo Menurun"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          asset.status === "ACTIVE"
                            ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                            : asset.status === "FULLY_DEPRECIATED"
                            ? "border-blue-500/30 text-blue-700 bg-blue-500/10"
                            : "border-rose-500/30 text-rose-700 bg-rose-500/10"
                        }
                      >
                        {asset.status === "ACTIVE"
                          ? "Aktif"
                          : asset.status === "FULLY_DEPRECIATED"
                          ? "Lunas Susut"
                          : "Dilepas"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/aset/${asset.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs">
                          Detail
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </motion.div>
      </AnimatePresence>
      </Reveal>

      {/* Dialogs */}
      <RunDepreciationDialog
        open={runDepDialogOpen}
        onOpenChange={setRunDepDialogOpen}
        openPeriods={openPeriods}
      />
    </div>
  );
}
