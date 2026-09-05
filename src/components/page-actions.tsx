"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PageActions — baris aksi sejajar header halaman (slot `actions` PageHeader).
 *
 * Pola baku yang sebelumnya diduplikasi di tiap halaman:
 * primer terra (aksi utama), sekunder outline (aksi pembanding),
 * ghost (aksi pelengkap seperti "Abaikan"/"Batal").
 *
 * @example
 * <PageHeader
 *   title="..."
 *   actions={
 *     <PageActions>
 *       <PageActionButton variant="ghost" onClick={...}>Abaikan</PageActionButton>
 *       <PageActionButton variant="secondary" onClick={...}>Tandai Selesai</PageActionButton>
 *       <PageActionButton variant="primary" loading={pending} onClick={...}>
 *         Buat Draf Koreksi
 *       </PageActionButton>
 *     </PageActions>
 *   }
 * />
 */
export function PageActions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

type PageActionVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Record<PageActionVariant, string> = {
  primary:
    "h-9 px-4 rounded-xl bg-terra text-white hover:bg-terra/90 text-xs font-semibold shadow-xs transition-transform active:scale-[0.98] disabled:transform-none",
  secondary:
    "h-9 px-4 rounded-xl text-xs font-medium border-rule bg-paper hover:bg-canvas text-ink shadow-xs",
  ghost: "h-9 px-3 rounded-xl text-xs text-ink-soft hover:text-ink",
};

export interface PageActionButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "variant" | "size"> {
  variant?: PageActionVariant;
  /** Tampilkan spinner + nonaktifkan tombol selama operasi berjalan. */
  loading?: boolean;
  /** Ikon opsional di depan label (diatur ke size-3.5 agar konsisten). */
  icon?: React.ReactNode;
}

/**
 * Tombol aksi header. `loading` mengganti ikon dengan spinner;
 * teruskan `asChild` untuk me-render sebagai Link.
 */
export function PageActionButton({
  variant = "primary",
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...props
}: PageActionButtonProps) {
  return (
    <Button
      size="sm"
      variant={variant === "primary" ? "default" : variant === "secondary" ? "outline" : "ghost"}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(VARIANT_CLASS[variant], "[&_svg]:size-3.5", className)}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </Button>
  );
}
