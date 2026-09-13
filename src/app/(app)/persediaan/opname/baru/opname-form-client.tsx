"use client";

import * as React from "react";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ChevronDown,
  Scale,
  Calendar,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Package,
  Search,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/core/money/money";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";
import { createStockOpnameAction } from "@/server/actions/inventory.actions";
import { matchPickerItems, resolvePickerList, type PickerSort } from "./opname-picker";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const SORT_OPTIONS: Array<{ value: PickerSort; label: string }> = [
  { value: "name", label: "A–Z" },
  { value: "stock-desc", label: "Stok ↓" },
  { value: "stock-asc", label: "Stok ↑" },
];

interface Props {
  items: Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    currentQty: string;
    averageCostMinor: bigint;
  }>;
}

export function OpnameFormClient({ items }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [opnameDate, setOpnameDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  // Langkah 1 = pilih barang, Langkah 2 = lembar hitung (hanya yang terpilih).
  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PickerSort>("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const picker = useMemo(
    () => resolvePickerList(items, query, { sort, page, pageSize }),
    [items, query, sort, page, pageSize],
  );

  const activeItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  const [counts, setCounts] = useState<
    Record<string, { physicalQty: number; reason: string }>
  >(() => {
    const init: Record<string, { physicalQty: number; reason: string }> = {};
    for (const it of items) {
      init[it.id] = { physicalQty: Number(it.currentQty), reason: "" };
    }
    return init;
  });

  const handleQtyChange = (itemId: string, val: number) => {
    const safe = !Number.isFinite(val) || val < 0 ? 0 : val;
    setCounts((prev) => ({
      ...prev,
      [itemId]: { physicalQty: safe, reason: prev[itemId]?.reason ?? "" },
    }));
  };

  const handleReasonChange = (itemId: string, reason: string) => {
    setCounts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], reason },
    }));
  };

  // Ringkasan selisih real-time untuk panel samping (hanya barang terpilih)
  const summary = useMemo(() => {
    let totalItemsDiscrepancy = 0;
    let totalNetDifferenceMinor = 0n;

    for (const it of activeItems) {
      const sys = Number(it.currentQty);
      const phys = counts[it.id]?.physicalQty ?? sys;
      const diff = phys - sys;
      if (diff !== 0) {
        totalItemsDiscrepancy += 1;
        const diffVal = (it.averageCostMinor * BigInt(Math.round(diff * 10000))) / 10000n;
        totalNetDifferenceMinor += diffVal;
      }
    }

    return {
      totalItemsDiscrepancy,
      totalNetDifferenceMinor,
      isDeficit: totalNetDifferenceMinor < 0n,
      isSurplus: totalNetDifferenceMinor > 0n,
    };
  }, [activeItems, counts]);

  const submitWithMode = (mode: "save" | "save-another") => {
    setError(null);
    if (activeItems.length === 0) {
      setError("Pilih minimal satu barang pada Langkah 1 sebelum menyimpan sesi opname.");
      setStep(1);
      return;
    }
    const payloadItems = activeItems.map((it) => {
      const raw = counts[it.id]?.physicalQty ?? Number(it.currentQty);
      return {
        itemId: it.id,
        physicalQty: !Number.isFinite(raw) || raw < 0 ? 0 : raw,
        reason: counts[it.id]?.reason || undefined,
      };
    });

    startTransition(async () => {
      const res = await createStockOpnameAction({
        opnameDate,
        notes,
        items: payloadItems,
      });

      if (!res.ok) {
        setError(res.error || "Gagal menyimpan sesi opname");
      } else {
        if (mode === "save-another") {
          // Reset form untuk sesi berikutnya
          setNotes("");
          const resetCounts: Record<string, { physicalQty: number; reason: string }> = {};
          for (const it of items) {
            resetCounts[it.id] = { physicalQty: Number(it.currentQty), reason: "" };
          }
          setCounts(resetCounts);
          setSelectedIds(new Set());
          setQuery("");
          setPage(1);
          setStep(1);
        } else {
          router.push(`/persediaan/opname/${res.opnameId}`);
        }
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitWithMode("save");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Page Header dengan Action Buttons Sejajar Inline (seperti Batch Persediaan) */}
      <PageHeader
        title="Mulai Stok Opname Fisik"
        eyebrow={
          step === 1
            ? "Langkah 1 dari 2 — pilih barang yang mau dihitung fisik."
            : `Langkah 2 dari 2 — hitung fisik ${activeItems.length} barang terpilih.`
        }
        actions={
          step === 1 ? (
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push("/persediaan/opname")}
                className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setStep(2)}
                className="h-9 rounded-xl px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold transition-transform active:scale-[0.98] disabled:transform-none shadow-xs"
              >
                Lanjut ke Lembar Hitung ({selectedIds.size})
                <ArrowRight className="size-3.5 ml-1.5" />
              </Button>
            </div>
          ) : (
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
            >
              <ArrowLeft className="size-3.5 mr-1.5" />
              Pilih Barang
            </Button>

            <div className="flex items-stretch shadow-xs rounded-xl overflow-hidden">
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="h-9 rounded-l-xl rounded-r-none px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold transition-transform active:scale-[0.98] disabled:transform-none shadow-none"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan Sesi Opname"
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    aria-label="Opsi penyimpanan lainnya"
                    className="h-9 rounded-l-none rounded-r-xl border-l border-l-white/25 px-2.5 bg-terra text-white hover:bg-terra/90 shadow-none disabled:transform-none"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48 rounded-xl border-rule bg-paper shadow-md">
                  <DropdownMenuItem onSelect={() => submitWithMode("save")} className="cursor-pointer text-xs py-2 font-medium">
                    Simpan &amp; Lihat Rincian
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => submitWithMode("save-another")} className="cursor-pointer text-xs py-2 font-medium">
                    Simpan &amp; Buat Sesi Baru
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          )
        }
      />

      {error && (
        <div role="alert" className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Langkah 1 — Pilih barang yang mau diopname */}
      {step === 1 && (
        <Reveal>
          <Card className="border-rule bg-paper shadow-xs overflow-hidden">
            <CardHeader className="border-b border-rule/60 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-base text-ink">Pilih Barang</CardTitle>
                  <CardDescription>
                    Cari, urutkan, lalu centang barang yang mau dihitung. Hanya yang terpilih masuk lembar hitung.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono bg-canvas border-rule shrink-0">
                  {selectedIds.size} dipilih
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                <Input
                  placeholder="Cari kode atau nama barang… (mis. SHAMPO)"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 bg-canvas pl-9"
                  aria-label="Cari barang untuk opname"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex items-center gap-0.5 rounded-lg border border-rule bg-canvas p-0.5"
                  role="group"
                  aria-label="Urutkan barang"
                >
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={sort === o.value}
                      onClick={() => {
                        setSort(o.value);
                        setPage(1);
                      }}
                      className={`h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
                        sort === o.value
                          ? "bg-paper font-semibold text-ink shadow-xs"
                          : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div
                  className="flex items-center gap-0.5 rounded-lg border border-rule bg-canvas p-0.5"
                  role="group"
                  aria-label="Jumlah barang per halaman"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={pageSize === n}
                      onClick={() => {
                        setPageSize(n);
                        setPage(1);
                      }}
                      className={`h-7 rounded-md px-2.5 text-[11px] font-medium tabular-nums transition-colors ${
                        pageSize === n
                          ? "bg-paper font-semibold text-ink shadow-xs"
                          : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="ms-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={picker.total === 0}
                    onClick={() => {
                      const ids = matchPickerItems(items, query, sort).map((it) => it.id);
                      setSelectedIds((prev) => new Set([...prev, ...ids]));
                    }}
                    className="h-8 rounded-lg text-xs"
                  >
                    Pilih semua hasil{picker.total > 0 ? ` (${picker.total})` : ""}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={selectedIds.size === 0}
                    onClick={() => setSelectedIds(new Set())}
                    className="h-8 rounded-lg text-xs text-ink-soft"
                  >
                    Bersihkan
                  </Button>
                </div>
              </div>
              {picker.total === 0 ? (
                <div className="py-10 text-center text-ink-soft">
                  <Package className="size-8 mx-auto text-ink-soft/40 mb-2" />
                  <p className="font-display text-base text-ink font-medium">
                    {query.trim() ? "Tidak ada barang yang cocok" : "Belum ada barang di katalog"}
                  </p>
                  <p className="text-xs mt-1">
                    {query.trim()
                      ? "Coba kata kunci lain atau bersihkan pencarian."
                      : "Daftarkan barang terlebih dahulu di menu Persediaan sebelum opname."}
                  </p>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-rule/60">
                    {picker.visible.map((it) => {
                      const checked = selectedIds.has(it.id);
                      return (
                        <li key={it.id} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-canvas/60 transition-colors">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelect(it.id)}
                            aria-label={`Pilih ${it.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleSelect(it.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-ink">{it.name}</span>
                              <span className="block text-[11px] font-mono text-ink-soft">{it.code}</span>
                            </span>
                            <span className="tnum shrink-0 font-mono text-[11px] text-ink-soft">
                              {Number(it.currentQty).toLocaleString("id-ID")} {it.unit}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="tnum text-[11px] text-ink-soft">
                      Menampilkan {picker.total === 0 ? 0 : picker.startIndex + 1}–
                      {Math.min(picker.startIndex + picker.visible.length, picker.total)} dari{" "}
                      {picker.total} barang · {selectedIds.size} dipilih
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={picker.page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Halaman sebelumnya"
                        className="h-8 w-8 rounded-lg p-0"
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="tnum min-w-16 text-center text-[11px] font-medium text-ink-soft">
                        {picker.page} / {picker.totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={picker.page >= picker.totalPages}
                        onClick={() => setPage((p) => Math.min(picker.totalPages, p + 1))}
                        aria-label="Halaman berikutnya"
                        className="h-8 w-8 rounded-lg p-0"
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </Reveal>
      )}

      {/* Langkah 2 — lembar hitung + ringkasan (hanya barang terpilih) */}
      {step === 2 && (
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <Stagger className="flex flex-col gap-6" staggerDelay={0.07}>
          {/* Section 1 — Parameter Pelaksanaan */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Informasi Pelaksanaan</CardTitle>
                <CardDescription>Jadwal dan catatan penanggung jawab stok opname.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="opname-date">Tanggal Perhitungan Fisik *</Label>
                    <Input
                      id="opname-date"
                      type="date"
                      required
                      value={opnameDate}
                      onChange={(e) => setOpnameDate(e.target.value)}
                      className="h-9 bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="opname-notes">Catatan / Lokasi Gudang (Opsional)</Label>
                    <Input
                      id="opname-notes"
                      placeholder="Contoh: Gudang Utama Rak A & B, shift pagi"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-9 bg-canvas"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 2 — Lembar Hitung Komparasi Fisik vs Buku */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs overflow-hidden">
              <CardHeader className="border-b border-rule/60 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display text-base text-ink">Lembar Hitung Barang</CardTitle>
                    <CardDescription>Masukkan angka aktual fisik gudang untuk setiap SKU terpilih.</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono bg-canvas border-rule">
                    {activeItems.length} SKU
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto min-w-full">
                  <table className="w-full text-sm text-left border-collapse data-table">
                    <thead className="text-[11px] uppercase font-mono tracking-[0.1em] text-ink-soft bg-canvas/60 border-b border-rule">
                      <tr>
                        <th className="py-3 px-4 font-medium">Barang (SKU)</th>
                        <th className="py-3 px-3 font-medium text-right">Stok Sistem</th>
                        <th className="py-3 px-3 font-medium text-right w-36">Hitungan Fisik</th>
                        <th className="py-3 px-3 font-medium text-right">Selisih</th>
                        <th className="py-3 px-4 font-medium text-right">Dampak (Rp)</th>
                        <th className="py-3 px-4 font-medium w-48">Alasan / Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule/60">
                      {activeItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-ink-soft">
                            <Package className="size-8 mx-auto text-ink-soft/40 mb-2" />
                            <p className="font-serif text-base text-ink font-medium">Belum ada barang di katalog</p>
                            <p className="text-xs mt-1">Daftarkan barang terlebih dahulu di menu Persediaan sebelum opname.</p>
                          </td>
                        </tr>
                      ) : (
                        activeItems.map((it) => {
                          const sysQty = Number(it.currentQty);
                          const physQty = counts[it.id]?.physicalQty ?? sysQty;
                          const diffQty = physQty - sysQty;
                          const unitCost = it.averageCostMinor;
                          const diffVal = (unitCost * BigInt(Math.round(diffQty * 10000))) / 10000n;
                          const hasDiscrepancy = diffQty !== 0;

                          return (
                            <tr
                              key={it.id}
                              className={`hover:bg-canvas/40 transition-colors ${
                                hasDiscrepancy ? "bg-canvas/20" : ""
                              }`}
                            >
                              <td className="py-3 px-4">
                                <div className="font-medium text-ink">{it.name}</div>
                                <div className="text-[11px] font-mono text-ink-soft">
                                  {it.code}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono tnum text-ink-soft text-xs">
                                {sysQty.toLocaleString("id-ID")} {it.unit}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={physQty}
                                  onChange={(e) => handleQtyChange(it.id, Number(e.target.value))}
                                  className="h-8 text-right font-mono tnum font-semibold bg-canvas text-xs border-rule"
                                />
                              </td>
                              <td className="py-3 px-3 text-right font-mono tnum">
                                <span
                                  className={`text-xs font-semibold ${
                                    diffQty < 0
                                      ? "text-terra"
                                      : diffQty > 0
                                      ? "text-debit"
                                      : "text-ink-soft"
                                  }`}
                                >
                                  {diffQty > 0 ? `+${diffQty}` : diffQty} {it.unit}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono tnum">
                                <span
                                  className={`text-xs font-semibold ${
                                    diffVal < 0n
                                      ? "text-terra"
                                      : diffVal > 0n
                                      ? "text-debit"
                                      : "text-ink-soft"
                                  }`}
                                >
                                  {Money.fromMinor(diffVal).formatIdr()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <Input
                                  placeholder="Contoh: Barang rusak / hilang"
                                  value={counts[it.id]?.reason ?? ""}
                                  onChange={(e) => handleReasonChange(it.id, e.target.value)}
                                  className="h-8 text-xs bg-canvas border-rule placeholder:text-ink-soft/50"
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        </Stagger>

        {/* Panel Samping (Kanan): Ringkasan Finansial & Standar Penyesuaian Akuntansi */}
        <aside className="sticky top-6 flex flex-col gap-5">
          {/* Card 1: Dampak Finansial Selisih */}
          <Card className="border-rule bg-paper shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-ink-soft">
                <Scale className="size-4 text-terra" />
                <CardTitle className="font-display text-base text-ink">Ringkasan Selisih Opname</CardTitle>
              </div>
              <CardDescription>Kalkulasi penyesuaian nilai buku secara otomatis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3.5 rounded-xl border border-rule bg-canvas/40 space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-soft">
                  <span>Item Berbeda Fisik:</span>
                  <strong className="font-mono text-ink">{summary.totalItemsDiscrepancy} SKU</strong>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-soft">
                  <span>Status Selisih:</span>
                  <span className={`font-mono font-medium ${
                    summary.isDeficit
                      ? "text-terra"
                      : summary.isSurplus
                      ? "text-debit"
                      : "text-ink-soft"
                  }`}>
                    {summary.isDeficit ? "Defisit (Hilang/Rusak)" : summary.isSurplus ? "Surplus (Lebih Hitung)" : "Cocok"}
                  </span>
                </div>
                <div className="pt-2 border-t border-rule/60 flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-ink-soft tracking-wider">Estimasi Dampak:</span>
                  <span className={`text-base font-display font-semibold tnum ${
                    summary.isDeficit
                      ? "text-terra"
                      : summary.isSurplus
                      ? "text-debit"
                      : "text-ink"
                  }`}>
                    {Money.fromMinor(summary.totalNetDifferenceMinor).formatIdr()}
                  </span>
                </div>
              </div>

              <div className="text-xs text-ink-soft leading-relaxed">
                {summary.isDeficit ? (
                  <p className="flex items-start gap-1.5 text-terra/90">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-terra" />
                    <span>Selisih kurang akan dijurnalkan sebagai <strong>Beban Selisih Persediaan</strong> di Laba Rugi.</span>
                  </p>
                ) : summary.isSurplus ? (
                  <p className="flex items-start gap-1.5 text-debit">
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                    <span>Selisih lebih akan dikreditkan sebagai <strong>Pendapatan Selisih Stok</strong>.</span>
                  </p>
                ) : (
                  <p className="text-ink-soft">Seluruh hitungan fisik saat ini cocok sempurna dengan saldo buku sistem.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Prosedur Akuntansi Opsi A */}
          <Card className="border-rule bg-paper shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-ink-soft">
                <FileSpreadsheet className="size-4 text-ink" />
                <CardTitle className="font-display text-sm text-ink">Alur Jurnal Penyesuaian</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-ink-soft space-y-2.5 leading-relaxed">
              <p>
                Setelah sesi opname ini disimpan, sistem akan mengunci data fisik dan menyiapkan tombol <strong>"Buat Draf Jurnal Penyesuaian"</strong>.
              </p>
              <div className="p-3 rounded-lg border border-rule bg-canvas/30 text-[11px] font-mono space-y-1">
                <div>(D) Beban Selisih / Kerugian</div>
                <div className="pl-4">(K) Persediaan Barang Dagang</div>
              </div>
              <p className="text-[11px] text-ink-soft italic">
                Sesuai prinsip Akunio: "AI/Sistem mengusulkan, manusia memutuskan" sebelum jurnal dikunci POSTED.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
      )}
    </form>
  );
}
