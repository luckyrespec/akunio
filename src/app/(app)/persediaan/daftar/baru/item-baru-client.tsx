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
import { createItemAction, suggestSkuAction, updateItemImageAction } from "@/server/actions/inventory.actions";
import { compressImageToLimit } from "@/lib/compress-image";

export function ItemBaruClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    appBarcode: "",
    name: "",
    barcode: "",
    category: "",
    unit: "Pcs",
    minStockAlert: "5",
    initialQty: 0,
    initialCostText: "",
    standardSellingPriceText: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handlePhotoChange = (f: File | null) => {
    setPhotoFile(f);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await suggestSkuAction();
    setGenerating(false);
    if (res.ok) {
      setFormData((p) => ({
        ...p,
        code: p.code || res.code,
        appBarcode: p.appBarcode || res.appBarcode,
      }));
    } else {
      setError(res.error || "Gagal generate kode");
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      appBarcode: "",
      name: "",
      barcode: "",
      category: "",
      unit: "Pcs",
      minStockAlert: "5",
      initialQty: 0,
      initialCostText: "",
      standardSellingPriceText: "",
    });
    handlePhotoChange(null);
  };

  const submitWithMode = (mode: "save" | "save-new") => {
    setError(null);
    setPhotoWarning(null);
    startTransition(async () => {
      const res = await createItemAction(formData);
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan barang");
      } else {
        if (photoFile && res.item) {
          try {
            const { blob, mime } = await compressImageToLimit(photoFile);
            const fd = new FormData();
            fd.set("file", new File([blob], photoFile.name.replace(/\.[^.]+$/, ".jpg"), { type: mime }));
            const up = await updateItemImageAction(res.item.id, fd);
            if (!up.ok) setPhotoWarning(`Barang tersimpan, foto gagal: ${up.error}`);
          } catch (e) {
            setPhotoWarning(`Barang tersimpan, foto gagal: ${e instanceof Error ? e.message : "gagal kompres"}`);
          }
        }
        if (mode === "save-new") {
          resetForm();
        } else {
          router.push("/persediaan/daftar");
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
          href="/persediaan/daftar"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Katalog Persediaan
        </Link>
      </div>

      {/* Page Header dengan Action Buttons Sejajar Inline */}
      <PageHeader
        title="Tambah Barang Persediaan"
        eyebrow="Daftarkan SKU baru, atur batas peringatan restock, dan catat saldo awal persediaan."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/persediaan/daftar")}
              className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
            >
              Batal
            </Button>
            <div className="flex items-stretch shadow-xs rounded-xl overflow-hidden">
              <Button
                type="submit"
                disabled={isPending}
                size="sm"
                data-testid="persediaan-simpan"
                className="h-9 rounded-l-xl rounded-r-none px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold transition-transform active:scale-[0.98] disabled:transform-none shadow-none"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
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
                    disabled={isPending}
                    size="sm"
                    className="h-9 rounded-l-none rounded-r-xl border-l border-l-white/25 px-2.5 bg-terra text-white hover:bg-terra/90 shadow-none disabled:transform-none"
                    aria-label="Opsi simpan lainnya"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48 rounded-xl border-rule bg-paper shadow-md">
                  <DropdownMenuItem
                    onClick={() => submitWithMode("save")}
                    className="text-xs font-medium cursor-pointer py-2"
                  >
                    Simpan &amp; Lihat Rincian
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => submitWithMode("save-new")}
                    className="text-xs font-medium cursor-pointer py-2"
                  >
                    Simpan &amp; Tambah Baru
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {photoWarning && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          {photoWarning}
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
                    <Label htmlFor="item-code">Kode SKU App</Label>
                    <div className="flex gap-2">
                      <Input
                        id="item-code"
                        data-testid="persediaan-code"
                        placeholder="Contoh: BRG-0001 (kosongkan = otomatis)"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        className="h-9 font-mono uppercase bg-canvas"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={generating}
                        onClick={handleGenerate}
                        data-testid="persediaan-generate-sku"
                        className="h-9 shrink-0 text-xs"
                      >
                        {generating ? <Loader2 className="size-3.5 animate-spin" /> : "Generate"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-ink-soft">
                      Kosongkan untuk nomor otomatis. Saran bisa bentrok bila dipakai bersamaan — sistem akan memberi nomor segar saat simpan.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-app-barcode">Barcode App (pendek, untuk scan)</Label>
                    <Input
                      id="item-app-barcode"
                      placeholder="Contoh: 20000001 (kosongkan = otomatis)"
                      value={formData.appBarcode}
                      onChange={(e) => setFormData({ ...formData, appBarcode: e.target.value })}
                      className="h-9 font-mono bg-canvas"
                    />
                  </div>
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

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-name">Nama Barang Dagang *</Label>
                  <Input
                    id="item-name"
                    required
                    data-testid="persediaan-nama"
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
          {/* Section 3 — Foto Barang */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Foto Barang</CardTitle>
                <CardDescription>Satu foto utama (maks 500 KB, otomatis dikompres).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Pratinjau foto barang" className="size-20 rounded-xl object-cover border border-rule" />
                  ) : (
                    <div className="size-20 rounded-xl border border-dashed border-rule bg-canvas flex items-center justify-center">
                      <Package className="size-6 text-ink-soft/50" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                      className="h-9 max-w-xs text-xs"
                      aria-label="Foto barang"
                    />
                    {photoFile && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => handlePhotoChange(null)} className="w-fit text-xs">
                        Hapus foto
                      </Button>
                    )}
                  </div>
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
              <Link href="/persediaan/daftar/baru/batch">
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
