"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Satu baris mutasi terserialisasi (bigint → string agar lolos Server→Client). */
export interface SerialLedgerRow {
  number: string;
  entryDate: string;
  memo: string;
  debitMinor: string;
  creditMinor: string;
  balanceMinor: string;
}

export type LedgerSisi = "semua" | "debit" | "kredit";

export interface LedgerFilterState {
  preset: string;
  dari: string;
  sampai: string;
  memo: string;
  sisi: LedgerSisi;
  minNominal: string;
  maxNominal: string;
}

export function defaultLedgerFilter(
  init?: Partial<LedgerFilterState>,
): LedgerFilterState {
  return {
    preset: "",
    dari: "",
    sampai: "",
    memo: "",
    sisi: "semua",
    minNominal: "",
    maxNominal: "",
    ...init,
  };
}

/** Jumlah grup filter yang aktif (badge tombol Filter + chip periode). */
export function activeLedgerFilterCount(f: LedgerFilterState): number {
  let n = 0;
  if (f.preset || f.dari || f.sampai) n += 1;
  if (f.memo.trim()) n += 1;
  if (f.sisi !== "semua") n += 1;
  if (f.minNominal || f.maxNominal) n += 1;
  return n;
}

/** Nilai mutasi satu baris (tiap baris tepat satu sisi, per jl_one_side_chk). */
function movementMinor(r: SerialLedgerRow): bigint {
  return BigInt(r.debitMinor) + BigInt(r.creditMinor);
}

export function applyLedgerFilters(
  rows: SerialLedgerRow[],
  f: LedgerFilterState,
): SerialLedgerRow[] {
  const needle = f.memo.trim().toLowerCase();
  const min = f.minNominal ? BigInt(f.minNominal) : null;
  const max = f.maxNominal ? BigInt(f.maxNominal) : null;
  return rows.filter((r) => {
    if (needle && !`${r.number} ${r.memo}`.toLowerCase().includes(needle)) return false;
    if (f.sisi === "debit" && r.debitMinor === "0") return false;
    if (f.sisi === "kredit" && r.creditMinor === "0") return false;
    const v = movementMinor(r);
    if (min !== null && v < min) return false;
    if (max !== null && v > max) return false;
    return true;
  });
}

function SegButton({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
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

const PRESETS = [
  { value: "bulan-ini", label: "Bulan ini" },
  { value: "bulan-lalu", label: "Bulan lalu" },
  { value: "tahun-berjalan", label: "Tahun ini" },
  { value: "semua", label: "Semua" },
];

function RangeGroup({
  label,
  suffix,
  minValue,
  maxValue,
  onMin,
  onMax,
}: {
  label: string;
  suffix?: string;
  minValue: string;
  maxValue: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  const digits = (v: string) => v.replace(/[^\d]/g, "");
  return (
    <div className="space-y-1.5">
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

export function LedgerFilterSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onClear,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: LedgerFilterState;
  onChange: (patch: Partial<LedgerFilterState>) => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="ledger-filter-sheet"
        className="w-full gap-0 overflow-y-auto border-rule bg-paper p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-rule p-5 text-left">
          <SheetTitle className="font-display text-lg font-semibold text-ink">Filter</SheetTitle>
          <SheetDescription className="text-xs text-ink-soft">
            Persempit mutasi berdasarkan periode, nominal, dan sisi.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 p-5">
          {/* Periode (server-side via URL saat Selesai) */}
          <section className="space-y-2.5">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Periode
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preset periode">
              {PRESETS.map((p) => (
                <SegButton
                  key={p.value}
                  active={(value.preset || "semua") === p.value && !value.dari && !value.sampai}
                  onClick={() => onChange({ preset: p.value === "semua" ? "" : p.value, dari: "", sampai: "" })}
                >
                  {p.label}
                </SegButton>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label htmlFor="ledger-sheet-dari" className="text-[11px] font-medium text-ink-soft">
                  Dari tanggal
                </label>
                <Input
                  id="ledger-sheet-dari"
                  type="date"
                  value={value.dari}
                  onChange={(e) => onChange({ dari: e.target.value, preset: "" })}
                  className="h-9 bg-canvas text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ledger-sheet-sampai" className="text-[11px] font-medium text-ink-soft">
                  Sampai tanggal
                </label>
                <Input
                  id="ledger-sheet-sampai"
                  type="date"
                  value={value.sampai}
                  onChange={(e) => onChange({ sampai: e.target.value, preset: "" })}
                  className="h-9 bg-canvas text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] text-ink-soft">
              Periode dimuat ulang dari server beserta saldo awalnya.
            </p>
          </section>

          {/* Nominal (langsung di layar) */}
          <section className="space-y-3">
            <div>
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Nominal Mutasi
              </h3>
              <p className="mt-1 text-[11px] text-ink-soft">
                Kosongkan bila tidak ingin membatasi. Langsung tersaring di layar.
              </p>
            </div>
            <RangeGroup
              label="Nilai Mutasi"
              suffix="Rp"
              minValue={value.minNominal}
              maxValue={value.maxNominal}
              onMin={(v) => onChange({ minNominal: v })}
              onMax={(v) => onChange({ maxNominal: v })}
            />
          </section>

          {/* Sisi */}
          <section className="space-y-2.5">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Sisi
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sisi mutasi">
              <SegButton active={value.sisi === "semua"} onClick={() => onChange({ sisi: "semua" })}>
                Semua
              </SegButton>
              <SegButton active={value.sisi === "debit"} onClick={() => onChange({ sisi: "debit" })}>
                Debit saja
              </SegButton>
              <SegButton active={value.sisi === "kredit"} onClick={() => onChange({ sisi: "kredit" })}>
                Kredit saja
              </SegButton>
            </div>
          </section>

          {value.memo.trim() && (
            <section className="space-y-2.5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Pencarian
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-terra/25 bg-terra/10 px-2.5 py-1 text-[11px] font-medium text-terra">
                  “{value.memo.trim()}”
                  <button
                    type="button"
                    aria-label="Hapus pencarian"
                    onClick={() => onChange({ memo: "" })}
                    className="transition-colors hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </div>
            </section>
          )}
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
            onClick={onApply}
            className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white hover:bg-terra/90"
          >
            Selesai
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
