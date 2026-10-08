"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, SlidersHorizontal, X } from "lucide-react";
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

/**
 * FilterDrawer — cangkang sheet filter kanan yang dipakai semua tabel.
 * Pola ledger: tombol Filter + badge, chips aktif, draft di caller,
 * konten seksi menyesuaikan kebutuhan tiap tabel via `children`.
 */

export function FilterDrawer({
  open,
  onOpenChange,
  title,
  description,
  testId,
  onClear,
  onApply,
  clearLabel = "Bersihkan semua",
  applyLabel = "Terapkan",
  activeCount = 0,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  testId?: string;
  onClear: () => void;
  onApply: () => void;
  clearLabel?: string;
  applyLabel?: string;
  /** Jumlah grup filter aktif — tampil sebagai badge pada tombol terapkan. */
  activeCount?: number;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid={testId}
        className="w-full gap-0 overflow-y-auto border-rule bg-paper p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-rule p-5 text-left">
          <SheetTitle className="font-display text-lg font-semibold text-ink">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs text-ink-soft">{description}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-6 p-5">{children}</div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-rule p-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="h-9 rounded-xl text-xs text-ink-soft"
          >
            {clearLabel}
          </Button>
          <Button
            type="button"
            onClick={onApply}
            className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white transition-all hover:bg-terra/90 active:scale-[0.98]"
          >
            {applyLabel}
            {activeCount > 0 && (
              <span
                key={activeCount}
                className="ml-1.5 animate-in rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold fade-in-0 zoom-in-50 duration-150"
              >
                {activeCount}
              </span>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Satu seksi dalam drawer: judul mono uppercase + isi. */
export function FilterSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          {title}
        </h3>
        {hint ? <p className="mt-1 text-[11px] text-ink-soft">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Pilihan tersegmentasi (satu nilai aktif). */
export function FilterSegGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "min-h-8 rounded-lg px-3 py-1.5 font-mono text-xs font-medium whitespace-nowrap transition-all active:scale-[0.97]",
            value === o.value
              ? "bg-ink text-paper"
              : "border border-rule bg-paper text-ink-soft hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rentang tanggal Dari–Sampai (nilai ISO `YYYY-MM-DD`). */
export function FilterDateRange({
  dari,
  sampai,
  onDari,
  onSampai,
  idPrefix,
  dariLabel = "Dari tanggal",
  sampaiLabel = "Sampai tanggal",
}: {
  dari: string;
  sampai: string;
  onDari: (v: string) => void;
  onSampai: (v: string) => void;
  idPrefix: string;
  dariLabel?: string;
  sampaiLabel?: string;
}) {
  const invalid = dari !== "" && sampai !== "" && dari > sampai;
  const hintId = `${idPrefix}-rentang-hint`;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-dari`} className="text-[11px] font-medium text-ink-soft">
            {dariLabel}
          </label>
          <Input
            id={`${idPrefix}-dari`}
            type="date"
            value={dari}
            onChange={(e) => onDari(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? hintId : undefined}
            className={cn("h-9 bg-canvas text-sm", invalid && "border-destructive/60")}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-sampai`} className="text-[11px] font-medium text-ink-soft">
            {sampaiLabel}
          </label>
          <Input
            id={`${idPrefix}-sampai`}
            type="date"
            value={sampai}
            onChange={(e) => onSampai(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? hintId : undefined}
            className={cn("h-9 bg-canvas text-sm", invalid && "border-destructive/60")}
          />
        </div>
      </div>
      {invalid && (
        <p id={hintId} role="alert" className="text-[11px] font-medium text-destructive">
          Tanggal mulai melewati tanggal akhir — tidak ada baris yang cocok. Sesuaikan salah satunya.
        </p>
      )}
    </div>
  );
}

/** Rentang teks Min–Max (mis. nominal; normalisasi digit di caller). */
export function FilterTextRange({
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
          onChange={(e) => onMin(e.target.value)}
          className="h-9 bg-canvas text-sm"
          aria-label={`${label} minimum`}
        />
        <Input
          inputMode="numeric"
          placeholder="Max"
          value={maxValue}
          onChange={(e) => onMax(e.target.value)}
          className="h-9 bg-canvas text-sm"
          aria-label={`${label} maksimum`}
        />
      </div>
    </div>
  );
}

export interface FilterChip {
  key: string;
  label: string;
  clear: () => void;
}

/** Deretan chip filter aktif + tombol bersihkan (pola ledger/katalog). */
export function FilterChips({
  chips,
  onClearAll,
  testId,
  clearLabel = "Bersihkan",
}: {
  chips: FilterChip[];
  onClearAll: () => void;
  testId?: string;
  clearLabel?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      className="flex animate-in flex-wrap items-center gap-1.5 fade-in-0 duration-150"
      data-testid={testId}
    >
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
        onClick={onClearAll}
        className="ml-1 text-[11px] font-medium text-terra hover:underline"
      >
        {clearLabel}
      </button>
    </div>
  );
}

/** Tombol "Filter" + badge jumlah (pola ledger/katalog). */
export function FilterTriggerButton({
  count,
  onClick,
  testId,
  label = "Filter",
}: {
  count: number;
  onClick: () => void;
  testId?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "h-9 shrink-0 rounded-xl px-3.5 text-xs font-medium transition-colors",
        count > 0
          ? "border-terra/40 bg-terra/10 text-terra hover:bg-terra/15"
          : "border-rule bg-paper text-ink hover:bg-canvas",
      )}
    >
      <SlidersHorizontal className="size-4" />
      {label}
      {count > 0 && (
        <span
          key={count}
          className="ml-1.5 animate-in rounded-full bg-terra px-1.5 py-0.5 text-[10px] font-bold text-white fade-in-0 zoom-in-50 duration-150"
        >
          {count}
        </span>
      )}
    </Button>
  );
}

/**
 * Transisi tabel ↔ empty saat filter berubah (pola ledger/katalog).
 * Dibungkus sekali di caller; kedua cabang dianimasikan masuk/keluar.
 */
export function TableSwap({
  isEmpty,
  empty,
  children,
}: {
  isEmpty: boolean;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {isEmpty ? (
        <motion.div
          key="empty"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          {empty}
        </motion.div>
      ) : (
        <motion.div
          key="table"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Kotak cari toolbar (pola ledger/katalog). */
export function FilterSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 bg-paper pl-9 text-sm"
      />
    </div>
  );
}
