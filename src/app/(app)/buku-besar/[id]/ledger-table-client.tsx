"use client";

import { Fragment, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";
import {
  LedgerFilterSheet,
  activeLedgerFilterCount,
  applyLedgerFilters,
  defaultLedgerFilter,
  type LedgerFilterState,
  type SerialLedgerRow,
} from "./ledger-filter-sheet";

function fmtMinor(raw: string): string {
  return Money.fromMinor(BigInt(raw)).formatIdr();
}

export function LedgerTableClient({
  initialPreset,
  initialDari,
  initialSampai,
  rows,
  openingMinor,
  rangeFrom,
}: {
  initialPreset: string;
  initialDari: string;
  initialSampai: string;
  rows: SerialLedgerRow[];
  openingMinor: string;
  rangeFrom: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [memo, setMemo] = useState("");
  const [draft, setDraft] = useState<LedgerFilterState>(() =>
    defaultLedgerFilter({ preset: initialPreset, dari: initialDari, sampai: initialSampai }),
  );
  const [filterOpen, setFilterOpen] = useState(false);

  const patchDraft = (patch: Partial<LedgerFilterState>) =>
    setDraft((f) => ({ ...f, ...patch }));

  const periodQuery = (d: Pick<LedgerFilterState, "preset" | "dari" | "sampai">) => {
    const p = new URLSearchParams();
    if (d.preset) p.set("preset", d.preset);
    if (d.dari) p.set("dari", d.dari);
    if (d.sampai) p.set("sampai", d.sampai);
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const applyAndClose = () => {
    const changed =
      draft.preset !== initialPreset || draft.dari !== initialDari || draft.sampai !== initialSampai;
    setFilterOpen(false);
    if (changed) router.replace(periodQuery(draft), { scroll: false });
  };

  const clearAll = () => {
    setMemo("");
    setDraft(defaultLedgerFilter());
    setFilterOpen(false);
    if (window.location.search) router.replace(pathname, { scroll: false });
  };

  const badgeState: LedgerFilterState = {
    ...draft,
    preset: initialPreset,
    dari: initialDari,
    sampai: initialSampai,
    memo,
  };
  // Periode sudah diterapkan server; sisi/nominal/memo disaring di layar.
  const filtered = useMemo(
    () =>
      applyLedgerFilters(rows, {
        preset: "",
        dari: "",
        sampai: "",
        memo,
        sisi: draft.sisi,
        minNominal: draft.minNominal,
        maxNominal: draft.maxNominal,
      }),
    [rows, memo, draft.sisi, draft.minNominal, draft.maxNominal],
  );
  const filterCount = activeLedgerFilterCount(badgeState);

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (initialPreset || initialDari || initialSampai) {
    chips.push({
      key: "periode",
      label:
        initialPreset === "bulan-ini"
          ? "Bulan ini"
          : initialPreset === "bulan-lalu"
            ? "Bulan lalu"
            : initialPreset === "tahun-berjalan"
              ? "Tahun ini"
              : [initialDari, initialSampai].filter(Boolean).join(" – ") || "Periode",
      clear: () => {
        setDraft(defaultLedgerFilter());
        router.replace(pathname, { scroll: false });
      },
    });
  }
  if (memo.trim()) chips.push({ key: "memo", label: `“${memo.trim()}”`, clear: () => setMemo("") });
  if (draft.sisi !== "semua")
    chips.push({
      key: "sisi",
      label: draft.sisi === "debit" ? "Debit saja" : "Kredit saja",
      clear: () => patchDraft({ sisi: "semua" }),
    });
  if (draft.minNominal || draft.maxNominal)
    chips.push({
      key: "nominal",
      label: `Rp${draft.minNominal || "0"}–Rp${draft.maxNominal || "∞"}`,
      clear: () => patchDraft({ minNominal: "", maxNominal: "" }),
    });

  const totalDebit = filtered.reduce((s, r) => s + BigInt(r.debitMinor), 0n);
  const totalCredit = filtered.reduce((s, r) => s + BigInt(r.creditMinor), 0n);
  const closing = filtered.length > 0 ? filtered[filtered.length - 1]!.balanceMinor : openingMinor;
  const filteredEmpty = rows.length > 0 && filtered.length === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar: cari + satu pintu Filter */}
      <div className="flex flex-col gap-3 border-b border-rule bg-canvas/30 p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <Input
              placeholder="Cari nomor jurnal atau keterangan…"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="pl-9 h-9 text-sm bg-paper border-rule rounded-xl focus:ring-terra/30"
              aria-label="Cari mutasi"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterOpen(true)}
            data-testid="ledger-filter-button"
            className={cn(
              "h-9 shrink-0 rounded-xl px-3.5 text-xs font-medium transition-colors",
              filterCount > 0
                ? "border-terra/40 bg-terra/10 text-terra hover:bg-terra/15"
                : "border-rule bg-paper text-ink hover:bg-canvas",
            )}
          >
            <SlidersHorizontal className="size-4" />
            Filter
            {filterCount > 0 && (
              <span className="ml-1.5 rounded-full bg-terra px-1.5 py-0.5 text-[10px] font-bold text-white">
                {filterCount}
              </span>
            )}
          </Button>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="ledger-filter-chips">
            {chips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper px-2.5 py-1 text-[11px] font-medium text-ink"
              >
                {c.label}
                <button
                  type="button"
                  aria-label={`Hapus filter ${c.label}`}
                  onClick={c.clear}
                  className="text-ink-soft transition-colors hover:text-terra"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 text-[11px] font-medium text-terra hover:underline"
            >
              Bersihkan
            </button>
          </div>
        )}
      </div>

      {/* Ringkasan kecil scope aktif */}
      <p className="tnum font-mono text-xs text-ink">
        {rangeFrom ? `Periode dari ${rangeFrom}` : "Seluruh riwayat"}
        <span className="text-ink-soft">
          {" "}· {filtered.length} dari {rows.length} mutasi · Saldo akhir {fmtMinor(closing)}
        </span>
      </p>

      {/* Mobile Card List (< sm) */}
      <div className="space-y-3 sm:hidden">
        {rangeFrom && (
          <div className="rounded-2xl border border-rule bg-canvas/60 p-4 shadow-2xs flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">
              Saldo awal <span className="font-mono text-ink-soft">{rangeFrom}</span>
            </span>
            <span className="font-mono font-bold text-ink">{fmtMinor(openingMinor)}</span>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-paper p-8 text-center shadow-xs">
            <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
            <p className="font-display text-base font-medium text-ink">
              {filteredEmpty ? "Tidak ada mutasi cocok filter" : rows.length === 0 && rangeFrom ? "Tidak ada mutasi pada periode ini" : "Belum ada mutasi"}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {filteredEmpty || (rows.length === 0 && rangeFrom)
                ? "Ubah filter atau lihat semua."
                : "Belum ada jurnal berstatus POSTED yang menggunakan akun ini."}
            </p>
          </div>
        ) : (
          filtered.map((r, i) => (
            <div
              key={`${r.number}-${i}`}
              className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-rule/50 pb-2">
                <span className="font-mono font-bold text-xs text-ink">{r.number}</span>
                <span className="text-xs text-ink-soft">{r.entryDate}</span>
              </div>
              {r.memo && <p className="text-xs text-ink-soft italic">“{r.memo}”</p>}
              <div className="flex items-center justify-between text-xs pt-1 font-mono">
                <div className="flex items-center gap-2">
                  {BigInt(r.debitMinor) > 0n && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      D: {fmtMinor(r.debitMinor)}
                    </span>
                  )}
                  {BigInt(r.creditMinor) > 0n && (
                    <span className="text-terra font-semibold">
                      K: {fmtMinor(r.creditMinor)}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-ink-soft mr-1">Saldo:</span>
                  <span className="font-bold text-ink">
                    {fmtMinor(r.balanceMinor)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop & Tablet Table (>= sm) */}
      <div className="hidden sm:block overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left tnum">
            <thead>
              <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Nomor Jurnal</th>
                <th className="px-3.5 py-3">Tanggal</th>
                <th className="px-4 py-3">Keterangan / Memo</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Kredit</th>
                <th className="px-4 py-3 text-right">Saldo Berjalan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {rangeFrom && (
                <tr className="bg-canvas/50">
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">—</td>
                  <td className="px-3.5 py-3 text-xs text-ink-soft">{rangeFrom}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-ink">
                    Saldo awal periode
                  </td>
                  <td className="px-4 py-3 text-right" />
                  <td className="px-4 py-3 text-right" />
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {fmtMinor(openingMinor)}
                  </td>
                </tr>
              )}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-ink-soft">
                    <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
                    <p className="font-display text-base font-medium text-ink">
                      {filteredEmpty ? "Tidak ada mutasi cocok filter" : rows.length === 0 && rangeFrom ? "Tidak ada mutasi pada periode ini" : "Belum ada transaksi"}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {filteredEmpty || (rows.length === 0 && rangeFrom)
                        ? "Ubah filter atau lihat semua."
                        : "Belum ada jurnal berstatus POSTED yang tercatat pada akun ini."}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={`${r.number}-${i}`} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-ink">{r.number}</td>
                    <td className="px-3.5 py-3 text-ink-soft">{r.entryDate}</td>
                    <td className="px-4 py-3 text-ink">{r.memo}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {BigInt(r.debitMinor) > 0n ? fmtMinor(r.debitMinor) : <span className="text-ink-soft/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {BigInt(r.creditMinor) > 0n ? fmtMinor(r.creditMinor) : <span className="text-ink-soft/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                      {fmtMinor(r.balanceMinor)}
                    </td>
                  </tr>
                ))
              )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-rule bg-canvas/70 font-semibold">
                    <td colSpan={3} className="px-4 py-3.5 text-right uppercase text-[11px] tracking-wider text-ink-soft">
                      Total & Saldo Akhir
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {fmtMinor(totalDebit.toString())}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-terra">
                      {fmtMinor(totalCredit.toString())}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink">
                      {fmtMinor(closing)}
                    </td>
                  </tr>
                </tfoot>
              </table>
        </div>
      </div>

      <LedgerFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={draft}
        onChange={(patch) =>
          setDraft((f) => ({ ...f, ...patch }))
        }
        onClear={clearAll}
        onApply={applyAndClose}
      />
    </div>
  );
}
