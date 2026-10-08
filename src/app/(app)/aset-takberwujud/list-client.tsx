"use client";

import * as React from "react";
import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { motion, AnimatePresence } from "motion/react";
import { FileText, Plus, Play, Coins } from "lucide-react";
import { Reveal, AnimatedNumber } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/data-table/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table/data-table-features";
import {
  FilterChips,
  FilterDrawer,
  FilterSearchInput,
  FilterSection,
  FilterSegGroup,
  FilterTriggerButton,
  TableSwap,
  type FilterChip,
} from "@/components/ui/filter-drawer";
import { Money } from "@/core/money/money";
import type {
  IntangibleCardRow,
  IntangibleCategory,
} from "@/server/db/repos/intangible-assets.repo";
import { RunAmortizationDialog } from "./run-amortization-dialog";

interface PeriodOption {
  name: string;
  status: string;
}

type StatusFilter = "SEMUA" | "ACTIVE" | "FULLY_AMORTIZED" | "DISPOSED";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "SEMUA", label: "Semua" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "FULLY_AMORTIZED", label: "Tuntas" },
  { value: "DISPOSED", label: "Dilepas" },
];

const CATEGORIES: ReadonlyArray<IntangibleCategory> = [
  "LISENSI_SOFTWARE",
  "HAK_CIPTA",
  "PATEN",
  "MEREK_DAGANG",
  "GOODWILL",
  "LAINNYA",
];

const CATEGORY_LABEL: Record<IntangibleCategory, string> = {
  LISENSI_SOFTWARE: "Lisensi Software",
  HAK_CIPTA: "Hak Cipta",
  PATEN: "Paten",
  MEREK_DAGANG: "Merek Dagang",
  GOODWILL: "Goodwill",
  LAINNYA: "Lainnya",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "border-emerald-500/30 text-emerald-700 bg-emerald-500/10",
  FULLY_AMORTIZED: "border-blue-500/30 text-blue-700 bg-blue-500/10",
  DISPOSED: "border-rose-500/30 text-rose-700 bg-rose-500/10",
};

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "Aktif",
  FULLY_AMORTIZED: "Tuntas",
  DISPOSED: "Dilepas",
};

const columns: ColumnDef<DataTableFeatures, IntangibleCardRow>[] = [
  {
    id: "kode",
    header: "Kode",
    cell: ({ row }) => (
      <span className="font-mono font-semibold text-terra">{row.original.code}</span>
    ),
  },
  {
    id: "nama",
    header: "Nama Aset",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <Link
          href={`/aset-takberwujud/${r.id}`}
          className="focus-ring rounded-md font-medium transition-colors hover:text-terra"
        >
          {r.name}
        </Link>
      );
    },
  },
  {
    id: "kategori",
    header: "Kategori",
    cell: ({ row }) => (
      <span className="text-ink-soft">{CATEGORY_LABEL[row.original.category] ?? row.original.category}</span>
    ),
  },
  {
    id: "tanggal",
    header: "Tgl Perolehan",
    cell: ({ row }) => (
      <span className="font-mono text-ink-soft">{row.original.acquisitionDate}</span>
    ),
  },
  {
    id: "biaya",
    header: "Biaya Perolehan",
    meta: { numeric: true },
    cell: ({ row }) => (
      <span className="font-mono tnum">{Money.formatIdr(row.original.acquisitionCostMinor)}</span>
    ),
  },
  {
    id: "akumulasi",
    header: "Akumulasi",
    meta: { numeric: true },
    cell: ({ row }) => (
      <span className="font-mono tnum">{Money.formatIdr(row.original.accumulatedMinor)}</span>
    ),
  },
  {
    id: "buku",
    header: "Nilai Buku",
    meta: { numeric: true },
    cell: ({ row }) => (
      <span className="font-mono font-semibold tnum">
        {Money.formatIdr(row.original.bookValueMinor)}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline" className={STATUS_BADGE[row.original.status] ?? ""}>
        {STATUS_TEXT[row.original.status] ?? row.original.status}
      </Badge>
    ),
  },
];

/**
 * Daftar aset takberwujud — cermin halaman aset tetap: tajuk + panel armada
 * (total + komposisi kategori) + toolbar cari/filter + tabel DataTable.
 */
