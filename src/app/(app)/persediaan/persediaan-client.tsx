"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Boxes,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Search,
  SlidersHorizontal,
  Package,
  Layers,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { CreateItemDialog } from "./_components/item-dialog";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header Banner Editorial & Aksi */}
      <Reveal>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-6 border-b border-[var(--color-rule)]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wide bg-[var(--color-canvas)] text-[var(--color-ink-soft)] border border-[var(--color-rule)]">
                <Package className="w-3 h-3 text-[var(--color-terra)]" />
                Ledger Persediaan & Fisik
              </span>
              <span className="text-[11px] font-mono text-[var(--color-ink-soft)]">•</span>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-soft)]">
                {isFifo ? "FIFO (Layer Masuk)" : "Rata-Rata Bergerak"}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[var(--color-ink)] font-normal">
              Persediaan & Mutasi Stok
            </h1>
            <p className="text-sm text-[var(--color-ink-soft)] mt-1.5 max-w-2xl leading-relaxed">
              Pemantauan buku saldo barang dagang, kalkulasi valuasi modal per unit, dan rekonsiliasi hitung fisik via opname.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/persediaan/opname">
              <Button
                variant="outline"
                className="h-10 px-4 rounded-[var(--radius-lg)] border-[var(--color-rule)] bg-[var(--color-paper)] hover:bg-[var(--color-canvas)] text-[var(--color-ink)] font-medium transition-colors"
              >
                <ClipboardCheck className="w-4 h-4 mr-2 text-[var(--color-terra)]" />
                Sesi Stok Opname
                {initialData.opnames.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--color-canvas)] text-[var(--color-ink-soft)]">
                    {initialData.opnames.length}
                  </span>
                )}
              </Button>
            </Link>
            <CreateItemDialog />
          </div>
        </div>
      </Reveal>

      {/* KPI Cards — Bolder, Tonal Paper & Ink Elevation */}
      <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Nilai Persediaan */}
        <StaggerItem>
          <div className="relative p-6 rounded-[var(--radius-xl)] bg-[var(--color-paper)] border border-[var(--color-rule)] shadow-[var(--elevation-sm)] hover:shadow-[var(--elevation-md)] transition-shadow">
            <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Total Nilai Buku Persediaan
              </span>
              <div className="w-8 h-8 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-rule)] flex items-center justify-center">
                <Boxes className="w-4 h-4 text-[var(--color-terra)]" />
              </div>
            </div>
            <div className="text-3xl font-serif font-normal tracking-tight text-[var(--color-ink)] tnum">
              <AnimatedNumber minor={totalValueMinor} />
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--color-rule)]/60 flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
              <span>Metode: <strong className="text-[var(--color-ink)]">{isFifo ? "FIFO" : "Average"}</strong></span>
              <span className="inline-flex items-center text-[11px] text-[var(--color-debit)]">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                Double-Entry Terikat
              </span>
            </div>
          </div>
        </StaggerItem>

        {/* Card 2: Total SKU Aktif */}
        <StaggerItem>
          <div className="relative p-6 rounded-[var(--radius-xl)] bg-[var(--color-paper)] border border-[var(--color-rule)] shadow-[var(--elevation-sm)] hover:shadow-[var(--elevation-md)] transition-shadow">
            <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Katalog Barang (SKU)
              </span>
              <div className="w-8 h-8 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-rule)] flex items-center justify-center">
                <Layers className="w-4 h-4 text-[var(--color-ink)]" />
              </div>
            </div>
            <div className="text-3xl font-serif font-normal tracking-tight text-[var(--color-ink)] tnum">
              {initialData.totalSku}{" "}
              <span className="text-base font-sans text-[var(--color-ink-soft)] font-normal">
                SKU Aktif
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--color-rule)]/60 flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
              <span>Sistem Pencatatan:</span>
              <span className="font-medium text-[var(--color-ink)] font-mono text-[11px]">
                {isPeriodic ? "PERIODIK (FISIK)" : "PERPETUAL (REAL-TIME)"}
              </span>
            </div>
          </div>
        </StaggerItem>

        {/* Card 3: Peringatan Stok Kritis */}
        <StaggerItem>
          <div className={`relative p-6 rounded-[var(--radius-xl)] border shadow-[var(--elevation-sm)] hover:shadow-[var(--elevation-md)] transition-shadow ${
            initialData.lowStockCount > 0
              ? "bg-[color-mix(in_oklab,var(--color-terra)_3%,var(--color-paper))] border-[color-mix(in_oklab,var(--color-terra)_25%,var(--color-rule))]"
              : "bg-[var(--color-paper)] border-[var(--color-rule)]"
          }`}>
            <div className="flex items-center justify-between text-[var(--color-ink-soft)] mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-medium">
                Peringatan Stok Kritis
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                initialData.lowStockCount > 0
                  ? "bg-[color-mix(in_oklab,var(--color-terra)_12%,var(--color-paper))] border-[var(--color-terra)] text-[var(--color-terra)]"
                  : "bg-[var(--color-canvas)] border-[var(--color-rule)] text-[var(--color-ink-soft)]"
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-serif font-normal tracking-tight tnum text-[var(--color-ink)]">
              {initialData.lowStockCount}{" "}
              <span className="text-base font-sans text-[var(--color-ink-soft)] font-normal">
                Barang Menipis
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--color-rule)]/60 flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
              <span>Batas Restock</span>
              <span className={initialData.lowStockCount > 0 ? "font-medium text-[var(--color-terra)]" : "text-[var(--color-ink-soft)]"}>
                {initialData.lowStockCount > 0 ? "Perlu Pemesanan Ulang" : "Kondisi Stok Aman"}
              </span>
            </div>
          </div>
        </StaggerItem>
      </Stagger>

      {/* Tabel Data Ledger Persediaan — Swiss 2.0 Editorial */}
      <Reveal delay={0.1}>
        <div className="border border-[var(--color-rule)] rounded-[var(--radius-2xl)] bg-[var(--color-paper)] overflow-hidden shadow-[var(--elevation-sm)]">
          {/* Toolbar Pencarian & Filter */}
          <div className="p-4 sm:p-5 border-b border-[var(--color-rule)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--color-canvas)]/30">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
              <Input
                placeholder="Cari SKU, nama barang, atau kategori..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-[var(--color-paper)] border-[var(--color-rule)] rounded-[var(--radius-lg)] focus:ring-[var(--color-terra)]/30"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedCategory("ALL")}
                className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-mono transition-colors ${
                  selectedCategory === "ALL"
                    ? "bg-[var(--color-ink)] text-[var(--color-paper)] font-medium"
                    : "bg-[var(--color-canvas)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] border border-[var(--color-rule)]"
                }`}
              >
                Semua ({initialData.items.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-mono transition-colors whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-[var(--color-ink)] text-[var(--color-paper)] font-medium"
                      : "bg-[var(--color-canvas)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] border border-[var(--color-rule)]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Table Body */}
          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-[var(--color-ink-soft)] bg-[var(--color-canvas)]/60 border-b border-[var(--color-rule)]">
                <tr>
                  <th className="py-3 px-5 font-medium">Kode SKU</th>
                  <th className="py-3 px-5 font-medium">Nama Barang</th>
                  <th className="py-3 px-4 font-medium">Kategori</th>
                  <th className="py-3 px-5 font-medium text-right">Kuantitas Saldo</th>
                  <th className="py-3 px-5 font-medium text-right">Modal / Unit</th>
                  <th className="py-3 px-5 font-medium text-right">Total Nilai Buku</th>
                  <th className="py-3 px-5 font-medium text-center">Kartu Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]/60">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-[var(--color-ink-soft)]">
                      <Package className="w-8 h-8 mx-auto text-[var(--color-ink-soft)]/40 mb-2" />
                      <p className="font-serif text-base text-[var(--color-ink)]">Belum ada data barang ditemukan</p>
                      <p className="text-xs mt-1">Gunakan tombol "Tambah Barang" untuk mencatatkan stok awal Anda.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isLow = Number(item.currentQty) <= Number(item.minStockAlert);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--color-canvas)]/40 transition-colors group"
                      >
                        <td className="py-3.5 px-5 font-mono text-xs font-semibold text-[var(--color-ink)]">
                          {item.code}
                        </td>
                        <td className="py-3.5 px-5 font-medium text-[var(--color-ink)]">
                          {item.name}
                          {item.barcode && (
                            <span className="block text-[11px] font-mono text-[var(--color-ink-soft)]">
                              Barcode: {item.barcode}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-[var(--color-canvas)] text-[var(--color-ink-soft)] border border-[var(--color-rule)]">
                            {item.category || "Umum"}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum">
                          <div className="inline-flex items-center gap-1.5">
                            {isLow && (
                              <span
                                title="Stok berada di bawah batas minimum"
                                className="w-1.5 h-1.5 rounded-full bg-[var(--color-terra)] animate-pulse"
                              />
                            )}
                            <span className={`font-semibold ${isLow ? "text-[var(--color-terra)]" : "text-[var(--color-ink)]"}`}>
                              {Number(item.currentQty).toLocaleString("id-ID")}
                            </span>
                            <span className="text-xs text-[var(--color-ink-soft)]">{item.unit}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum text-[var(--color-ink-soft)]">
                          {Money.fromMinor(item.averageCostMinor).formatIdr()}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono tnum font-semibold text-[var(--color-ink)]">
                          {Money.fromMinor(item.totalCostMinor).formatIdr()}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <Link href={`/persediaan/${item.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-[var(--color-ink)] hover:text-[var(--color-terra)] hover:bg-[var(--color-canvas)] group-hover:border-[var(--color-rule)]"
                            >
                              Mutasi
                              <ArrowUpRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot className="bg-[var(--color-canvas)]/40 border-t border-[var(--color-rule)] font-mono text-xs">
                  <tr>
                    <td colSpan={3} className="py-3 px-5 font-semibold text-[var(--color-ink)] uppercase tracking-wider text-[11px]">
                      Total Ringkasan Buku
                    </td>
                    <td className="py-3 px-5 text-right font-semibold text-[var(--color-ink)] tnum">
                      {filteredItems
                        .reduce((sum, it) => sum + Number(it.currentQty), 0)
                        .toLocaleString("id-ID")}{" "}
                      Unit
                    </td>
                    <td className="py-3 px-5 text-right text-[var(--color-ink-soft)]">-</td>
                    <td className="py-3 px-5 text-right font-bold text-[var(--color-ink)] tnum text-sm">
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
