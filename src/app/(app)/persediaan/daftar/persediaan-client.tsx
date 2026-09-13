"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  AlertTriangle,
  ClipboardCheck,
  Search,
  Package,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Plus,
  ChevronDown,
  FileSpreadsheet,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Money } from "@/core/money/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  activeFilterCount,
  defaultFilterState,
  KatalogFilterSheet,
  type KatalogFilterState,
  type KatalogJenis,
} from "./katalog-filter-sheet";

export type { KatalogJenis };

interface JasaRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  priceMinor: string;
  isActive: boolean;
}

interface KatalogRow {
  kind: "BARANG" | "JASA";
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  currentQty: string;
  minStockAlert: string;
  averageCostMinor: bigint;
  totalCostMinor: bigint;
  imageStorageKey: string | null;
  appBarcode: string | null;
  barcode: string | null;
  isActive: boolean;
  href: string;
}

interface ItemLite {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string | null;
  currentQty: string;
  minStockAlert: string | null;
  averageCostMinor: bigint;
  totalCostMinor: bigint;
  imageStorageKey: string | null;
  appBarcode: string | null;
  barcode: string | null;
  isActive: boolean;
}

function barangToRow(it: ItemLite): KatalogRow {
  return {
    kind: "BARANG",
    id: it.id,
    code: it.code,
    name: it.name,
    category: it.category ?? null,
    unit: it.unit ?? "Pcs",
    currentQty: it.currentQty,
    minStockAlert: it.minStockAlert ?? "0",
    averageCostMinor: it.averageCostMinor,
    totalCostMinor: it.totalCostMinor,
    imageStorageKey: it.imageStorageKey,
    appBarcode: it.appBarcode,
    barcode: it.barcode,
    isActive: it.isActive,
    href: `/persediaan/daftar/${it.id}`,
  };
}

function jasaToRow(it: JasaRow): KatalogRow {
  return {
    kind: "JASA",
    id: it.id,
    code: it.code,
    name: it.name,
    category: it.category ?? null,
    unit: it.unit ?? "Sesi",
    currentQty: "0",
    minStockAlert: "0",
    averageCostMinor: 0n,
    totalCostMinor: 0n,
    imageStorageKey: null,
    appBarcode: null,
    barcode: null,
    isActive: it.isActive,
    href: `/persediaan/jasa/${it.id}`,
  };
}

interface InventoryClientProps {
  initialData: {
    items: ItemLite[];
    archivedItems: ItemLite[];
    settings: { valuationMethod?: string; recordingMethod?: string } | null;
    opnames: unknown[];
    totalValueMinor: string;
    totalSku: number;
    lowStockCount: number;
  };
  jasaItems: JasaRow[];
  archivedJasaItems: JasaRow[];
  initialJenis: KatalogJenis;
}

