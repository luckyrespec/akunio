"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  DEFAULT_SEARCH_VIEW_LIMIT,
  filterAccountOptions,
  normalizeAccount,
  type NormalizedAccount,
} from "@/lib/constants";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export interface AccountOption {
  id: string;
  code?: string;
  name?: string;
  label?: string;
}

export interface AccountSelectProps {
  /** List of accounts to select from */
  accounts: AccountOption[];
  /** Currently selected account ID */
  value?: string;
  /** Callback fired when selection changes */
  onValueChange?: (value: string) => void;
  /** Placeholder when no account is selected */
  placeholder?: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional CSS classes for trigger */
  className?: string;
  /** Maximum number of results to display in the dropdown (defaults to global DEFAULT_SEARCH_VIEW_LIMIT = 5) */
  limit?: number;
  /** Debounce delay in ms for search typing (defaults to global DEFAULT_SEARCH_DEBOUNCE_MS = 500ms) */
  debounceMs?: number;
  /** Optional form field name for native form integration */
  name?: string;
  /** Size variant */
  size?: "sm" | "default";
  /** Trigger element ID for label association */
  id?: string;
}

export function AccountSelect({
  accounts = [],
  value = "",
  onValueChange,
  placeholder = "Pilih akun...",
  searchPlaceholder = "Cari kode / nama akun...",
  disabled = false,
  className,
  limit = DEFAULT_SEARCH_VIEW_LIMIT,
  debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  name,
  size = "default",
  id,
}: AccountSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Debounced search with 500ms default
  const debouncedSearch = useDebounce(search, debounceMs);

  // Normalize all account options once or when accounts change
  const normalizedAccounts = React.useMemo(() => {
    return accounts.map(normalizeAccount);
  }, [accounts]);

  // Find currently selected account
  const selectedAccount = React.useMemo(() => {
    if (!value) return null;
    return normalizedAccounts.find((a) => a.id === value) ?? null;
  }, [value, normalizedAccounts]);

  // Filter accounts based on debounced search and limit to global max limit (5)
  const { items: filteredItems, totalMatches, hasMore } = React.useMemo(() => {
    return filterAccountOptions(normalizedAccounts, debouncedSearch, limit);
  }, [normalizedAccounts, debouncedSearch, limit]);

  const isFiltering = search !== debouncedSearch;

  // Focus input automatically when popover opens
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
    }
  }, [open]);

  const handleSelect = (accountId: string) => {
    onValueChange?.(accountId);
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      {/* Hidden input for native HTML form submissions (e.g. Buku Besar GET form) */}
      {name && (
        <input type="hidden" name={name} value={value} />
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-paper px-3 text-left shadow-2xs transition-colors select-none",
              "hover:border-ring/60 focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20",
              size === "sm" ? "h-8 py-1 text-xs" : "h-9 py-1.5 text-sm",
              !selectedAccount && "text-muted-foreground",
              className
            )}
          >
            <div className="flex flex-1 items-center gap-2 overflow-hidden truncate">
              {selectedAccount ? (
                <>
                  {selectedAccount.code && (
                    <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-canvas border border-rule text-ink shrink-0">
                      {selectedAccount.code}
                    </span>
                  )}
                  <span className="truncate text-foreground font-medium">
                    {selectedAccount.name || selectedAccount.label}
                  </span>
                </>
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
          {/* Search Bar with live indicator */}
          <div className="relative flex items-center border-b border-rule pb-2 mb-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground ml-1 mr-2" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md focus-ring"
                aria-label="Hapus pencarian"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Results List (max 5 items) */}
          <div className="space-y-0.5 max-h-60 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {search ? (
                  <p>Tidak ditemukan akun dengan kata kunci &ldquo;{debouncedSearch}&rdquo;</p>
                ) : (
                  <p>Tidak ada akun tersedia</p>
                )}
              </div>
            ) : (
              filteredItems.map((account) => {
                const isSelected = account.id === value;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleSelect(account.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors focus-ring",
                      isSelected
                        ? "bg-terra/10 font-semibold text-terra"
                        : "text-foreground hover:bg-canvas"
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden truncate">
                      {account.code && (
                        <span
                          className={cn(
                            "font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded border shrink-0",
                            isSelected
                              ? "bg-terra/20 border-terra/30 text-terra"
                              : "bg-canvas border-rule text-ink-soft"
                          )}
                        >
                          {account.code}
                        </span>
                      )}
                      <span className="truncate">{account.name || account.label}</span>
                    </div>
                    {isSelected && (
                      <Check className="size-3.5 shrink-0 text-terra" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Summary Footer showing view limit status */}
          {(totalMatches > limit || isFiltering) && (
            <div className="mt-2 space-y-0.5 border-t border-rule/60 px-1 pt-2 pb-0.5 text-[11px] text-muted-foreground">
              <p>
                {isFiltering ? (
                  <span>Menyaring…</span>
                ) : (
                  <span>
                    Menampilkan {filteredItems.length} dari {totalMatches} akun
                  </span>
                )}
              </p>
              <p className="text-ink-soft">Ketik untuk menyaring</p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
