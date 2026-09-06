"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";

interface InventoryClientProps {
  initialData: {
    items: any[];
    settings: any;
    opnames: any[];
    totalValueMinor: string;
    totalSku: number;
    lowStockCount: number;
  };
}

export function PersediaanClient({ initialData }: InventoryClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const categories = Array.from(
    new Set(initialData.items.map((i) => i.category).filter(Boolean)),
  ) as string[];

  const filteredItems = initialData.items.filter((it) => {
    const matchesQuery =
      it.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      it.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (it.category && it.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory =
      selectedCategory === "ALL" || it.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  const totalValueMinor = BigInt(initialData.totalValueMinor);
  const isFifo = initialData.settings?.valuationMethod === "FIFO";
  const isPeriodic = initialData.settings?.recordingMethod === "PERIODIC";

  return (
    <div className="space-y-6">
      {/* Page Header seragam dengan /kontak dan /aset */}
      <PageHeader
        title="Persediaan & Mutasi Stok"
        eyebrow="Pemantauan buku saldo barang, kalkulasi harga modal per unit, dan opname fisik berkala."
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />

      {/* KPI Cards — Paper & Ink Matte Elevation */}
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

      {/* Tabel Data Ledger Persediaan — Swiss 2.0 Editorial */}
      <Reveal delay={0.08}>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          {/* Toolbar Pencarian & Filter Kategori */}
          <div className="p-4 border-b border-rule flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-canvas/30">
            <div className="relative flex-1 max-w-md">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <Input
                placeholder="Cari kode SKU, nama barang, atau kategori..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-paper border-rule rounded-xl focus:ring-terra/30"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === "ALL"}
                onClick={() => setSelectedCategory("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors ${
                  selectedCategory === "ALL"
                    ? "bg-ink text-paper"
                    : "bg-canvas text-ink-soft hover:text-ink border border-rule"
                }`}
              >
                Semua ({initialData.items.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-ink text-paper"
                      : "bg-canvas text-ink-soft hover:text-ink border border-rule"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Table Data */}
          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-sm text-left border-collapse data-table">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/60 border-b border-rule">
                <tr>
                  <th className="py-3 px-5 font-medium">Kode SKU</th>
                  <th className="py-3 px-5 font-medium">Nama Barang</th>
                  <th className="py-3 px-4 font-medium">Kategori</th>
                  <th className="py-3 px-5 font-medium text-right">Kuantitas Saldo</th>
                  <th className="py-3 px-5 font-medium text-right">Harga Modal</th>
                  <th className="py-3 px-5 font-medium text-right">Total Nilai Buku</th>
                  <th className="py-3 px-5 font-medium text-center">Kartu Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-ink-soft">
                      <Package className="size-8 mx-auto text-ink-soft/40 mb-2" />
                      <p className="font-serif text-base text-ink font-medium">Belum ada barang persediaan</p>
                      <p className="text-xs mt-1">Gunakan tombol "Tambah Barang" untuk mencatatkan master barang baru.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isLow = Number(item.currentQty) <= Number(item.minStockAlert);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-canvas/40 transition-colors group"
                      >
                        <td className="py-3.5 px-5 font-mono text-xs font-semibold text-ink">
                          {item.code}
                        </td>
                        <td className="py-3.5 px-5 font-medium text-ink">
                          {item.name}
                          {item.barcode && (
                            <span className="block text-[11px] font-mono text-ink-soft">
                              Barcode: {item.barcode}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-canvas text-ink-soft border border-rule">
                            {item.category || "Umum"}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum">
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
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum text-ink-soft">
                          {Money.fromMinor(item.averageCostMinor).formatIdr()}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum font-semibold text-ink">
                          {Money.fromMinor(item.totalCostMinor).formatIdr()}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <Link href={`/persediaan/daftar/${item.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-ink hover:text-terra hover:bg-canvas rounded-lg"
                            >
                              Mutasi
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
                    <td colSpan={3} className="py-3.5 px-5 font-semibold text-ink uppercase tracking-wider text-[11px]">
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
    </div>
  );
}