export function IntangibleListClient({
  rows,
  openPeriods,
}: {
  rows: IntangibleCardRow[];
  openPeriods: PeriodOption[];
}) {
  const [q, setQ] = useState("");
  const [st, setSt] = useState<StatusFilter>("SEMUA");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runAmorDialogOpen, setRunAmorDialogOpen] = useState(false);

  const filtered = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !`${r.code} ${r.name}`.toLowerCase().includes(ql)) return false;
      if (st !== "SEMUA" && r.status !== st) return false;
      return true;
    });
  }, [rows, q, st]);

  const isFiltering = q.trim() !== "" || st !== "SEMUA";
  const totalCost = rows.reduce((a, r) => a + r.acquisitionCostMinor, 0n);
  const activeRows = rows.filter((r) => r.status === "ACTIVE");

  const composition = CATEGORIES.map((cat) => {
    const cost = rows
      .filter((r) => r.category === cat)
      .reduce((sum, r) => sum + r.acquisitionCostMinor, 0n);
    return { cat, cost };
  }).filter((c) => c.cost > 0n);

  const totalSisa = filtered.reduce((a, r) => a + r.bookValueMinor, 0n);
  const totalAll = filtered.reduce((a, r) => a + r.acquisitionCostMinor, 0n);
  const totalAcc = filtered.reduce((a, r) => a + r.accumulatedMinor, 0n);
  const filterCount = (q.trim() ? 1 : 0) + (st !== "SEMUA" ? 1 : 0);

  function clearAll() {
    setQ("");
    setSt("SEMUA");
    setDrawerOpen(false);
  }

  const chips: FilterChip[] = [];
  if (q.trim()) chips.push({ key: "q", label: `“${q.trim()}”`, clear: () => setQ("") });
  if (st !== "SEMUA")
    chips.push({
      key: "st",
      label: STATUS_OPTIONS.find((o) => o.value === st)?.label ?? st,
      clear: () => setSt("SEMUA"),
    });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Daftar Aset Takberwujud"
        eyebrow="Pencatatan lisensi dan merek, amortisasi otomatis, dan pelaporan nilai buku (SAK EMKM Bab 12)."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setRunAmorDialogOpen(true)}
              className="border-terra/40 text-terra hover:bg-terra/10 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] text-xs h-9 rounded-xl"
            >
              <Play className="size-4 mr-1.5" />
              Jalankan Amortisasi
            </Button>

            <Link href="/aset-takberwujud/baru">
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
              <AnimatedNumber minor={totalCost} />
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              {rows.length} unit terdaftar · {activeRows.length} aktif diamortisasi
            </p>
            <Link
              href="/aset-takberwujud/baru"
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
                  const pct = totalCost > 0n ? Number((c.cost * 100n) / totalCost) : 0;
                  return (
                    <li key={c.cat}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-medium text-ink">{CATEGORY_LABEL[c.cat]}</span>
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

      {/* Toolbar: cari + Filter (drawer) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FilterSearchInput
            value={q}
            onChange={setQ}
            placeholder="Cari kode atau nama aset…"
          />
          <FilterTriggerButton count={filterCount} onClick={() => setDrawerOpen(true)} />
        </div>
        <FilterChips chips={chips} onClearAll={clearAll} />
      </div>

      {/* Table */}
      <Reveal delay={0.08}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={isFiltering ? "filtered" : "all"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
      <TableSwap
        isEmpty={filtered.length === 0}
        empty={(
          <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
            <div className="px-4 py-8 text-center text-xs text-ink-soft">
              {isFiltering
                ? "Tidak ada aset yang cocok dengan filter."
                : 'Belum ada aset takberwujud terdaftar. Klik "+ Tambah Aset" untuk mendaftarkan lisensi atau merek.'}
            </div>
          </div>
        )}
      >
        <DataTable
          columns={columns}
          data={filtered}
          sorting={false}
          pagination={false}
          getRowId={(row) => row.id}
          getRowProps={(_, i) => ({
            className: "row-enter",
            style: { "--row-i": i } as CSSProperties,
          })}
          footer={
            <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
              <td colSpan={4} className="px-4 py-3.5 text-right text-[11px] uppercase tracking-wider text-ink-soft">
                Total
              </td>
              <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totalAll)}</td>
              <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totalAcc)}</td>
              <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink tnum">
                {Money.formatIdr(totalSisa)}
              </td>
              <td />
            </tr>
          }
        />
      </TableSwap>
        </motion.div>
      </AnimatePresence>
      </Reveal>

      <FilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Filter"
        description="Persempit aset berdasarkan status."
        onClear={clearAll}
        onApply={() => setDrawerOpen(false)}
        activeCount={filterCount}
      >
        <FilterSection title="Status">
          <FilterSegGroup
            ariaLabel="Status aset"
            options={STATUS_OPTIONS}
            value={st}
            onChange={setSt}
          />
        </FilterSection>
      </FilterDrawer>

      {/* Dialogs */}
      <RunAmortizationDialog
        open={runAmorDialogOpen}
        onOpenChange={setRunAmorDialogOpen}
        openPeriods={openPeriods}
      />
    </div>
  );
}
