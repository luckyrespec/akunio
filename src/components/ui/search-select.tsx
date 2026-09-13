"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_SEARCH_DEBOUNCE_MS, DEFAULT_SEARCH_VIEW_LIMIT } from "@/lib/constants";
import { useDebounce } from "@/hooks/use-debounce";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchSelectOption {
  id: string;
  /** Badge pendek di kiri (mis. kode akun). */
  prefix?: string;
  label: string;
  /** Teks kecil di kanan baris (mis. jumlah item). */
  meta?: string;
  /** Tampil sebagai saran tersemat di atas hasil (gaya terra). */
  pinned?: boolean;
}

export interface SearchSelectProps {
  options: SearchSelectOption[];
  /** Mode multi-pilih: klik baris men-toggle, dropdown tetap terbuka. */
  multiple?: boolean;
  /** Nilai terpilih (single). */
  value?: string;
  /** Nilai terpilih (multiple). */
  values?: string[];
  onValueChange?: (id: string) => void;
  onValuesChange?: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  /** Pesan saat daftar kosong tanpa kata kunci. */
  emptyText?: string;
  /** Pesan saat pencarian tidak menemukan apa pun. */
  emptyQueryText?: (query: string) => React.ReactNode;
  pinnedLabel?: string;
  limit?: number;
  debounceMs?: number;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  id?: string;
  describedBy?: string;
  /** Hidden input untuk form native (mode single). */
  name?: string;
  footerHint?: string;
  footerText?: (info: { shown: number; total: number; filtering: boolean }) => React.ReactNode;
  /** Konten tambahan di bawah daftar (mis. link "buat akun baru"). */
  children?: React.ReactNode;
}

/** Selector pencarian generik: popover + input dengan debounce + hasil terbatas.
 *  Mesin yang sama dipakai AccountSelect (jurnal/kas-bank) dan filter kategori. */
