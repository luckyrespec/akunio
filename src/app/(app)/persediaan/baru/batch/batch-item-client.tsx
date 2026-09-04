"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Table,
  Loader2,
  Sparkles,
  Info,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/motion";
import { createBatchItemsAction } from "@/server/actions/inventory.actions";

interface BatchRow {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  initialQty: number;
  initialCostText: string;
  standardSellingPriceText: string;
  minStockAlert: string;
}

const DEFAULT_ROWS: BatchRow[] = [
  { id: "1", code: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "2", code: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "3", code: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "4", code: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "5", code: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
];

export function BatchItemClient() {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>(DEFAULT_ROWS);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCellChange = (id: string, field: keyof BatchRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const addRow = () => {
    const newId = String(Date.now());
    setRows((prev) => [
      ...prev,
      {
        id: newId,
        code: "",
        name: "",
        category: "",
        unit: "Pcs",
        initialQty: 0,
        initialCostText: "",
        standardSellingPriceText: "",
        minStockAlert: "5",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const validRowsCount = rows.filter((r) => r.code.trim() && r.name.trim()).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validRows = rows.filter((r) => r.code.trim() && r.name.trim());
    if (validRows.length === 0) {
      setError("Isi minimal 1 baris barang dengan Kode SKU dan Nama Barang yang valid.");
      return;
    }

    startTransition(async () => {
      const res = await createBatchItemsAction(validRows);
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan batch barang");
      } else {
        router.push("/persediaan");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/persediaan"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Katalog Persediaan
        </Link>
      </div>

      {/* Page Header */}
      <PageHeader
        title="Input Cepat Barang Persediaan (Grid / Batch)"
        eyebrow="Isi tabel massal seperti spreadsheet Excel untuk mendaftarkan banyak SKU sekaligus."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/persediaan")}
              className="h-9 px-4 text-xs font-medium border-rule"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || validRowsCount === 0}
              className="h-9 px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold shadow-xs transition-transform active:scale-[0.98] disabled:transform-none"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Menyimpan...
                </>
              ) : (
                `Simpan ${validRowsCount} Barang Sekaligus`
              )}
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Spreadsheet Grid Container */}
      <Reveal>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          <div className="p-4 border-b border-rule flex items-center justify-between bg-canvas/30">
            <div className="flex items-center gap-2">
              <Table className="size-4 text-terra" />
              <span className="font-display font-medium text-sm text-ink">
                Grid Input Massal ({validRowsCount} baris siap simpan)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                className="h-8 text-xs font-mono border-rule bg-paper"
              >
                <Plus className="size-3.5 mr-1" />
                Tambah Baris
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-sm text-left border-collapse data-table">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/60 border-b border-rule">
                <tr>
                  <th className="py-2.5 px-3 font-medium w-12 text-center">#</th>
                  <th className="py-2.5 px-3 font-medium w-36">Kode SKU *</th>
                  <th className="py-2.5 px-3 font-medium min-w-[200px]">Nama Barang *</th>
                  <th className="py-2.5 px-3 font-medium w-36">Kategori</th>
                  <th className="py-2.5 px-3 font-medium w-24">Satuan</th>
                  <th className="py-2.5 px-3 font-medium text-right w-24">Stok Awal</th>
                  <th className="py-2.5 px-3 font-medium text-right w-32">Harga Modal</th>
                  <th className="py-2.5 px-3 font-medium text-right w-32">Harga Jual</th>
                  <th className="py-2.5 px-3 font-medium text-right w-24">Min. Stok</th>
                  <th className="py-2.5 px-3 font-medium w-12 text-center">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {rows.map((row, index) => {
                  const isValid = row.code.trim() && row.name.trim();
                  return (
                    <tr key={row.id} className="hover:bg-canvas/30 transition-colors">
                      <td className="py-2 px-3 text-center font-mono text-xs text-ink-soft">
                        {index + 1}
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          placeholder="BRG-001"
                          value={row.code}
                          onChange={(e) => handleCellChange(row.id, "code", e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          placeholder="Nama produk..."
                          value={row.name}
                          onChange={(e) => handleCellChange(row.id, "name", e.target.value)}
                          className="h-8 text-xs bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          placeholder="Alat Tulis"
                          value={row.category}
                          onChange={(e) => handleCellChange(row.id, "category", e.target.value)}
                          className="h-8 text-xs bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          placeholder="Pcs"
                          value={row.unit}
                          onChange={(e) => handleCellChange(row.id, "unit", e.target.value)}
                          className="h-8 text-xs bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          min="0"
                          value={row.initialQty}
                          onChange={(e) => handleCellChange(row.id, "initialQty", Number(e.target.value))}
                          className="h-8 text-xs text-right font-mono tnum bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          placeholder="0"
                          value={row.initialCostText}
                          onChange={(e) => handleCellChange(row.id, "initialCostText", e.target.value)}
                          className="h-8 text-xs text-right font-mono tnum bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          placeholder="0"
                          value={row.standardSellingPriceText}
                          onChange={(e) => handleCellChange(row.id, "standardSellingPriceText", e.target.value)}
                          className="h-8 text-xs text-right font-mono tnum bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          min="0"
                          value={row.minStockAlert}
                          onChange={(e) => handleCellChange(row.id, "minStockAlert", e.target.value)}
                          className="h-8 text-xs text-right font-mono tnum bg-canvas border-rule"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 1}
                          className="h-7 w-7 p-0 text-ink-soft hover:text-terra"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3.5 border-t border-rule bg-canvas/30 flex items-center justify-between text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Info className="size-3.5 text-terra" />
              Baris kosong (tanpa SKU &amp; Nama) akan diabaikan secara otomatis saat disimpan.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addRow}
              className="h-7 text-xs font-mono text-ink hover:text-terra"
            >
              + Baris Baru
            </Button>
          </div>
        </div>
      </Reveal>
    </form>
  );
}
