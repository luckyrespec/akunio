"use client";

import * as React from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { AnimatedNumber } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table/data-table-features";
import {
  FilterChips,
  FilterDrawer,
  FilterSearchInput,
  FilterSection,
  FilterSegGroup,
  FilterTriggerButton,
  type FilterChip,
} from "@/components/ui/filter-drawer";
import { Money } from "@/core/money/money";
import type {
  IntangibleCardRow,
  IntangibleCategory,
} from "@/server/db/repos/intangible-assets.repo";

type StatusFilter = "SEMUA" | "ACTIVE" | "FULLY_AMORTIZED" | "DISPOSED";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "SEMUA", label: "Semua" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "FULLY_AMORTIZED", label: "Tuntas" },
  { value: "DISPOSED", label: "Dilepas" },
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
 * Daftar aset takberwujud: cari instan + drawer status, tabel DataTable + total.
 */
export function IntangibleListClient({ rows }: { rows: IntangibleCardRow[] }) {
  const [q, setQ] = React.useState("");
  const [st, setSt] = React.useState<StatusFilter>("SEMUA");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !`${r.code} ${r.name}`.toLowerCase().includes(ql)) return false;
      if (st !== "SEMUA" && r.status !== st) return false;
      return true;
    });
  }, [rows, q, st]);

  const isFiltering = q.trim() !== "" || st !== "SEMUA";
  const totalCost = filtered.reduce((a, r) => a + r.acquisitionCostMinor, 0n);
  const totalAccum = filtered.reduce((a, r) => a + r.accumulatedMinor, 0n);
  const totalBook = filtered.reduce((a, r) => a + r.bookValueMinor, 0n);
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
    <div className="space-y-4">
      <p className="text-xs text-ink-soft" role="status">
        {isFiltering ? `${filtered.length} dari ${rows.length} aset` : `${rows.length} aset`} · total perolehan{" "}
        <AnimatedNumber minor={totalCost} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
        {" "}· total nilai buku{" "}
        <AnimatedNumber minor={totalBook} className="font-display text-lg font-semibold tracking-tight text-ink tnum" />
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FilterSearchInput value={q} onChange={setQ} placeholder="Cari kode atau nama aset…" />
          <FilterTriggerButton count={filterCount} onClick={() => setDrawerOpen(true)} />
        </div>
        <FilterChips chips={chips} onClearAll={clearAll} />
      </div>

      {filtered.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
          <div className="px-4 py-12 text-center text-xs text-ink-soft">
            {isFiltering ? (
              "Tidak ada aset yang cocok dengan filter."
            ) : (
              <>
                <FileText className="mx-auto mb-2 size-8 text-ink-soft/40" />
                <p>Belum ada aset takberwujud. Klik “Tambah Aset Takberwujud” untuk mendaftarkan lisensi atau merek.</p>
              </>
            )}
          </div>
        </div>
      ) : (
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
              <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totalCost)}</td>
              <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totalAccum)}</td>
              <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink tnum">
                {Money.formatIdr(totalBook)}
              </td>
              <td />
            </tr>
          }
        />
      )}

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
    </div>
  );
}
