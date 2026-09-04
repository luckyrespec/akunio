"use client";

import * as React from "react";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Table,
  Loader2,
  Download,
  Upload,
  Info,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
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
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCellChange = (id: string, field: keyof BatchRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const addRow = () => {
    const newId = String(Date.now()) + Math.random().toString(36).substring(2, 5);
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

  const addMultipleRows = (count: number) => {
    const newRows: BatchRow[] = [];
    for (let i = 0; i < count; i++) {
      newRows.push({
        id: String(Date.now() + i) + Math.random().toString(36).substring(2, 5),
        code: "",
        name: "",
        category: "",
        unit: "Pcs",
        initialQty: 0,
        initialCostText: "",
        standardSellingPriceText: "",
        minStockAlert: "5",
      });
    }
    setRows((prev) => [...prev, ...newRows]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      setRows([
        {
          id: "1",
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
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const validRowsCount = rows.filter((r) => r.code.trim() && r.name.trim()).length;

  // 1. Download Template CSV / Excel
  const handleDownloadTemplate = () => {
    const headers = [
      "Kode SKU",
      "Nama Barang",
      "Kategori",
      "Satuan",
      "Stok Awal",
      "Harga Modal",
      "Harga Jual",
      "Min Stok",
    ];

    const sampleRows = [
      ["BRG-001", "Kertas HVS A4 70gr", "Alat Tulis", "Rim", "10", "45000", "55000", "5"],
      ["BRG-002", "Pulpen Gel Hitam 0.5", "Alat Tulis", "Lusin", "25", "30000", "38000", "10"],
      ["BRG-003", "Buku Tulis Sinar 38", "Buku", "Pak", "15", "25000", "32000", "5"],
    ];

    const escapeCsvValue = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvContent = [
      headers.join(","),
      ...sampleRows.map((r) => r.map(escapeCsvValue).join(",")),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "template_import_persediaan_akunio.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper parser baris CSV sederhana dengan dukungan kutip ganda
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  // 2. Import CSV / Excel file dan masukkan ke grid
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setImportSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        if (!text) throw new Error("File kosong");

        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length <= 1) {
          setError("File template tidak memiliki baris data untuk diimpor.");
          return;
        }

        // Baris 0 adalah Header
        const dataLines = lines.slice(1);
        const importedRows: BatchRow[] = [];

        dataLines.forEach((line, idx) => {
          const cols = parseCsvLine(line);
          if (!cols || cols.length === 0) return;

          const code = (cols[0] || "").trim().toUpperCase();
          const name = (cols[1] || "").trim();
          const category = (cols[2] || "").trim();
          const unit = (cols[3] || "").trim() || "Pcs";
          const initialQty = Number(cols[4]?.replace(/[^0-9.-]+/g, "")) || 0;
          const initialCostText = (cols[5] || "").replace(/[^0-9]/g, "");
          const standardSellingPriceText = (cols[6] || "").replace(/[^0-9]/g, "");
          const minStockAlert = (cols[7] || "").replace(/[^0-9]/g, "") || "5";

          // Hanya masukkan jika minimal kode atau nama tidak kosong sama sekali
          if (code || name) {
            importedRows.push({
              id: String(Date.now() + idx) + Math.random().toString(36).substring(2, 5),
              code,
              name,
              category,
              unit,
              initialQty,
              initialCostText,
              standardSellingPriceText,
              minStockAlert,
            });
          }
        });

        if (importedRows.length === 0) {
          setError("Tidak ada data barang yang valid dalam file yang diunggah.");
          return;
        }

        // Gabungkan dengan baris yang sudah ada atau gantikan baris default yang masih kosong
        setRows((prev) => {
          const existingNonEmpty = prev.filter((r) => r.code.trim() || r.name.trim());
          return [...existingNonEmpty, ...importedRows];
        });

        setImportSuccessMessage(
          `Berhasil memuat ${importedRows.length} baris barang dari file ke dalam grid. Silakan tinjau dan lengkapi sebelum disimpan.`
        );
      } catch (err: any) {
        setError(`Gagal membaca file: ${err?.message || "Format file tidak valid."}`);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      setError("Terjadi kesalahan saat membaca file.");
    };

    reader.readAsText(file);
  };

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

      {/* Hidden File Input for CSV / Excel */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Page Header */}
      <PageHeader
        title="Input Cepat Barang Persediaan (Grid / Batch)"
        eyebrow="Isi tabel massal seperti spreadsheet Excel atau impor template file untuk mendaftarkan puluhan SKU sekaligus."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="h-9 px-3 text-xs font-medium border-rule bg-paper hover:bg-canvas text-ink transition-colors"
            >
              <Download className="size-3.5 mr-1.5 text-terra" />
              Download Template
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-3 text-xs font-medium border-rule bg-paper hover:bg-canvas text-ink transition-colors"
            >
              <Upload className="size-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              Impor File (.csv)
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/persediaan")}
              className="h-9 px-3 text-xs font-medium border-rule"
            >
              Batal
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isPending || validRowsCount === 0}
              className="h-9 px-4 bg-terra text-white hover:bg-terra/90 text-xs font-semibold shadow-xs transition-transform active:scale-[0.98] disabled:transform-none"
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
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {importSuccessMessage && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{importSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessMessage(null)}
            className="text-[11px] underline text-emerald-700 dark:text-emerald-300 font-medium hover:opacity-80"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Spreadsheet Grid Container */}
      <Reveal>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          <div className="p-4 border-b border-rule flex flex-wrap items-center justify-between gap-3 bg-canvas/30">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-terra/10 border border-terra/20 text-terra">
                <FileSpreadsheet className="size-4" />
              </div>
              <div>
                <span className="font-display font-medium text-sm text-ink block">
                  Grid Input Massal
                </span>
                <span className="text-[11px] font-mono text-ink-soft">
                  {validRowsCount} dari {rows.length} baris siap disimpan
                </span>
              </div>
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
                Tambah 1 Baris
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addMultipleRows(5)}
                className="h-8 text-xs font-mono border-rule bg-paper"
              >
                <Plus className="size-3.5 mr-1" />
                Tambah 5 Baris
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
                    <tr
                      key={row.id}
                      className={`hover:bg-canvas/30 transition-colors ${
                        isValid ? "bg-emerald-500/[0.02]" : ""
                      }`}
                    >
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
                          className="h-7 w-7 p-0 text-ink-soft hover:text-terra"
                          title="Hapus baris"
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

          <div className="p-3.5 border-t border-rule bg-canvas/30 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Info className="size-3.5 text-terra" />
              Baris kosong (tanpa SKU &amp; Nama) akan diabaikan secara otomatis saat disimpan. Anda juga bisa mengedit manual setiap kolom setelah impor.
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="h-7 text-xs font-mono text-ink hover:text-terra"
              >
                + Tambah Baris
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </form>
  );
}
