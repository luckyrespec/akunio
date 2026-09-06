"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Money } from "@/core/money/money";

export interface JasaRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  priceMinor: string;
  isActive: boolean;
}

export function JasaClient({ items }: { items: JasaRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q),
      )
    : items;

  return (
    <div className="rounded-xl border border-rule bg-paper shadow-2xs">
      <div className="flex items-center gap-2 border-b border-rule/60 p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode atau nama jasa..."
            aria-label="Cari jasa"
            className="h-9 bg-canvas pl-9 text-xs"
          />
        </div>
      </div>
      <div data-testid="persediaan-jasa-list" className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-rule/60 text-[11px] uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">Kode</th>
              <th className="px-4 py-2.5 font-semibold">Nama Jasa</th>
              <th className="px-4 py-2.5 font-semibold">Kategori</th>
              <th className="px-4 py-2.5 font-semibold">Satuan</th>
              <th className="px-4 py-2.5 text-right font-semibold">Harga Jual</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-ink-soft">
                  Belum ada jasa. Klik Tambah Jasa untuk mendaftarkan layanan pertama, misalnya cuci rambut atau servis ringan.
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="transition-colors hover:bg-canvas/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{i.code}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-ink">
                    <Link href={`/persediaan/jasa/${i.id}`} className="hover:text-terra hover:underline">
                      {i.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">{i.category || "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">{i.unit}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink">
                    {Money.fromMinor(BigInt(i.priceMinor)).formatIdr()}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-[10px]">
                      {i.isActive ? "Aktif" : "Arsip"}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
