"use client";

import * as React from "react";
import Link from "next/link";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  DEFAULT_SEARCH_VIEW_LIMIT,
  normalizeAccount,
} from "@/lib/constants";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";

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
  /** Debounce delay in ms for search typing (defaults to global DEFAULT_SEARCH_DEBOUNCE_MS = 300ms) */
  debounceMs?: number;
  /** Account IDs to pin as suggestions above results (e.g. AI-mapped candidates) */
  pinnedIds?: string[];
  /** Label for the pinned suggestions section */
  pinnedLabel?: string;
  /** id of an element describing this field (e.g. AI reason text) */
  describedBy?: string;
  /** Show a "create account" escape hatch linking to settings */
  showCreateLink?: boolean;
  /** Optional form field name for native form integration */
  name?: string;
  /** Size variant */
  size?: "sm" | "default";
  /** Trigger element ID for label association */
  id?: string;
}

/** Selector akun — pembungkus tipis SearchSelect (mesin popover + debounce yang sama). */
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
  pinnedIds = [],
  pinnedLabel,
  describedBy,
  showCreateLink = false,
  name,
  size = "default",
  id,
}: AccountSelectProps) {
  const pinnedIdSet = React.useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const options: SearchSelectOption[] = React.useMemo(
    () =>
      accounts.map((raw) => {
        const account = normalizeAccount(raw);
        return {
          id: account.id,
          prefix: account.code || undefined,
          label: account.name || account.label,
          pinned: pinnedIdSet.has(account.id),
        };
      }),
    [accounts, pinnedIdSet],
  );

  return (
    <SearchSelect
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      searchAriaLabel="Cari kode atau nama akun"
      emptyText="Tidak ada akun tersedia"
      emptyQueryText={(query) => (
        <p>Tidak ditemukan akun dengan kata kunci &ldquo;{query}&rdquo;</p>
      )}
      pinnedLabel={pinnedLabel}
      limit={limit}
      debounceMs={debounceMs}
      disabled={disabled}
      size={size}
      className={className}
      id={id}
      describedBy={describedBy}
      name={name}
      footerHint="Ketik untuk menyaring"
      footerText={({ shown, total, filtering }) =>
        filtering ? (
          <span>Menyaring…</span>
        ) : (
          <span>
            Menampilkan {shown} dari {total} akun
          </span>
        )
      }
    >
      {showCreateLink && (
        <Link
          href="/pengaturan"
          className="mt-1.5 flex items-center justify-center gap-1 rounded-lg border border-dashed border-rule px-2.5 py-2 text-[11px] font-medium text-ink-soft transition-colors hover:border-terra/40 hover:text-terra"
        >
          Akun belum ada? Buat di Pengaturan
        </Link>
      )}
    </SearchSelect>
  );
}
