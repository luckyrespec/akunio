"use client";

import * as React from "react";
import { useState, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Download,
  Upload,
  Info,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/motion";
import { createBatchItemsAction } from "@/server/actions/inventory.actions";

interface BatchRow {
  id: string;
  code: string;
  appBarcode: string;
  barcodePabrik: string;
  name: string;
  category: string;
  unit: string;
  initialQty: number;
  initialCostText: string;
  standardSellingPriceText: string;
  minStockAlert: string;
}

const DEFAULT_ROWS: BatchRow[] = [
  { id: "1", code: "", appBarcode: "", barcodePabrik: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "2", code: "", appBarcode: "", barcodePabrik: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "3", code: "", appBarcode: "", barcodePabrik: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "4", code: "", appBarcode: "", barcodePabrik: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
  { id: "5", code: "", appBarcode: "", barcodePabrik: "", name: "", category: "", unit: "Pcs", initialQty: 0, initialCostText: "", standardSellingPriceText: "", minStockAlert: "5" },
];

export function BatchItemClient() {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>(DEFAULT_ROWS);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Kolom opsional yang disembunyikan user (display saja — nilai tetap ikut tersimpan).
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

const OPTIONAL_COLS = [
  { key: "appBarcode", label: "App-barcode" },
  { key: "barcodePabrik", label: "Barcode Pabrik" },
  { key: "category", label: "Kategori" },
  { key: "unit", label: "Satuan" },
  { key: "initialQty", label: "Stok Awal" },
  { key: "initialCostText", label: "Harga Modal" },
  { key: "standardSellingPriceText", label: "Harga Jual" },
  { key: "minStockAlert", label: "Min. Stok" },
] as const;

function OptionalBadge() {
  return (
    <span className="ml-1.5 rounded border border-rule bg-canvas px-1 py-px font-sans text-[9px] normal-case tracking-normal text-ink-soft">
      opsional
    </span>
  );
}

  const handleCellChange = (id: string, field: keyof BatchRow, value: string | number) => {
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
        appBarcode: "",
        barcodePabrik: "",
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
        appBarcode: "",
        barcodePabrik: "",
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
          appBarcode: "",
          barcodePabrik: "",
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

  const validRows = useMemo(
    () => rows.filter((r) => r.name.trim()),
    [rows]
  );
  const validRowsCount = validRows.length;

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
      "App-barcode",
      "Barcode Pabrik",
    ];

    const sampleRows = [
      ["BRG-001", "Kertas HVS A4 70gr", "Alat Tulis", "Rim", "10", "45000", "55000", "5", "20000001", "8991234567890"],
      ["BRG-002", "Pulpen Gel Hitam 0.5", "Alat Tulis", "Lusin", "25", "30000", "38000", "10", "20000002", ""],
      ["BRG-003", "Buku Tulis Sinar 38", "Buku", "Pak", "15", "25000", "32000", "5", "20000003", ""],
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

  // 2. Import CSV dan masukkan ke grid (CSV saja — .xlsx tidak didukung, parser teks akan rusak untuk biner)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setImportSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv")) {
      setError("Format tidak didukung: unggah file .csv (ekspor spreadsheet Anda sebagai CSV UTF-8). File .xlsx tidak dapat dibaca langsung.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

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

          if (code || name) {
            importedRows.push({
              id: String(Date.now() + idx) + Math.random().toString(36).substring(2, 5),
              code,
              appBarcode: (cols[8] || "").trim(),
              barcodePabrik: (cols[9] || "").trim(),
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

        setRows((prev) => {
          const existingNonEmpty = prev.filter((r) => r.code.trim() || r.name.trim());
          return [...existingNonEmpty, ...importedRows];
        });

        setImportSuccessMessage(
          `Berhasil memuat ${importedRows.length} baris barang dari file ke dalam grid. Silakan tinjau dan lengkapi sebelum disimpan.`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Format file tidak valid.";
        setError(`Gagal membaca file: ${message}`);
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
    setImportSuccessMessage(null);

    if (validRows.length === 0) {
      setError("Isi minimal 1 baris barang dengan Nama Barang yang valid (Kode SKU boleh kosong = otomatis).");
      return;
    }

    startTransition(async () => {
      const res = await createBatchItemsAction(validRows.map((r) => ({
        code: r.code || undefined,
        appBarcode: r.appBarcode || undefined,
        barcode: r.barcodePabrik || undefined,
        name: r.name,
        category: r.category,
        unit: r.unit,
        initialQty: r.initialQty,
        initialCostText: r.initialCostText,
        standardSellingPriceText: r.standardSellingPriceText,
        minStockAlert: r.minStockAlert,
      })));
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan batch barang");
      } else if (res.errors && res.errors.length > 0) {
        const detail = res.errors.slice(0, 3).map((er: { code: string; message: string }) => `${er.code}: ${er.message}`).join("; ");
        setError(`Tersimpan ${res.count} barang, ${res.errors.length} baris gagal: ${detail}`);
      } else {
        if (res.skipped && res.skipped.length > 0) {
          setImportSuccessMessage(`Tersimpan ${res.count} barang. ${res.skipped.length} baris kosong dilewati.`);
        }
        router.push("/persediaan/daftar");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-6"
      data-assistant-context="Halaman Input Cepat Barang Persediaan (Grid / Batch). Pengguna dapat mengisi massal tabel SKU atau meminta asisten mengekstrak file CSV ke dalam katalog persediaan."
    >
      {/* Back Link */}
      <div className="mb-2">
        <Link
          href="/persediaan/daftar"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Katalog Persediaan
        </Link>
      </div>

      {/* Hidden File Input for CSV */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Page Header — Editorial Fraunces Title */}
      <PageHeader
        title="Input Cepat Barang Persediaan"
        eyebrow="Isi tabel massal mirip spreadsheet Excel atau unggah template CSV untuk mendaftarkan puluhan SKU sekaligus."
        actions={
          <div className="flex items-center gap-2">
            {/* Desktop Actions (>1024px / lg) */}
            <div className="hidden xl:flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="h-9 px-3 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
              >
                <Download className="size-3.5 mr-1.5 text-terra" />
                Template
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
              >
                <Upload className="size-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                Impor CSV
              </Button>
            </div>

            {/* Responsive Dropdown for Smaller Screens (<= 1280px) */}
            <div className="flex xl:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
                  >
                    <FileSpreadsheet className="size-3.5 mr-1.5 text-terra" />
                    Opsi Berkas
                    <ChevronDown className="size-3.5 ml-1.5 text-ink-soft" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl border-rule bg-paper p-1.5 shadow-md">
                  <DropdownMenuItem
                    onClick={handleDownloadTemplate}
                    className="cursor-pointer rounded-lg text-xs font-medium text-ink focus:bg-canvas py-2"
                  >
                    <Download className="size-3.5 mr-2 text-terra" />
                    <span>Download Template CSV</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-lg text-xs font-medium text-ink focus:bg-canvas py-2"
                  >
                    <Upload className="size-3.5 mr-2 text-emerald-600 dark:text-emerald-400" />
                    <span>Impor Berkas (.csv)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/persediaan/daftar")}
              className="h-9 px-3.5 text-xs font-medium rounded-xl border-rule bg-paper text-ink-soft hover:text-ink transition-colors"
            >
              Batal
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isPending || validRowsCount === 0}
              className="h-9 px-4 sm:px-5 rounded-xl bg-terra text-white hover:bg-terra/90 text-xs font-semibold shadow-xs transition-transform active:scale-[0.98] disabled:transform-none shrink-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Menyimpan...
                </>
              ) : (
                `Simpan ${validRowsCount} Barang`
              )}
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="size-4 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {importSuccessMessage && (
        <div role="status" className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{importSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessMessage(null)}
            className="text-[11px] underline text-emerald-700 dark:text-emerald-300 font-bold hover:opacity-80 ml-4 shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Spreadsheet Grid Container — Swiss 2.0 Typography & Table Rhythm */}
      <Reveal>
        <div className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs">
          {/* Table Toolbar */}
          <div className="p-4 sm:p-5 border-b border-rule flex flex-wrap items-center justify-between gap-3 bg-canvas/40">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-terra/10 border border-terra/20 text-terra shadow-xs">
                <FileSpreadsheet className="size-4" />
              </div>
              <div>
                <span className="font-display font-medium text-base text-ink block leading-snug">
                  Lembar Kerja Grid Spreadsheet
                </span>
                <span className="text-[11px] font-mono text-ink-soft">
                  Tekan <kbd className="px-1.5 py-0.5 rounded bg-canvas border border-rule text-[11px] font-bold font-mono">Tab</kbd> untuk berpindah antar kolom input
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                className="h-8 rounded-xl text-xs font-mono border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
              >
                <Plus className="size-3.5 mr-1 text-terra" />
                Tambah 1 Baris
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addMultipleRows(5)}
                className="h-8 rounded-xl text-xs font-mono border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
              >
                <Plus className="size-3.5 mr-1 text-terra" />
                Tambah 5 Baris
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="batch-kolom-toggle"
                    className="h-8 rounded-xl text-xs font-mono border-rule bg-paper hover:bg-canvas text-ink transition-colors shadow-xs"
                    aria-label="Tampilkan atau sembunyikan kolom opsional"
                  >
                    Kolom
                    <ChevronDown className="size-3.5 ml-1 text-ink-soft" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl border-rule bg-paper p-1.5 shadow-md">
                  <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-soft">
                    Kolom opsional
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {OPTIONAL_COLS.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={!hiddenCols[col.key]}
                      onCheckedChange={(v) => setHiddenCols((p) => ({ ...p, [col.key]: !v }))}
                      onSelect={(e) => e.preventDefault()}
                      className="cursor-pointer rounded-lg text-xs font-medium text-ink focus:bg-canvas"
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Table Data Swiss 2.0 */}
          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-sm text-left border-collapse data-table">
              <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/80 border-b border-rule">
                <tr>
                  <th className="py-3 px-3.5 font-medium w-12 text-center">#</th>
                  <th className="py-3 px-3 font-medium w-36">Kode SKU</th>
                  {!hiddenCols.appBarcode && (
                    <th className="py-3 px-3 font-medium w-32">App-barcode<OptionalBadge /></th>
                  )}
                  {!hiddenCols.barcodePabrik && (
                    <th className="py-3 px-3 font-medium w-40">Barcode Pabrik<OptionalBadge /></th>
                  )}
                  <th className="py-3 px-3 font-medium min-w-[220px]">Nama Barang *</th>
                  {!hiddenCols.category && (
                    <th className="py-3 px-3 font-medium w-36">Kategori<OptionalBadge /></th>
                  )}
                  {!hiddenCols.unit && (
                    <th className="py-3 px-3 font-medium w-28">Satuan<OptionalBadge /></th>
                  )}
                  {!hiddenCols.initialQty && (
                    <th className="py-3 px-3 font-medium text-right w-24">Stok Awal<OptionalBadge /></th>
                  )}
                  {!hiddenCols.initialCostText && (
                    <th className="py-3 px-3 font-medium text-right w-36">Harga Modal (Rp)<OptionalBadge /></th>
                  )}
                  {!hiddenCols.standardSellingPriceText && (
                    <th className="py-3 px-3 font-medium text-right w-36">Harga Jual (Rp)<OptionalBadge /></th>
                  )}
                  {!hiddenCols.minStockAlert && (
                    <th className="py-3 px-3 font-medium text-right w-24">Min. Stok<OptionalBadge /></th>
                  )}
                  <th className="py-3 px-3 font-medium w-12 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {rows.map((row, index) => {
                  const isValid = row.name.trim();
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        isValid
                          ? "bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05]"
                          : "hover:bg-canvas/40"
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
                          className="h-8 text-xs font-mono rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                        />
                      </td>
                      {!hiddenCols.appBarcode && (
                        <td className="py-2 px-2">
                          <Input
                            placeholder="20000001"
                            value={row.appBarcode}
                            onChange={(e) => handleCellChange(row.id, "appBarcode", e.target.value)}
                            className="h-8 text-xs font-mono rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      {!hiddenCols.barcodePabrik && (
                        <td className="py-2 px-2">
                          <Input
                            placeholder="899..."
                            value={row.barcodePabrik}
                            onChange={(e) => handleCellChange(row.id, "barcodePabrik", e.target.value)}
                            className="h-8 text-xs font-mono rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      <td className="py-2 px-2">
                        <Input
                          placeholder="Nama produk..."
                          value={row.name}
                          onChange={(e) => handleCellChange(row.id, "name", e.target.value)}
                          className="h-8 text-xs rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                        />
                      </td>
                      {!hiddenCols.category && (
                        <td className="py-2 px-2">
                          <Input
                            placeholder="Alat Tulis"
                            value={row.category}
                            onChange={(e) => handleCellChange(row.id, "category", e.target.value)}
                            className="h-8 text-xs rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      {!hiddenCols.unit && (
                        <td className="py-2 px-2">
                          <Input
                            placeholder="Pcs"
                            value={row.unit}
                            onChange={(e) => handleCellChange(row.id, "unit", e.target.value)}
                            className="h-8 text-xs rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      {!hiddenCols.initialQty && (
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="0"
                            value={row.initialQty}
                            onChange={(e) => handleCellChange(row.id, "initialQty", Number(e.target.value))}
                            className="h-8 text-xs text-right font-mono tnum rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      {!hiddenCols.initialCostText && (
                        <td className="py-2 px-2">
                          <Input
                            placeholder="0"
                            value={row.initialCostText}
                            onChange={(e) => handleCellChange(row.id, "initialCostText", e.target.value)}
                            className="h-8 text-xs text-right font-mono tnum rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      {!hiddenCols.standardSellingPriceText && (
                        <td className="py-2 px-2">
                          <Input
                            placeholder="0"
                            value={row.standardSellingPriceText}
                            onChange={(e) => handleCellChange(row.id, "standardSellingPriceText", e.target.value)}
                            className="h-8 text-xs text-right font-mono tnum rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      {!hiddenCols.minStockAlert && (
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="0"
                            value={row.minStockAlert}
                            onChange={(e) => handleCellChange(row.id, "minStockAlert", e.target.value)}
                            className="h-8 text-xs text-right font-mono tnum rounded-lg bg-canvas border-rule focus-visible:ring-1 focus-visible:ring-terra"
                          />
                        </td>
                      )}
                      <td className="py-2 px-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(row.id)}
                          className="h-8 w-8 p-0 rounded-lg text-ink-soft hover:text-terra hover:bg-canvas"
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

          {/* Table Footer Summary & Information */}
          <div className="p-4 border-t border-rule bg-canvas/40 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-2">
              <Info className="size-4 text-terra shrink-0" />
              <span>
                Baris kosong (tanpa Nama) otomatis dilewati saat penyimpanan. Kolom harga dan stok otomatis dikonversi ke minor unit mata uang. Kolom bertanda opsional boleh disembunyikan lewat tombol Kolom — nilainya tetap tersimpan.
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="h-8 text-xs font-mono text-ink hover:text-terra hover:bg-canvas rounded-lg"
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