export function SearchSelect({
  options,
  multiple = false,
  value = "",
  values = [],
  onValueChange,
  onValuesChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  searchAriaLabel = "Cari",
  emptyText = "Tidak ada pilihan tersedia",
  emptyQueryText,
  pinnedLabel,
  limit = DEFAULT_SEARCH_VIEW_LIMIT,
  debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  disabled = false,
  size = "default",
  className,
  id,
  describedBy,
  name,
  footerHint,
  footerText,
  children,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search, debounceMs);

  const selectedIds = React.useMemo(
    () => (multiple ? new Set(values) : new Set(value ? [value] : [])),
    [multiple, value, values],
  );
  const selectedOptions = React.useMemo(
    () => options.filter((o) => selectedIds.has(o.id)),
    [options, selectedIds],
  );

  const matches = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.prefix, o.label, o.meta].some((t) => t?.toLowerCase().includes(q)),
    );
  }, [options, debouncedSearch]);

  const pinnedItems = React.useMemo(() => options.filter((o) => o.pinned), [options]);
  const pinnedIdSet = React.useMemo(() => new Set(pinnedItems.map((o) => o.id)), [pinnedItems]);
  const shownItems = React.useMemo(
    () => matches.filter((o) => !pinnedIdSet.has(o.id)).slice(0, limit),
    [matches, pinnedIdSet, limit],
  );

  const isFiltering = search !== debouncedSearch;
  const total = matches.length;
  const listId = `${id ?? "search-select"}-list`;

  // Fokus otomatis saat popover terbuka.
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Reset pencarian saat menutup.
    if (!next) setSearch("");
  };

  const toggle = (optionId: string) => {
    if (multiple) {
      const next = selectedIds.has(optionId)
        ? values.filter((v) => v !== optionId)
        : [...values, optionId];
      onValuesChange?.(next);
    } else {
      onValueChange?.(optionId);
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full">
      {name && !multiple && <input type="hidden" name={name} value={value} />}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-disabled={disabled}
            aria-describedby={describedBy}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-paper px-3 text-left shadow-2xs transition-colors select-none",
              "hover:border-ring/60 focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20",
              size === "sm" ? "h-8 py-1 text-xs" : "h-9 py-1.5 text-sm",
              selectedOptions.length === 0 && "text-muted-foreground",
              className,
            )}
          >
            <div className="flex flex-1 items-center gap-2 overflow-hidden truncate">
              {selectedOptions.length > 0 ? (
                multiple ? (
                  <span className="truncate font-medium text-foreground">
                    {selectedOptions.length} dipilih
                  </span>
                ) : (
                  <>
                    {selectedOptions[0].prefix && (
                      <span className="shrink-0 rounded border border-rule bg-canvas px-1.5 py-0.5 font-mono text-xs font-semibold text-ink">
                        {selectedOptions[0].prefix}
                      </span>
                    )}
                    <span className="truncate font-medium text-foreground">
                      {selectedOptions[0].label}
                    </span>
                  </>
                )
              ) : (
                <span className="truncate">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground opacity-70" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-[280px] max-w-[92vw] p-2"
          align="start"
        >
          {/* Search bar */}
          <div className="relative mb-1.5 flex items-center border-b border-rule pb-2">
            <Search className="ml-1 mr-2 size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Hapus pencarian"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Hasil */}
          <div id={listId} className="max-h-60 space-y-0.5 overflow-y-auto">
            {pinnedItems.length > 0 && (
              <div className="pb-1.5">
                {pinnedLabel && (
                  <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold text-terra">
                    {pinnedLabel}
                  </p>
                )}
                {pinnedItems.map((option) => {
                  const isSelected = selectedIds.has(option.id);
                  return (
                    <button
                      key={`pin-${option.id}`}
                      type="button"
                      onClick={() => toggle(option.id)}
                      aria-pressed={multiple ? isSelected : undefined}
                      className={cn(
                        "focus-ring flex w-full items-center justify-between gap-2 rounded-lg border border-terra/25 bg-terra/[0.06] px-2.5 py-2 text-left text-xs transition-colors",
                        isSelected ? "font-semibold text-terra" : "text-foreground hover:bg-terra/10",
                      )}
                    >
                      <div className="flex items-center gap-2 overflow-hidden truncate">
                        {option.prefix && (
                          <span className="shrink-0 rounded border border-terra/30 bg-terra/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-terra">
                            {option.prefix}
                          </span>
                        )}
                        <span className="truncate">{option.label}</span>
                      </div>
                      {isSelected && <Check className="size-3.5 shrink-0 text-terra" />}
                    </button>
                  );
                })}
              </div>
            )}

            {shownItems.length === 0 && pinnedItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {debouncedSearch ? (
                  emptyQueryText ? (
                    emptyQueryText(debouncedSearch)
                  ) : (
                    <p>Tidak ada hasil untuk &ldquo;{debouncedSearch}&rdquo;</p>
                  )
                ) : (
                  <p>{emptyText}</p>
                )}
              </div>
            ) : (
              shownItems.map((option) => {
                const isSelected = selectedIds.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(option.id)}
                    aria-pressed={multiple ? isSelected : undefined}
                    className={cn(
                      "focus-ring flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-terra/10 font-semibold text-terra"
                        : "text-foreground hover:bg-canvas",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden truncate">
                      {option.prefix && (
                        <span
                          className={cn(
                            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                            isSelected
                              ? "border-terra/30 bg-terra/20 text-terra"
                              : "border-rule bg-canvas text-ink-soft",
                          )}
                        >
                          {option.prefix}
                        </span>
                      )}
                      <span className="truncate">{option.label}</span>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      {option.meta && (
                        <span className="tnum font-mono text-[10px] text-ink-soft">
                          {option.meta}
                        </span>
                      )}
                      {isSelected && <Check className="size-3.5 shrink-0 text-terra" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer status */}
          {(total > limit || isFiltering) && footerText && (
            <div className="mt-2 space-y-0.5 border-t border-rule/60 px-1 pb-0.5 pt-2 text-[11px] text-muted-foreground">
              <p role="status">{footerText({ shown: shownItems.length + pinnedItems.length, total, filtering: isFiltering })}</p>
              {footerHint && <p className="text-ink-soft">{footerHint}</p>}
            </div>
          )}

          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}
