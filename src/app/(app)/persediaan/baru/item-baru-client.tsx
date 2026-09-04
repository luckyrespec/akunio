"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  Package,
  Layers,
  Sparkles,
  Coins,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { createItemAction } from "@/server/actions/inventory.actions";

export function ItemBaruClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    barcode: "",
    category: "",
    unit: "Pcs",
    minStockAlert: "5",
    initialQty: 0,
    initialCostText: "",
    standardSellingPriceText: "",
  });

  const submitWithMode = (mode: "save" | "save-new") => {
    setError(null);
    startTransition(async () => {
      const res = await createItemAction(formData);
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan barang");
      } else {
        if (mode === "save-new") {
          setFormData({
            code: "",
            name: "",
            barcode: "",
            category: "",
            unit: "Pcs",
            minStockAlert: "5",
            initialQty: 0,
            initialCostText: "",
            standardSellingPriceText: "",
          });
        } else {
          router.push("/persediaan");
        }
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitWithMode("save");
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
        title="Tambah Barang Persediaan"
        eyebrow="Daftarkan SKU baru, atur batas peringatan restock, dan catat saldo awal persediaan."
      />

      {/* Action Bar Split Button */}
      <div className="flex items-center justify-end">
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

          <div className="flex items-stretch">
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="h-9 rounded-r-none px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold shadow-xs transition-transform active:scale-[0.98] disabled:transform-none"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Menyimpan...
                </>
              ) : (
                "Simpan Barang"
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  aria-label="Opsi penyimpanan lainnya"
                  className="h-9 rounded-l-none border-l border-l-white/25 px-2 bg-terra text-white hover:bg-terra/90 shadow-xs disabled:transform-none"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48 border-rule bg-paper">
                <DropdownMenuItem onSelect={() => submitWithMode("save")}>
                  Simpan Barang
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => submitWithMode("save-new")}>
                  Simpan &amp; Tambah Lagi
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/persediaan/baru/batch")}>
                  Beralih ke Input Massal (Batch / Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Two Column Layout persis Tambah Aset Tetap */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <Stagger className="flex flex-col gap-6" staggerDelay={0.07}>
          {/* Section 1 — Identitas Barang */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Identitas Barang</CardTitle>
                <CardDescription>Kode SKU unik dan rincian identifikasi produk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-code">Kode SKU / Barcode Unik *</Label>
                    <Input
                      id="item-code"
                      required
                      placeholder="Contoh: BRG-001"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="h-9 font-mono uppercase bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-barcode">Barcode Pabrik (Opsional)</Label>
                    <Input
                      id="item-barcode"
                      placeholder="Contoh: 8991234567890"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="h-9 font-mono bg-canvas"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-name">Nama Barang Dagang *</Label>
                  <Input
                    id="item-name"
                    required
                    placeholder="Contoh: Kertas HVS A4 80gsm Sinar Dunia"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-9 bg-canvas"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-category">Kategori Produk</Label>
                    <Input
                      id="item-category"
                      placeholder="Contoh: Alat Tulis / Elektronik"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="h-9 bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-unit">Satuan Hitung *</Label>
                    <Input
                      id="item-unit"
                      required
                      placeholder="Pcs / Box / Kg / Rim"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="h-9 bg-canvas"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 2 — Saldo Awal & Pengaturan Restock */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Saldo Awal &amp; Peringatan Stok</CardTitle>
                <CardDescription>Pencatatan persediaan fisik awal dan batas restock gudang.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-qty">Stok Fisik Awal</Label>
                    <Input
                      id="item-qty"
                      type="number"
                      min="0"
                      step="any"
                      value={formData.initialQty}
                      onChange={(e) => setFormData({ ...formData, initialQty: Number(e.target.value) })}
                      className="h-9 font-mono bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-cost">Harga Beli / Modal (Rp)</Label>
                    <Input
                      id="item-cost"
                      placeholder="0"
                      value={formData.initialCostText}
                      onChange={(e) => setFormData({ ...formData, initialCostText: e.target.value })}
                      className="h-9 font-mono bg-canvas"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-sell">Harga Jual Standar (Rp)</Label>
                    <Input
                      id="item-sell"
                      placeholder="0"
                      value={formData.standardSellingPriceText}
                      onChange={(e) => setFormData({ ...formData, standardSellingPriceText: e.target.value })}
                      className="h-9 font-mono bg-canvas"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-min">Ambang Peringatan Stok Menipis</Label>
                  <Input
                    id="item-min"
                    type="number"
                    min="0"
                    value={formData.minStockAlert}
                    onChange={(e) => setFormData({ ...formData, minStockAlert: e.target.value })}
                    className="h-9 font-mono bg-canvas max-w-xs"
                  />
                  <p className="text-xs text-ink-soft mt-0.5">
                    Sistem akan memunculkan lencana peringatan saat sisa kuantitas berada di bawah angka ini.
                  </p>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        </Stagger>

        {/* Panel Samping (Kanan): Standar Akuntansi Persediaan */}
        <aside className="sticky top-6 flex flex-col gap-5">
          <Card className="border-rule bg-paper shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-ink-soft">
                <Coins className="size-4 text-terra" />
                <CardTitle className="font-display text-base text-ink">Buku Besar &amp; Valuasi</CardTitle>
              </div>
              <CardDescription>Prinsip double-entry persediaan Akunio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs text-ink-soft leading-relaxed">
              <p>
                Jika Anda memasukkan <strong>Stok Fisik Awal</strong> lebih dari 0, sistem secara otomatis:
              </p>
              <div className="p-3 rounded-xl border border-rule bg-canvas/40 space-y-1.5 text-[11px] font-mono">
                <div className="text-ink font-semibold">1. Layer Saldo Awal (FIFO)</div>
                <div className="text-ink-soft">Mencatat batch masuk pertama untuk kalkulasi HPP otomatis saat penjualan.</div>
                <div className="text-ink font-semibold pt-1">2. Kartu Stok (Mutasi)</div>
                <div className="text-ink-soft">Menerbitkan entri masuk (IN) bertipe Saldo Awal.</div>
              </div>
              <div className="pt-2 border-t border-rule/60 flex items-center gap-1.5 text-[11px] text-debit">
                <ShieldCheck className="size-3.5 shrink-0" />
                <span>Terintegrasi standar SAK EMKM</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-rule bg-paper shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-ink-soft">
                <Layers className="size-4 text-ink" />
                <CardTitle className="font-display text-sm text-ink">Punya Banyak Barang?</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-ink-soft">
              <p>
                Jika Anda memindahkan stok dari spreadsheet lama, gunakan fitur <strong>Input Cepat (Batch / Spreadsheet Grid)</strong> untuk mengisi puluhan baris sekaligus.
              </p>
              <Link href="/persediaan/baru/batch">
                <Button variant="outline" size="sm" className="w-full text-xs border-rule font-medium">
                  Buka Input Massal (Grid Spreadsheet)
                </Button>
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