export function PersediaanClient({ initialData, jasaItems, archivedJasaItems, initialJenis }: InventoryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<KatalogFilterState>(() => defaultFilterState(initialJenis));
  const [filterOpen, setFilterOpen] = useState(false);

  // Ganti jenis/status → daftar kategori bisa berbeda, jadi pilihan kategori direset.
  const updateFilters = (patch: Partial<KatalogFilterState>) => {
    setFilters((f) => ({
      ...f,
      ...patch,
      ...(patch.jenis !== undefined || patch.status !== undefined ? { categories: [] } : {}),
    }));
  };
  const clearFilters = () => {
    setFilters(defaultFilterState("semua"));
    // URL ?jenis= hanya benih awal — bersihkan agar tidak menyesatkan saat di-refresh.
    if (window.location.search) router.replace(pathname, { scroll: false });
  };

  const barangRows: KatalogRow[] = (filters.status === "aktif" ? initialData.items : initialData.archivedItems ?? []).map(
    barangToRow,
  );
  const jasaRows: KatalogRow[] = (filters.status === "aktif" ? jasaItems : archivedJasaItems).map(
    jasaToRow,
  );
  const jenisRows =
    filters.jenis === "barang" ? barangRows : filters.jenis === "jasa" ? jasaRows : [...barangRows, ...jasaRows];

  const categoryOptions = (() => {
    const map = new Map<string, number>();
    for (const r of jenisRows) {
      if (r.category) map.set(r.category, (map.get(r.category) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  })();

  const inRange = (raw: number, min: string, max: string) => {
    if (min && raw < Number(min)) return false;
    if (max && raw > Number(max)) return false;
    return true;
  };

  const filteredItems = jenisRows.filter((it) => {
    const q = searchTerm.toLowerCase();
    const matchesQuery =
      it.name.toLowerCase().includes(q) ||
      it.code.toLowerCase().includes(q) ||
      (it.appBarcode && it.appBarcode.toLowerCase().includes(q)) ||
      (it.category && it.category.toLowerCase().includes(q));
    const matchesCategory =
      filters.categories.length === 0 ||
      (it.category !== null && filters.categories.includes(it.category));
    const matchesQty = inRange(Number(it.currentQty), filters.qtyMin, filters.qtyMax);
    const matchesModal = inRange(
      Number(it.averageCostMinor) / 100,
      filters.modalMin,
      filters.modalMax,
    );
    const matchesValue = inRange(Number(it.totalCostMinor) / 100, filters.valueMin, filters.valueMax);
    return matchesQuery && matchesCategory && matchesQty && matchesModal && matchesValue;
  });

  const filterCount = activeFilterCount(filters);

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.jenis !== "semua") {
    chips.push({
      key: "jenis",
      label: filters.jenis === "barang" ? "Barang" : "Jasa",
      clear: () => updateFilters({ jenis: "semua" }),
    });
  }
  if (filters.status !== "aktif") {
    chips.push({ key: "status", label: "Arsip", clear: () => updateFilters({ status: "aktif" }) });
  }
  for (const cat of filters.categories) {
    chips.push({
      key: `cat-${cat}`,
      label: `Kategori: ${cat}`,
      clear: () => updateFilters({ categories: filters.categories.filter((c) => c !== cat) }),
    });
  }
  const rangeChip = (key: string, label: string, min: string, max: string, patch: Partial<KatalogFilterState>) => {
    if (!min && !max) return;
    const text = min && max ? `${label} ${min}–${max}` : min ? `${label} ≥ ${min}` : `${label} ≤ ${max}`;
    chips.push({ key, label: text, clear: () => updateFilters(patch) });
  };
  rangeChip("qty", "Stok", filters.qtyMin, filters.qtyMax, { qtyMin: "", qtyMax: "" });
  rangeChip("modal", "Modal", filters.modalMin, filters.modalMax, { modalMin: "", modalMax: "" });
  rangeChip("value", "Nilai", filters.valueMin, filters.valueMax, { valueMin: "", valueMax: "" });

  const totalValueMinor = BigInt(initialData.totalValueMinor);
  const isFifo = initialData.settings?.valuationMethod === "FIFO";
  const isPeriodic = initialData.settings?.recordingMethod === "PERIODIC";

  return (
    <div className="space-y-6">
      {/* Page Header seragam dengan /kontak dan /aset */}
      <PageHeader
        title="Barang & Jasa"
        eyebrow="Katalog barang dagang, jasa layanan, kartu stok, dan opname fisik berkala."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/persediaan/opname">
              <Button
                variant="outline"
                className="h-9 rounded-xl border-rule bg-paper hover:bg-canvas text-ink text-xs font-medium transition-colors"
              >
                <ClipboardCheck className="size-4 mr-1.5 text-terra" />
                Sesi Stok Opname
                {initialData.opnames.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[11px] font-mono bg-canvas text-ink-soft">
                    {initialData.opnames.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/persediaan/jasa/baru">
              <Button
                variant="outline"
                data-testid="persediaan-jasa-tambah"
                className="h-9 rounded-xl border-rule bg-paper hover:bg-canvas text-ink text-xs font-medium transition-colors"
              >
                <Wrench className="size-4 mr-1.5 text-terra" />
                Tambah Jasa
              </Button>
            </Link>
            {/* Split Button: Tambah Barang Satuan & Batch Input */}
            <div className="inline-flex rounded-xl shadow-xs">
              <Link href="/persediaan/daftar/baru">
                <Button className="h-9 rounded-l-xl rounded-r-none bg-terra text-white hover:bg-terra/90 active:scale-[0.98] text-xs font-medium px-3.5 shadow-none transition-all">
                  <Plus className="size-4 mr-1.5" />
                  Tambah Barang
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-9 px-2 rounded-l-none rounded-r-xl border-l border-white/20 bg-terra text-white hover:bg-terra/90 shadow-none transition-colors"
                    aria-label="Pilihan Tambah Barang"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl border-rule bg-paper p-1.5 shadow-md">
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg text-xs font-medium text-ink focus:bg-canvas">
                    <Link href="/persediaan/daftar/baru" className="flex items-center gap-2.5 py-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-canvas border border-rule/60 text-ink">
                        <Plus className="size-3.5 text-terra" />
                      </div>
                      <div>
                        <div className="font-semibold text-ink">Tambah Barang Satuan</div>
                        <div className="text-[10px] text-ink-soft">Formulir lengkap 1 barang</div>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg text-xs font-medium text-ink focus:bg-canvas">
                    <Link href="/persediaan/daftar/baru/batch" className="flex items-center gap-2.5 py-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <FileSpreadsheet className="size-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-ink flex items-center gap-1.5">
                          Input Cepat Batch
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 font-bold">EXCEL</span>
                        </div>
                        <div className="text-[10px] text-ink-soft">Grid spreadsheet multi-barang</div>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg text-xs font-medium text-ink focus:bg-canvas">
                    <Link href="/persediaan/jasa/baru" className="flex items-center gap-2.5 py-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-terra/10 border border-terra/20 text-terra">
                        <Wrench className="size-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-ink">Tambah Jasa</div>
                        <div className="text-[10px] text-ink-soft">Layanan tanpa stok</div>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />

      {/* KPI Cards — selalu tampil; filter jenis hanya memfilter tabel */}
      <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Nilai Persediaan */}
        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Total Nilai Buku Persediaan
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <Boxes className="size-4 text-terra" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              <AnimatedNumber minor={totalValueMinor} />
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Metode: <strong className="text-ink font-medium">{isFifo ? "FIFO" : "Rata-Rata"}</strong></span>
              <span className="inline-flex items-center text-[11px] text-debit font-medium">
                <ShieldCheck className="size-3.5 mr-1" />
                Double-Entry Terikat
              </span>
            </div>
          </div>
        </StaggerItem>

        {/* Card 2: Total SKU Aktif */}
        <StaggerItem>
          <div className="relative p-5 sm:p-6 rounded-2xl bg-paper border border-rule shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Katalog Barang (SKU)
              </span>
              <div className="w-8 h-8 rounded-lg bg-canvas border border-rule flex items-center justify-center">
                <Layers className="size-4 text-ink" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight text-ink tnum">
              {initialData.totalSku}{" "}
              <span className="text-sm font-sans text-ink-soft font-normal">
                SKU Terdaftar
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Sistem Pencatatan:</span>
              <span className="font-medium text-ink font-mono text-[11px]">
                {isPeriodic ? "PERIODIK (FISIK)" : "PERPETUAL (REAL-TIME)"}
              </span>
            </div>
          </div>
        </StaggerItem>

        {/* Card 3: Peringatan Stok Kritis */}
        <StaggerItem>
          <div className={`relative p-5 sm:p-6 rounded-2xl border shadow-xs hover:shadow-sm transition-shadow ${
            initialData.lowStockCount > 0
              ? "bg-[color-mix(in_oklab,var(--color-terra)_4%,var(--color-paper))] border-[color-mix(in_oklab,var(--color-terra)_30%,var(--color-rule))]"
              : "bg-paper border-rule"
          }`}>
            <div className="flex items-center justify-between text-ink-soft mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Peringatan Stok Kritis
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                initialData.lowStockCount > 0
                  ? "bg-[color-mix(in_oklab,var(--color-terra)_12%,var(--color-paper))] border-terra text-terra"
                  : "bg-canvas border-rule text-ink-soft"
              }`}>
                <AlertTriangle className="size-4" />
              </div>
            </div>
            <div className="text-3xl font-display font-semibold tracking-tight tnum text-ink">
              {initialData.lowStockCount}{" "}
              <span className="text-sm font-sans text-ink-soft font-normal">
                Barang Menipis
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between text-xs text-ink-soft">
              <span>Ambang Restock:</span>
              <span className={initialData.lowStockCount > 0 ? "font-medium text-terra" : "text-ink-soft"}>
                {initialData.lowStockCount > 0 ? "Perlu Pembelian Ulang" : "Stok Cukup"}
              </span>
            </div>
          </div>
        </StaggerItem>
      </Stagger>

      {/* Tabel Data Katalog — Swiss 2.0 Editorial */}
      <Reveal delay={0.08}>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          {/* Toolbar: pencarian + satu pintu Filter */}
          <div className="flex flex-col gap-3 border-b border-rule bg-canvas/30 p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
                <Input
                  placeholder="Cari kode SKU, nama barang, atau kategori..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-sm bg-paper border-rule rounded-xl focus:ring-terra/30"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilterOpen(true)}
                data-testid="katalog-filter-button"
                className={cn(
                  "h-9 shrink-0 rounded-xl px-3.5 text-xs font-medium transition-colors",
                  filterCount > 0
                    ? "border-terra/40 bg-terra/10 text-terra hover:bg-terra/15"
                    : "border-rule bg-paper text-ink hover:bg-canvas",
                )}
              >
                <SlidersHorizontal className="size-4" />
                Filter
                {filterCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-terra px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {filterCount}
                  </span>
                )}
              </Button>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" data-testid="katalog-filter-chips">
                {chips.map((c) => (
                  <span
                    key={c.key}
                    className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper px-2.5 py-1 text-[11px] font-medium text-ink"
                  >
                    {c.label}
                    <button
                      type="button"
                      aria-label={`Hapus filter ${c.label}`}
                      onClick={c.clear}
                      className="text-ink-soft transition-colors hover:text-terra"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-1 text-[11px] font-medium text-terra hover:underline"
                >
                  Bersihkan
                </button>
              </div>
            )}
          </div>

          {/* Table Data */}
          <div className="overflow-x-auto min-w-full">
            <table className="w-full min-w-[900px] table-fixed text-sm text-left border-collapse data-table">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/60 border-b border-rule">
                <tr>
                  <th className="w-[72px] py-3 px-4 font-medium">Foto</th>
                  <th className="w-[110px] py-3 px-5 font-medium">Kode SKU</th>
                  <th className="py-3 px-5 font-medium">Nama Barang</th>
                  <th className="w-[170px] py-3 px-4 font-medium">Kategori</th>
                  <th className="w-[150px] py-3 px-5 font-medium text-right">Kuantitas Saldo</th>
                  <th className="w-[140px] py-3 px-5 font-medium text-right">Harga Modal</th>
                  <th className="w-[170px] py-3 px-5 font-medium text-right">Total Nilai Buku</th>
                  <th className="w-[120px] py-3 px-5 font-medium text-center">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-ink-soft">
                      <Package className="size-8 mx-auto text-ink-soft/40 mb-2" />
                      {filterCount > 0 || searchTerm ? (
                        <>
                          <p className="font-serif text-base text-ink font-medium">
                            Tidak ada item cocok dengan filter
                          </p>
                          <p className="text-xs mt-1">
                            Coba longgarkan filter atau bersihkan untuk melihat seluruh katalog.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              clearFilters();
                              setSearchTerm("");
                            }}
                            className="mt-3 h-8 rounded-xl text-xs"
                          >
                            Bersihkan filter &amp; pencarian
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="font-serif text-base text-ink font-medium">
                            {filters.jenis === "jasa"
                              ? filters.status === "arsip"
                                ? "Tidak ada jasa arsip"
                                : "Belum ada jasa"
                              : filters.status === "arsip"
                                ? "Tidak ada arsip"
                                : "Belum ada barang persediaan"}
                          </p>
                          <p className="text-xs mt-1">
                            {filters.jenis === "jasa"
                              ? "Gunakan tombol \"Tambah Jasa\" untuk mendaftarkan layanan baru."
                              : filters.status === "arsip"
                                ? "Item yang diarsipkan akan muncul di sini dan bisa diaktifkan lagi dari halaman rincian."
                                : "Gunakan tombol \"Tambah Barang\" untuk mencatatkan master barang baru."}
                          </p>
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isBarang = item.kind === "BARANG";
                    const isLow = isBarang && Number(item.currentQty) <= Number(item.minStockAlert);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-canvas/40 transition-colors group"
                      >
                        <td className="py-3 px-4">
                          {isBarang && item.imageStorageKey ? (
                            <img
                              src={`/api/inventory/${item.id}/photo`}
                              alt={item.name}
                              loading="lazy"
                              className="size-8 rounded-lg object-cover border border-rule"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : (
                            <span className="flex size-8 items-center justify-center rounded-lg border border-rule bg-canvas">
                              {isBarang ? (
                                <Package className="size-4 text-ink-soft/40" />
                              ) : (
                                <Wrench className="size-4 text-terra/70" />
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 font-mono text-xs font-semibold text-ink">
                          {item.code}
                        </td>
                        <td className="py-3.5 px-5 font-medium text-ink">
                          {item.name}
                          {!isBarang && (
                            <span className="ml-2 inline-flex rounded-full bg-terra/10 px-2 py-0.5 text-[10px] font-bold text-terra">
                              Jasa
                            </span>
                          )}
                          {filters.status === "arsip" && (
                            <span className="ml-2 inline-flex rounded-full bg-terra/10 px-2 py-0.5 text-[10px] font-bold text-terra">
                              Arsip
                            </span>
                          )}
                          {isBarang && item.appBarcode && (
                            <span className="block text-[11px] font-mono text-ink-soft">
                              App: {item.appBarcode}
                            </span>
                          )}
                          {item.barcode && (
                            <span className="block text-[11px] font-mono text-ink-soft">
                              Pabrik: {item.barcode}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-canvas text-ink-soft border border-rule">
                            {item.category || "Umum"}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum">
                          {isBarang ? (
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {isLow && (
                                <span
                                  title="Kuantitas berada pada atau di bawah batas minimum"
                                  className="size-1.5 rounded-full bg-terra animate-pulse"
                                />
                              )}
                              <span className={`font-semibold ${isLow ? "text-terra" : "text-ink"}`}>
                                {Number(item.currentQty).toLocaleString("id-ID")}
                              </span>
                              <span className="text-xs text-ink-soft">{item.unit}</span>
                            </div>
                          ) : (
                            <span className="text-ink-soft">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum text-ink-soft">
                          {isBarang ? Money.fromMinor(item.averageCostMinor).formatIdr() : "—"}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum font-semibold text-ink">
                          {isBarang ? Money.fromMinor(item.totalCostMinor).formatIdr() : "—"}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <Link href={item.href}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-ink hover:text-terra hover:bg-canvas rounded-lg"
                            >
                              {isBarang ? "Mutasi" : "Rincian"}
                              <ArrowUpRight className="size-3.5 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot className="bg-canvas/50 border-t-2 border-rule font-mono text-xs">
                  <tr>
                    <td colSpan={4} className="py-3.5 px-5 font-semibold text-ink uppercase tracking-wider text-[11px]">
                      Total Saldo Barang Terpilih
                    </td>
                    <td className="py-3.5 px-5 text-right font-semibold text-ink tnum">
                      {filteredItems
                        .reduce((sum, it) => sum + Number(it.currentQty), 0)
                        .toLocaleString("id-ID")}{" "}
                      Unit
                    </td>
                    <td className="py-3.5 px-5 text-right text-ink-soft">-</td>
                    <td className="py-3.5 px-5 text-right font-bold text-ink tnum text-sm">
                      {Money.fromMinor(
                        filteredItems.reduce((acc, it) => acc + it.totalCostMinor, 0n),
                      ).formatIdr()}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </Reveal>

      <KatalogFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        categories={categoryOptions}
        jenisCounts={{
          semua: barangRows.length + jasaRows.length,
          barang: barangRows.length,
          jasa: jasaRows.length,
        }}
        statusCounts={{
          aktif: initialData.items.length + jasaItems.length,
          arsip: (initialData.archivedItems ?? []).length + archivedJasaItems.length,
        }}
      />
    </div>
  );
}
