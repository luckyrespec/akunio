"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Pencil, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/core/money/money";
import { AnimatedNumber, Reveal } from "@/components/motion";
import { AccountSelect } from "@/components/account-select";
import {
  ItemPhotoManager,
  type ItemPhotoManagerHandle,
} from "@/components/inventory/item-photo-manager";
import { JasaArsipButton } from "./jasa-arsip-button";
import { updateServiceItemAction } from "@/server/actions/inventory.actions";

export interface JasaDetailData {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  standardSellingPriceMinor: bigint;
  revenueAccountId: string | null;
  expenseAccountId: string | null;
  isActive: boolean;
  imageStorageKey: string | null;
}

export interface JasaAccountOpt {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function JasaDetailClient({
  item,
  accounts,
}: {
  item: JasaDetailData;
  accounts: JasaAccountOpt[];
}) {
  const router = useRouter();
  const photoRef = useRef<ItemPhotoManagerHandle>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: item.name,
    category: item.category ?? "",
    unit: item.unit,
    sellingText: Money.fromMinor(item.standardSellingPriceMinor).formatIdr(),
    revenueAccountId: item.revenueAccountId ?? "",
    expenseAccountId: item.expenseAccountId ?? "",
  });

  const revenueAccounts = accounts.filter((a) => a.type === "PENDAPATAN");
  const expenseAccounts = accounts.filter((a) => a.type === "BEBAN");
  const accLabel = (id: string | null) => {
    if (!id) return null;
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} — ${a.name}` : null;
  };
  const revenueLabel = accLabel(item.revenueAccountId);
  const expenseLabel = accLabel(item.expenseAccountId);

  const startEdit = () => {
    setForm({
      name: item.name,
      category: item.category ?? "",
      unit: item.unit,
      sellingText: Money.fromMinor(item.standardSellingPriceMinor).formatIdr(),
      revenueAccountId: item.revenueAccountId ?? "",
      expenseAccountId: item.expenseAccountId ?? "",
    });
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    photoRef.current?.discard();
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const photoRes = await photoRef.current?.commit();
      if (photoRes && !photoRes.ok) {
        setError(photoRes.error ?? "Gagal menyimpan foto.");
        return;
      }
      const res = await updateServiceItemAction({
        id: item.id,
        name: form.name,
        category: form.category,
        unit: form.unit,
        sellingPriceText: form.sellingText,
        revenueAccountId: form.revenueAccountId || null,
        expenseAccountId: form.expenseAccountId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const set = (k: "name" | "category" | "unit" | "sellingText") => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/persediaan/daftar"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-terra"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Barang &amp; Jasa
        </Link>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={cancelEdit}
                className="h-8 rounded-xl text-xs"
              >
                <X className="mr-1.5 size-3.5" />
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={save}
                className="h-8 rounded-xl bg-terra text-xs text-white hover:bg-terra/90"
              >
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Simpan
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={startEdit}
                className="h-8 rounded-xl bg-terra px-4 text-xs font-semibold text-white shadow-xs transition-[transform,background-color] hover:bg-terra/90 active:scale-[0.98]"
              >
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
              <JasaArsipButton itemId={item.id} isActive={item.isActive} />
            </>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <Reveal>
      <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-rule bg-paper p-4 shadow-xs">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-soft">
            Foto Jasa
          </div>
          <ItemPhotoManager
            ref={photoRef}
            itemId={item.id}
            imageStorageKey={item.imageStorageKey}
            editing={editing}
            label="jasa"
          />
        </div>

        {/* Panel bukti layanan: identitas + harga sebagai angka utama + akun */}
        <div className="rounded-2xl border border-rule bg-paper p-5 shadow-xs sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-terra/25 bg-terra/10 text-terra">
              <Wrench className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {editing ? (
                  <Input
                    value={form.name}
                    onChange={set("name")}
                    aria-label="Nama jasa"
                    className="h-9 max-w-sm bg-canvas font-display text-xl font-semibold tracking-tight"
                  />
                ) : (
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
                    {item.name}
                  </h1>
                )}
                <Badge variant="outline" className="font-mono text-xs">
                  {item.code}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {item.isActive ? "Aktif" : "Arsip"}
                </Badge>
              </div>
              {!editing && (
                <p className="mt-1 text-xs text-ink-soft">
                  Kategori: {item.category || "-"} • Satuan: {item.unit}
                </p>
              )}
            </div>
          </div>

          <div className="rule-double mt-6 flex items-baseline justify-between gap-4 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Harga Jual
            </span>
            <span className="tnum truncate font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
              {editing ? (
                Money.fromMinor(item.standardSellingPriceMinor).formatIdr()
              ) : (
                <AnimatedNumber minor={item.standardSellingPriceMinor} />
              )}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            per {item.unit} — harga default saat dipilih di faktur &amp; kasir.
          </p>

          {!editing && (
            <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-3 border-b border-rule/50 pb-2">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                  Akun Pendapatan
                </dt>
                <dd className="text-right text-xs font-medium text-ink">
                  {revenueLabel ?? "Default (4130 → 4100)"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-b border-rule/50 pb-2">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                  Akun Beban Pembelian
                </dt>
                <dd className="text-right text-xs font-medium text-ink">
                  {expenseLabel ?? "Default (5100)"}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
      </Reveal>

      {editing && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jasa-kategori">Kategori</Label>
            <Input id="jasa-kategori" value={form.category} onChange={set("category")} placeholder="Contoh: Perawatan" className="h-9 bg-canvas" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jasa-satuan">Satuan</Label>
            <Input id="jasa-satuan" value={form.unit} onChange={set("unit")} placeholder="Sesi" className="h-9 bg-canvas" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jasa-harga">Harga Jual (Rp)</Label>
            <Input id="jasa-harga" inputMode="numeric" value={form.sellingText} onChange={set("sellingText")} className="h-9 bg-canvas" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jasa-revenue">Akun Pendapatan Jasa</Label>
            <AccountSelect
              id="jasa-revenue"
              accounts={revenueAccounts}
              value={form.revenueAccountId}
              onValueChange={(v) => setForm((f) => ({ ...f, revenueAccountId: v }))}
              placeholder="Default: Pendapatan Jasa / Usaha"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jasa-expense">Akun Beban (pembelian jasa)</Label>
            <AccountSelect
              id="jasa-expense"
              accounts={expenseAccounts}
              value={form.expenseAccountId}
              onValueChange={(v) => setForm((f) => ({ ...f, expenseAccountId: v }))}
              placeholder="Default: Beban Pokok Penjualan"
            />
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft sm:col-span-2 lg:col-span-1 lg:self-end lg:pb-2">
            <Lock className="size-3.5 shrink-0" />
            Kode jasa terkunci. Jasa tidak punya stok/modal.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Link href="/faktur/baru">
          <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs">
            Buat Faktur dengan Jasa ini
          </Button>
        </Link>
      </div>
    </div>
  );
}
