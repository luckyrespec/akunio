"use client";

import { useState } from "react";
import Link from "next/link";
import { Boxes, AlertTriangle, ArrowRight, ClipboardCheck } from "lucide-react";
import { CreateItemDialog } from "./_components/item-dialog";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const totalValue = Money.fromMinor(BigInt(initialData.totalValueMinor)).formatIdr();

  const filteredItems = initialData.items.filter(
    (it) =>
      it.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      it.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (it.category && it.category.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      {/* Header & Aksi */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight text-[var(--color-tinta)]">
            Persediaan & Stok
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Kelola katalog barang, pantau mutasi kartu stok, dan laksanakan stok opname.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/persediaan/opname">
            <Button variant="outline" className="border-[var(--color-border)]">
              <ClipboardCheck className="w-4 h-4 mr-1.5" />
              Sesi Stok Opname
            </Button>
          </Link>
          <CreateItemDialog />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] shadow-xs">
          <div className="flex items-center justify-between text-[var(--color-ink-muted)] mb-1">
            <span className="text-xs font-mono uppercase tracking-wider">Total Nilai Persediaan</span>
            <Boxes className="w-4 h-4 text-[var(--color-terra)]" />
          </div>
          <div className="text-2xl font-semibold font-mono text-[var(--color-tinta)]">
            {totalValue}
          </div>
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">
            Metode: {initialData.settings?.valuationMethod === "FIFO" ? "FIFO" : "Rata-Rata Bergerak"}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] shadow-xs">
          <div className="flex items-center justify-between text-[var(--color-ink-muted)] mb-1">
            <span className="text-xs font-mono uppercase tracking-wider">Total SKU Aktif</span>
            <Boxes className="w-4 h-4" />
          </div>
          <div className="text-2xl font-semibold font-mono text-[var(--color-tinta)]">
            {initialData.totalSku} Barang
          </div>
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">
            Sistem: {initialData.settings?.recordingMethod === "PERIODIC" ? "Periodik (Fisik)" : "Perpetual (Real-time)"}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] shadow-xs">
          <div className="flex items-center justify-between text-[var(--color-ink-muted)] mb-1">
            <span className="text-xs font-mono uppercase tracking-wider">Stok Kritis / Menipis</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-semibold font-mono text-amber-700">
            {initialData.lowStockCount} SKU
          </div>
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">Perlu pemesanan ulang</p>
        </div>
      </div>

      {/* Tabel Master Barang */}
      <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-paper)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between gap-4">
          <Input
            placeholder="Cari kode SKU, nama barang, atau kategori..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md bg-white/50"
          />
          <span className="text-xs text-[var(--color-ink-muted)]">
            Menampilkan {filteredItems.length} dari {initialData.items.length} barang
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase font-mono tracking-wider text-[var(--color-ink-muted)] bg-[var(--color-kanvas)]/50 border-b border-[var(--color-border)]">
              <tr>
                <th className="py-3 px-4">Kode SKU</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-right">Stok Fisik/Buku</th>
                <th className="py-3 px-4 text-right">Harga Modal</th>
                <th className="py-3 px-4 text-right">Total Nilai</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--color-ink-muted)]">
                    Belum ada data barang persediaan. Klik "Tambah Barang" untuk memulai.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isLow = Number(item.currentQty) <= Number(item.minStockAlert);
                  return (
                    <tr key={item.id} className="hover:bg-[var(--color-kanvas)]/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium">{item.code}</td>
                      <td className="py-3 px-4 font-medium">{item.name}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {item.category || "Umum"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span className={isLow ? "text-amber-700 font-semibold" : ""}>
                          {item.currentQty} {item.unit}
                        </span>
                        {isLow && (
                          <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-500" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--color-ink-muted)]">
                        {Money.fromMinor(item.averageCostMinor).formatIdr()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        {Money.fromMinor(item.totalCostMinor).formatIdr()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Link href={`/persediaan/${item.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                            Kartu Stok
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
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
