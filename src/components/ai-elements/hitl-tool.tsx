"use client";

import * as React from "react";
import { ShieldCheck, Zap, Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface HitlToolProps {
  allowAll: boolean;
  onToggle: () => void;
  className?: string;
  disabled?: boolean;
}

export function HitlTool({
  allowAll,
  onToggle,
  className,
  disabled = false,
}: HitlToolProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            "group flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors shadow-2xs",
            allowAll
              ? "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              : "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20",
            className,
          )}
        >
          {allowAll ? (
            <Zap className="size-3.5 text-amber-600 animate-pulse" />
          ) : (
            <ShieldCheck className="size-3.5 text-emerald-600" />
          )}
          <span>{allowAll ? "Otomatis" : "Izin Transaksi"}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        className="w-72 rounded-2xl border border-rule bg-paper p-3.5 text-xs text-ink shadow-lg pointer-events-none"
      >
        <div className="flex items-center gap-2 font-display font-semibold text-ink">
          {allowAll ? (
            <Zap className="size-4 text-amber-600" />
          ) : (
            <ShieldCheck className="size-4 text-emerald-600" />
          )}
          <span>{allowAll ? "Mode Eksekusi Otomatis" : "Mode Izin Transaksi"}</span>
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
          {allowAll
            ? "Nara langsung memposting jurnal dan mengeksekusi transaksi secara otomatis tanpa meminta konfirmasi manual."
            : "Aman dan terkendali. Setiap pencatatan transaksi, pembuatan jurnal, atau perubahan akun wajib Anda setujui terlebih dahulu."}
        </p>

        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-canvas/70 px-2 py-1 text-[10px] font-medium text-ink-soft border border-rule/50">
          <Info className="size-3 text-terra shrink-0" />
          <span>Klik tombol untuk beralih mode.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
