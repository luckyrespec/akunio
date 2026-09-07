"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "@/lib/utils";

export interface SplitButtonItem {
  /** Teks item menu. */
  label: React.ReactNode;
  /** Aksi saat item dipilih (menu otomatis tertutup). */
  onSelect: () => void;
  /** Opsional untuk e2e (`data-testid`). */
  testId?: string;
}

interface SplitButtonProps {
  /** Label tombol utama. Saat `loading`, spinner tampil otomatis di depannya. */
  children: React.ReactNode;
  /** Aksi tombol utama saat `primaryType="button"`. Diabaikan bila `"submit"`. */
  onPrimary?: () => void;
  /** `"submit"` untuk tombol dalam `<form>`, `"button"` bila aksi via `onPrimary`. */
  primaryType?: "button" | "submit";
  /** Menonaktifkan kedua belahan tombol. */
  disabled?: boolean;
  /** Tampilkan spinner + nonaktifkan interaksi visual tetap via `disabled`. */
  loading?: boolean;
  /** Label aksesibilitas tombol chevron. */
  menuLabel?: string;
  /** Item menu "lainnya" — minimal 1 agar chevron bermakna. */
  items: SplitButtonItem[];
  /** Opsional untuk e2e pada tombol utama (`data-testid`). */
  primaryTestId?: string;
  /** Kelas tambahan pada pembungkus. */
  className?: string;
}

/**
 * SplitButton — pola aksi primer + menu alternatif yang dipakai di semua
 * halaman `/baru`: separuh kiri terra mengeksekusi aksi utama, separuh
 * chevron membuka menu mode lain. Chevron berputar 180° saat menu terbuka.
 *
 * Dipakai di: jurnal baru, kas-bank baru/transfer, faktur baru.
 * Jangan pakai untuk aksi tunggal — gunakan `Button` biasa.
 */
export function SplitButton({
  children,
  onPrimary,
  primaryType = "button",
  disabled = false,
  loading = false,
  menuLabel = "Opsi lainnya",
  items,
  primaryTestId,
  className,
}: SplitButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn("flex items-stretch rounded-xl shadow-xs", className)}>
      <Button
        type={primaryType}
        size="sm"
        disabled={disabled}
        data-testid={primaryTestId}
        onClick={primaryType === "button" ? onPrimary : undefined}
        className="h-9 rounded-l-xl rounded-r-none bg-terra px-5 text-xs font-semibold text-white shadow-none transition-transform hover:bg-terra/90 active:scale-[0.98] disabled:transform-none"
      >
        {loading && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />}
        {children}
      </Button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            aria-label={menuLabel}
            aria-expanded={open}
            className="h-9 rounded-l-none rounded-r-xl border-l border-l-white/25 bg-terra px-2.5 text-white shadow-none hover:bg-terra/90 disabled:transform-none"
          >
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-48 animate-in rounded-xl border-rule bg-paper shadow-md fade-in-0 zoom-in-95 duration-100"
        >
          {items.map((item, i) => (
            <DropdownMenuItem
              key={item.testId ?? (typeof item.label === "string" ? item.label : `item-${i}`)}
              data-testid={item.testId}
              onSelect={item.onSelect}
              className="cursor-pointer py-2 text-xs font-medium"
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
