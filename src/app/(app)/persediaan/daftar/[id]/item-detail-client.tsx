"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  History,
  Info,
  Loader2,
  Lock,
  Package,
  Pencil,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion";
import { AppBarcode } from "@/components/inventory/app-barcode";
import {
  ItemPhotoManager,
  type ItemPhotoManagerHandle,
} from "@/components/inventory/item-photo-manager";
import { ItemArsipButton } from "./item-arsip-button";
import { ItemStockHistory, type StockTx } from "./item-stock-history";
import { ItemCostHistory, type CostHistoryPoint } from "./item-cost-history";
import { updateItemAction } from "@/server/actions/inventory.actions";

export interface ItemDetailData {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  appBarcode: string | null;
  barcode: string | null;
  currentQty: string;
  minStockAlert: string;
  averageCostMinor: bigint;
  totalCostMinor: bigint;
  standardSellingPriceMinor: bigint;
  isActive: boolean;
  imageStorageKey: string | null;
}

export type ItemDetailTab = "detail" | "kartu-stok" | "riwayat-harga";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SECTIONS: Array<{
  id: ItemDetailTab;
  label: string;
  desc: string;
  icon: typeof Info;
}> = [
  { id: "detail", label: "Detail", desc: "Identitas, foto, dan pengaturan barang.", icon: Info },
  { id: "kartu-stok", label: "Kartu Stok", desc: "Riwayat mutasi masuk dan keluar.", icon: History },
  {
    id: "riwayat-harga",
    label: "Riwayat Harga",
    desc: "Perubahan harga modal dari barang masuk.",
    icon: TrendingUp,
  },
];

