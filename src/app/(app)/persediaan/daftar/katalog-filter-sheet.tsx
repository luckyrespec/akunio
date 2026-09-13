"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Batas hasil kategori yang dirender (katalog bisa ribuan kategori). */
const CATEGORY_VIEW_LIMIT = 10;

export type KatalogJenis = "semua" | "barang" | "jasa";

export interface KatalogFilterState {
  jenis: KatalogJenis;
  status: "aktif" | "arsip";
  /** Multi-pilih; kosong = semua kategori. */
  categories: string[];
  qtyMin: string;
  qtyMax: string;
  modalMin: string;
  modalMax: string;
  valueMin: string;
  valueMax: string;
}

export function defaultFilterState(jenis: KatalogJenis): KatalogFilterState {
  return {
    jenis,
    status: "aktif",
    categories: [],
    qtyMin: "",
    qtyMax: "",
    modalMin: "",
    modalMax: "",
    valueMin: "",
    valueMax: "",
  };
}

/** Jumlah grup filter yang aktif (dipakai badge tombol Filter). */
export function activeFilterCount(f: KatalogFilterState): number {
  let n = 0;
  if (f.jenis !== "semua") n += 1;
  if (f.status !== "aktif") n += 1;
  if (f.categories.length > 0) n += 1;
  if (f.qtyMin || f.qtyMax) n += 1;
  if (f.modalMin || f.modalMax) n += 1;
  if (f.valueMin || f.valueMax) n += 1;
  return n;
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-ink text-paper"
          : "border border-rule bg-paper text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function RangeGroup({
  label,
  suffix,
  disabled,
  minValue,
  maxValue,
  onMin,
  onMax,
}: {
  label: string;
  suffix?: string;
  disabled?: boolean;
  minValue: string;
  maxValue: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  const digits = (v: string) => v.replace(/[^\d]/g, "");
  return (
    <div className={cn("space-y-1.5", disabled && "pointer-events-none opacity-50")}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">{label}</span>
        {suffix && <span className="text-[10px] text-ink-soft/80">{suffix}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          inputMode="numeric"
          placeholder="Min"
          value={minValue}
          onChange={(e) => onMin(digits(e.target.value))}
          className="h-9 bg-canvas text-sm"
          aria-label={`${label} minimum`}
        />
        <Input
          inputMode="numeric"
          placeholder="Max"
          value={maxValue}
          onChange={(e) => onMax(digits(e.target.value))}
          className="h-9 bg-canvas text-sm"
          aria-label={`${label} maksimum`}
        />
      </div>
    </div>
  );
}

export function KatalogFilterSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onClear,
  categories,
  jenisCounts,
  statusCounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: KatalogFilterState;
  onChange: (patch: Partial<KatalogFilterState>) => void;
  onClear: () => void;
  categories: Array<{ name: string; count: number }>;
  jenisCounts: Record<KatalogJenis, number>;
  statusCounts: { aktif: number; arsip: number };
}) {
  const toggleCategory = (name: string) => {
    onChange({
      categories: value.categories.includes(name)
        ? value.categories.filter((c) => c !== name)
        : [...value.categories, name],
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="katalog-filter-sheet"
        className="w-full gap-0 overflow-y-auto border-rule bg-paper p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-rule p-5 text-left">
          <SheetTitle className="font-display text-lg font-semibold text-ink">Filter</SheetTitle>
          <SheetDescription className="text-xs text-ink-soft">
            Persempit katalog berdasarkan jenis, kategori, status, dan rentang angka.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 p-5">
          {/* Jenis */}
          <section className="space-y-2.5">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Jenis
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jenis katalog">
              <SegButton active={value.jenis === "semua"} onClick={() => onChange({ jenis: "semua" })}>
                Semua ({jenisCounts.semua})
              </SegButton>
              <SegButton active={value.jenis === "barang"} onClick={() => onChange({ jenis: "barang" })}>
                Barang ({jenisCounts.barang})
              </SegButton>
              <SegButton active={value.jenis === "jasa"} onClick={() => onChange({ jenis: "jasa" })}>
                Jasa ({jenisCounts.jasa})
              </SegButton>
            </div>
          </section>

          {/* Status */}
          <section className="space-y-2.5">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Status
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status item">
              <SegButton active={value.status === "aktif"} onClick={() => onChange({ status: "aktif" })}>
                Aktif ({statusCounts.aktif})
              </SegButton>
              <SegButton active={value.status === "arsip"} onClick={() => onChange({ status: "arsip" })}>
                Arsip ({statusCounts.arsip})
              </SegButton>
            </div>
          </section>

          {/* Kategori */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Kategori
              </h3>
              {value.categories.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ categories: [] })}
                  className="text-[11px] font-medium text-terra hover:underline"
                >
                  Bersihkan pilihan ({value.categories.length})
                </button>
              )}
            </div>
            <div data-testid="katalog-filter-categories">
              <SearchSelect
                multiple
                options={categories.map((c) => ({
                  id: c.name,
                  label: c.name,
                  meta: String(c.count),
                }))}
                values={value.categories}
                onValuesChange={(ids) => onChange({ categories: ids })}
                placeholder="Pilih kategori..."
                searchPlaceholder="Cari kategori..."
                searchAriaLabel="Cari kategori"
                emptyText="Belum ada kategori"
                emptyQueryText={(query) => (
                  <p>Tidak ada kategori cocok dengan &ldquo;{query}&rdquo;.</p>
                )}
                limit={CATEGORY_VIEW_LIMIT}
                className="bg-canvas"
                footerHint="Ketik untuk mencari"
                footerText={({ shown: count, total, filtering }) =>
                  filtering ? (
                    <span>Mencari…</span>
                  ) : (
                    <span>
                      Menampilkan {count} dari {total} kategori
                    </span>
                  )
                }
              />
            </div>
            {value.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="katalog-filter-selected">
                {value.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full border border-terra/25 bg-terra/10 px-2.5 py-1 text-[11px] font-medium text-terra"
                  >
                    {cat}
                    <button
                      type="button"
                      aria-label={`Hapus kategori ${cat}`}
                      onClick={() => toggleCategory(cat)}
                      className="transition-colors hover:text-ink"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Rentang angka */}
          <section className="space-y-3">
            <div>
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Rentang Angka
              </h3>
              <p className="mt-1 text-[11px] text-ink-soft">
                {value.jenis === "jasa"
                  ? "Tersedia untuk barang — jasa tidak punya stok, modal, atau nilai buku."
                  : "Kosongkan bila tidak ingin membatasi. Jasa bernilai 0 ikut tersaring bila min > 0."}
              </p>
            </div>
            <RangeGroup
              label="Kuantitas Saldo"
              disabled={value.jenis === "jasa"}
              minValue={value.qtyMin}
              maxValue={value.qtyMax}
              onMin={(v) => onChange({ qtyMin: v })}
              onMax={(v) => onChange({ qtyMax: v })}
            />
            <RangeGroup
              label="Harga Modal"
              suffix="Rp"
              disabled={value.jenis === "jasa"}
              minValue={value.modalMin}
              maxValue={value.modalMax}
              onMin={(v) => onChange({ modalMin: v })}
              onMax={(v) => onChange({ modalMax: v })}
            />
            <RangeGroup
              label="Nilai Buku"
              suffix="Rp"
              disabled={value.jenis === "jasa"}
              minValue={value.valueMin}
              maxValue={value.valueMax}
              onMin={(v) => onChange({ valueMin: v })}
              onMax={(v) => onChange({ valueMax: v })}
            />
          </section>
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-rule p-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="h-9 rounded-xl text-xs text-ink-soft"
          >
            Bersihkan semua
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white hover:bg-terra/90"
          >
            Selesai
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
