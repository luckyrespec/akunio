"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { createItemAction } from "@/server/actions/inventory.actions";

export function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    category: "",
    unit: "Pcs",
    minStockAlert: "5",
    initialQty: 0,
    initialCostText: "0",
    standardSellingPriceText: "0",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createItemAction(formData);
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan barang");
      } else {
        setOpen(false);
        setFormData({
          code: "",
          name: "",
          category: "",
          unit: "Pcs",
          minStockAlert: "5",
          initialQty: 0,
          initialCostText: "0",
          standardSellingPriceText: "0",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]">
          <Plus className="size-4 mr-1.5" />
          Tambah Barang Baru
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-[var(--color-paper)] border-[var(--color-border)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif text-[var(--color-tinta)]">
            Tambah Barang Baru
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 text-sm rounded bg-red-500/10 border border-red-500/20 text-red-600">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
                Kode / SKU *
              </Label>
              <Input
                required
                placeholder="BRG-001"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="bg-white/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
                Kategori
              </Label>
              <Input
                placeholder="Elektronik / Bahan"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="bg-white/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
              Nama Barang *
            </Label>
            <Input
              required
              placeholder="Contoh: Kertas HVS A4 80gr"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-white/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
                Satuan
              </Label>
              <Input
                placeholder="Pcs / Box / Kg"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="bg-white/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
                Batas Minimum Stok
              </Label>
              <Input
                type="number"
                min="0"
                value={formData.minStockAlert}
                onChange={(e) => setFormData({ ...formData, minStockAlert: e.target.value })}
                className="bg-white/50"
              />
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="text-xs font-medium text-[var(--color-ink-muted)] mb-2">
              Saldo Awal & Valuasi Harga
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-[var(--color-ink-muted)]">Stok Awal</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.initialQty}
                  onChange={(e) => setFormData({ ...formData, initialQty: Number(e.target.value) })}
                  className="bg-white/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-[var(--color-ink-muted)]">Harga Beli Awal</Label>
                <Input
                  placeholder="Rp 0"
                  value={formData.initialCostText}
                  onChange={(e) => setFormData({ ...formData, initialCostText: e.target.value })}
                  className="bg-white/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-[var(--color-ink-muted)]">Harga Jual</Label>
                <Input
                  placeholder="Rp 0"
                  value={formData.standardSellingPriceText}
                  onChange={(e) => setFormData({ ...formData, standardSellingPriceText: e.target.value })}
                  className="bg-white/50"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[var(--color-tinta)] text-[var(--color-paper)] hover:opacity-90"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Barang"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