export function ItemDetailClient({
  item,
  transactions,
  costHistory,
  initialTab,
}: {
  item: ItemDetailData;
  transactions: StockTx[];
  costHistory: CostHistoryPoint[];
  initialTab: ItemDetailTab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const photoRef = useRef<ItemPhotoManagerHandle>(null);
  const [tab, setTabState] = useState<ItemDetailTab>(initialTab);
  // Arah transisi konten mengikuti urutan section (seperti membalik halaman buku).
  const [dir, setDir] = useState<1 | -1>(1);
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: item.name,
    category: item.category ?? "",
    unit: item.unit,
    minStockAlert: item.minStockAlert,
    sellingText: Money.fromMinor(item.standardSellingPriceMinor).formatIdr(),
    barcode: item.barcode ?? "",
  });

  const resetForm = () => {
    setForm({
      name: item.name,
      category: item.category ?? "",
      unit: item.unit,
      minStockAlert: item.minStockAlert,
      sellingText: Money.fromMinor(item.standardSellingPriceMinor).formatIdr(),
      barcode: item.barcode ?? "",
    });
  };

  const setTab = (next: ItemDetailTab) => {
    const from = SECTIONS.findIndex((s) => s.id === tab);
    const to = SECTIONS.findIndex((s) => s.id === next);
    setDir(to >= from ? 1 : -1);
    setTabState(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  const startEdit = () => {
    resetForm();
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    photoRef.current?.discard();
    resetForm();
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
      const res = await updateItemAction({
        id: item.id,
        name: form.name,
        category: form.category,
        unit: form.unit,
        minStockAlert: form.minStockAlert,
        standardSellingPriceText: form.sellingText,
        barcode: form.barcode,
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const activeSection = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0];

  return (
    <div className="flex w-full flex-col bg-canvas lg:h-[calc(100vh-3.5rem)] lg:flex-row lg:overflow-hidden">
      {/* SIDEMENU MINI (pola halaman Pengaturan) */}
      <aside className="flex w-full shrink-0 flex-col border-b border-rule bg-paper lg:w-64 lg:border-b-0 lg:border-r xl:w-72">
        <div className="flex shrink-0 items-center gap-3 border-b border-rule p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-terra/25 bg-terra/10 text-terra">
            <Package className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-sm font-bold text-ink" title={item.name}>
              {item.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-ink-soft">{item.code}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  item.isActive ? "bg-debit/10 text-debit" : "bg-terra/10 text-terra",
                )}
              >
                {item.isActive ? "Aktif" : "Arsip"}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Menu Barang
          </div>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = tab === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={editing}
                onClick={() => setTab(s.id)}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-xs transition-colors",
                  isActive
                    ? "font-semibold text-terra"
                    : "text-ink-soft hover:bg-canvas hover:text-ink",
                  editing && !isActive && "opacity-50",
                  editing && "cursor-not-allowed",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="item-detail-nav-active"
                    transition={reduce ? { duration: 0 } : { duration: 0.22, ease: EASE }}
                    className="absolute inset-0 rounded-xl border border-terra/25 bg-terra/10 shadow-2xs"
                  />
                )}
                <Icon
                  className={cn(
                    "relative z-10 size-4 shrink-0 transition-colors",
                    isActive ? "text-terra" : "text-ink-soft group-hover:text-ink",
                  )}
                />
                <span className="relative z-10 truncate font-medium">{s.label}</span>
              </button>
            );
          })}
          {editing && (
            <p className="px-3 pt-2 text-[11px] leading-relaxed text-ink-soft">
              Simpan atau batalkan edit dulu untuk pindah bagian.
            </p>
          )}
        </nav>

        <div className="hidden shrink-0 border-t border-rule p-3 lg:block">
          <Link
            href="/persediaan/daftar"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Barang &amp; Jasa
          </Link>
        </div>
      </aside>

      {/* KONTEN PER SECTION */}
      <main className="w-full min-w-0 flex-1 overflow-y-auto p-5 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-[1100px] space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href="/persediaan/daftar"
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-terra lg:hidden"
              >
                <ArrowLeft className="size-3.5" />
                Kembali ke Barang &amp; Jasa
              </Link>
              <h1 className="font-display text-xl font-bold tracking-tight text-ink">
                {activeSection.label}
              </h1>
              <p className="mt-0.5 text-xs text-ink-soft">{activeSection.desc}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={cancelEdit}
                    className="h-9 rounded-xl px-4 text-xs"
                  >
                    <X className="mr-1.5 size-3.5" />
                    Batal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={save}
                    className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white hover:bg-terra/90"
                  >
                    {saving ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : null}
                    Simpan
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={startEdit}
                    className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white shadow-xs transition-[transform,background-color] hover:bg-terra/90 active:scale-[0.98]"
                  >
                    <Pencil className="mr-1.5 size-3.5" />
                    Edit
                  </Button>
                  <ItemArsipButton itemId={item.id} isActive={item.isActive} />
                </>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
          {tab === "detail" && (
            <motion.div
              key="detail"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -12 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="space-y-6"
            >
              <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
                <div className="rounded-2xl border border-rule bg-paper p-4 shadow-xs">
                  <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                    Foto Barang
                  </div>
                  <ItemPhotoManager
                    ref={photoRef}
                    itemId={item.id}
                    imageStorageKey={item.imageStorageKey}
                    editing={editing}
                  />
                </div>

                {editing ? (
                  <div className="rounded-2xl border border-rule bg-paper p-5 shadow-xs">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-base font-semibold text-ink">
                          Ubah Data Barang
                        </h2>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Perubahan berlaku setelah klik Simpan.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="item-nama">Nama Barang *</Label>
                        <Input
                          id="item-nama"
                          value={form.name}
                          onChange={set("name")}
                          className="h-9 bg-canvas"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="item-kategori">Kategori</Label>
                        <Input
                          id="item-kategori"
                          value={form.category}
                          onChange={set("category")}
                          placeholder="Contoh: Sembako"
                          className="h-9 bg-canvas"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="item-satuan">Satuan</Label>
                        <Input
                          id="item-satuan"
                          value={form.unit}
                          onChange={set("unit")}
                          placeholder="Pcs"
                          className="h-9 bg-canvas"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="item-minstok">Batas Min. Stok</Label>
                        <Input
                          id="item-minstok"
                          inputMode="decimal"
                          value={form.minStockAlert}
                          onChange={set("minStockAlert")}
                          className="h-9 bg-canvas"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="item-jual">Harga Jual (Rp)</Label>
                        <Input
                          id="item-jual"
                          inputMode="numeric"
                          value={form.sellingText}
                          onChange={set("sellingText")}
                          className="h-9 bg-canvas"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="item-barcode">Barcode Pabrik</Label>
                        <Input
                          id="item-barcode"
                          value={form.barcode}
                          onChange={set("barcode")}
                          placeholder="Opsional"
                          className="h-9 bg-canvas"
                        />
                      </div>
                      <p className="flex items-center gap-1.5 self-end pb-2 text-[11px] text-ink-soft sm:col-span-2">
                        <Lock className="size-3.5 shrink-0" />
                        Kode SKU, barcode app, stok &amp; harga modal terkunci (harga modal bergerak via
                        pembelian/opname).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-rule bg-paper p-5 shadow-xs">
                    <h2 className="font-display text-base font-semibold text-ink">
                      Informasi Barang
                    </h2>
                    <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                      <div className="flex items-baseline justify-between gap-3 border-b border-rule/50 pb-2">
                        <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                          Kategori
                        </dt>
                        <dd className="text-sm font-medium text-ink">{item.category || "Umum"}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-rule/50 pb-2">
                        <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                          Satuan
                        </dt>
                        <dd className="text-sm font-medium text-ink">{item.unit}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-rule/50 pb-2">
                        <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                          Batas Min. Stok
                        </dt>
                        <dd className="tnum text-sm font-medium text-ink">
                          {Number(item.minStockAlert).toLocaleString("id-ID")} {item.unit}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 border-b border-rule/50 pb-2">
                        <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                          Barcode Pabrik
                        </dt>
                        <dd className="truncate font-mono text-sm font-medium text-ink">
                          {item.barcode || "—"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5 border-t border-rule/60 pt-4">
                      <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                        Barcode App
                      </div>
                      {item.appBarcode ? (
                        <AppBarcode value={item.appBarcode} />
                      ) : (
                        <p className="text-xs text-ink-soft">Belum ada barcode app.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                    Sisa Stok Buku
                  </div>
                  <div className="tnum mt-1 font-mono text-2xl font-bold text-ink">
                    {Number(item.currentQty).toLocaleString("id-ID")} {item.unit}
                  </div>
                </div>
                <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                    Biaya Modal Rata-Rata
                  </div>
                  <div className="tnum mt-1 font-mono text-2xl font-bold text-ink">
                    <AnimatedNumber minor={item.averageCostMinor} />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    Otomatis via pembelian &amp; opname — lihat Riwayat Harga.
                  </p>
                </div>
                <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                    Total Nilai Buku
                  </div>
                  <div className="tnum mt-1 font-mono text-2xl font-bold text-ink">
                    <AnimatedNumber minor={item.totalCostMinor} />
                  </div>
                </div>
                <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                    Harga Jual
                  </div>
                  <div className="tnum mt-1 font-mono text-2xl font-bold text-ink">
                    <AnimatedNumber minor={item.standardSellingPriceMinor} />
                  </div>
                  {editing && (
                    <p className="mt-1 text-[11px] text-ink-soft">
                      Ubah lewat kolom Harga Jual di atas.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {tab === "kartu-stok" && (
            <motion.div
              key="kartu-stok"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -12 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <ItemStockHistory transactions={transactions} unit={item.unit} />
            </motion.div>
          )}

          {tab === "riwayat-harga" && (
            <motion.div
              key="riwayat-harga"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -12 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <div className="rounded-2xl border border-rule bg-paper p-5 shadow-xs">
                <ItemCostHistory
                  history={costHistory}
                  unit={item.unit}
                  averageCostMinor={item.averageCostMinor}
                />
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
