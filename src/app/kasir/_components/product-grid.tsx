"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";
import type { KasirCatalogItem } from "./types";

function categorySlug(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lainnya";
}

export function ProductGrid({
  catalog,
  query,
  onQuery,
  category,
  onCategory,
  onAdd,
}: {
  catalog: KasirCatalogItem[];
  query: string;
  onQuery: (q: string) => void;
  category: string;
  onCategory: (c: string) => void;
  onAdd: (item: KasirCatalogItem) => void;
}) {
  const categories = React.useMemo(() => {
    const set = new Map<string, string>();
    for (const c of catalog) {
      const name = (c.category ?? "").trim();
      if (name) set.set(name.toLowerCase(), name);
    }
    return ["Semua", ...[...set.values()].sort((a, b) => a.localeCompare(b, "id"))];
  }, [catalog]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => {
      if (category !== "Semua" && (c.category ?? "").trim().toLowerCase() !== category.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.barcode ?? "").toLowerCase().includes(q) ||
        (c.appBarcode ?? "").includes(q)
      );
    });
  }, [catalog, query, category]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 p-3 sm:p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            data-testid="kasir-search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Cari nama, SKU, atau scan barcode..."
            autoFocus
            className="h-11 w-full rounded-xl border border-rule bg-paper pl-9 pr-3 text-sm text-ink shadow-xs placeholder:text-ink-soft/60 focus-ring"
          />
        </label>
        <div role="tablist" aria-label="Kategori barang" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              type="button"
              data-testid={`kasir-category-${categorySlug(c)}`}
              onClick={() => onCategory(c)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors",
                category === c
                  ? "border-terra bg-terra text-paper"
                  : "border-rule bg-paper text-ink-soft hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        <div data-testid="kasir-grid" data-catalog-count={catalog.length} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((c) => {
            const stock = Number(c.qty);
            const low = stock <= Number(c.minStock);
            const empty = stock <= 0;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`kasir-item-${c.code}`}
                disabled={empty}
                onClick={() => onAdd(c)}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl border border-rule bg-paper p-2.5 text-left shadow-2xs transition-colors motion-safe:duration-150",
                  empty ? "opacity-45" : "hover:border-terra/50 hover:shadow-xs",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold",
                    empty ? "bg-canvas text-ink-soft" : "bg-terra/15 text-terra",
                  )}
                >
                  {c.name.trim().charAt(0).toUpperCase() || "•"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink">{c.name}</span>
                  <span className="tnum block text-xs font-bold text-terra">{Money.formatIdr(c.price)}</span>
                  <span className={cn(
                    "tnum block text-[10px]",
                    empty ? "font-semibold text-red-600" : low ? "font-semibold text-amber-600" : "text-ink-soft",
                  )}>
                    {empty ? "Habis" : low ? `Sisa ${stock}` : `Stok ${stock}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="mt-6 text-center text-xs text-ink-soft">
            Barang tidak ditemukan. Tambah dulu di Persediaan.
          </p>
        )}
      </div>
      <div className="shrink-0 px-3 pb-3 sm:px-4">
        <Link
          href="/kas-bank/pembayaran/baru"
          className="block text-center text-[11px] font-medium text-ink-soft hover:text-terra"
        >
          Belanja operasional? Catat di Pembayaran
        </Link>
      </div>
    </div>
  );
}
