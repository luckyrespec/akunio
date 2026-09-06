"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AccountSelect } from "@/components/account-select";
import { createServiceItemAction, suggestJsaSkuAction } from "@/server/actions/inventory.actions";

interface AccountOpt {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function JasaBaruClient({ accounts }: { accounts: AccountOpt[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("Sesi");
  const [priceText, setPriceText] = useState("");
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");

  const revenueAccounts = accounts.filter((a) => a.type === "PENDAPATAN");
  const expenseAccounts = accounts.filter((a) => a.type === "BEBAN");

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await suggestJsaSkuAction();
    setGenerating(false);
    if (res.ok) {
      if (!code) setCode(res.code);
    } else {
      setError(res.error || "Gagal generate kode");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createServiceItemAction({
        code: code || undefined,
        name,
        unit: unit || "Sesi",
        category: category || undefined,
        sellingPriceText: priceText || undefined,
        revenueAccountId: revenueAccountId || null,
        expenseAccountId: expenseAccountId || null,
      });
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan jasa");
      } else {
        router.push("/persediaan/jasa");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/persediaan/jasa"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-terra"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Jasa &amp; Layanan
        </Link>
      </div>

      <PageHeader
        title="Tambah Jasa"
        eyebrow="Daftarkan layanan agar bisa dipilih di faktur bersama barang."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/persediaan/jasa")}
              className="h-9 rounded-xl border-rule bg-paper px-4 text-xs font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              size="sm"
              data-testid="persediaan-jasa-simpan"
              className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white shadow-2xs transition-[transform,background-color] hover:bg-terra/90 active:scale-[0.98]"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Simpan Jasa"
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

      <Card className="border-rule bg-paper shadow-xs">
        <CardHeader>
          <CardTitle className="font-display text-base text-ink">Identitas Jasa</CardTitle>
          <CardDescription>Kode, nama, satuan, harga jual, dan akun pendapatan/beban.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-code">Kode Jasa</Label>
              <div className="flex gap-2">
                <Input
                  id="jasa-code"
                  placeholder="Contoh: JSA-0001 (kosongkan = otomatis)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-9 bg-canvas font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="h-9 shrink-0 text-xs"
                >
                  {generating ? <Loader2 className="size-3.5 animate-spin" /> : "Generate"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-name">Nama Jasa *</Label>
              <Input
                id="jasa-name"
                required
                data-testid="persediaan-jasa-nama"
                placeholder="Contoh: Cuci Rambut"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 bg-canvas"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-category">Kategori</Label>
              <Input
                id="jasa-category"
                placeholder="Contoh: Perawatan"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 bg-canvas"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-unit">Satuan *</Label>
              <Input
                id="jasa-unit"
                required
                placeholder="Sesi / Kali / Paket / Jam"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-9 bg-canvas"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-price">Harga Jual (Rp)</Label>
              <Input
                id="jasa-price"
                data-testid="persediaan-jasa-harga"
                placeholder="50000"
                inputMode="numeric"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                className="h-9 bg-canvas font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-revenue">Akun Pendapatan Jasa</Label>
              <AccountSelect
                id="jasa-revenue"
                accounts={revenueAccounts}
                value={revenueAccountId}
                onValueChange={setRevenueAccountId}
                placeholder="Default: Pendapatan Jasa / Usaha"
              />
              <p className="text-[11px] text-ink-soft">Kosongkan untuk akun default (4130 → 4100).</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jasa-expense">Akun Beban (pembelian jasa)</Label>
              <AccountSelect
                id="jasa-expense"
                accounts={expenseAccounts}
                value={expenseAccountId}
                onValueChange={setExpenseAccountId}
                placeholder="Default: Beban Pokok Penjualan"
              />
              <p className="text-[11px] text-ink-soft">Dipakai saat jasa dibeli via tagihan pembelian.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-ink-soft">
        Jasa tidak punya stok dan tidak masuk Stok Opname — hanya harga dan akun yang tercatat.
      </p>
    </form>
  );
}
