import { terbilangRupiah } from "@/core/money/terbilang";
import { cn } from "@/lib/utils";

interface TerbilangTextProps {
  /** Nominal minor; null tidak merender apa pun. */
  minor: bigint | null;
  /** caption: helper 11px di form. body: teks xs di detail. */
  variant?: "caption" | "body";
  className?: string;
}

/**
 * Satu-satunya cara merender terbilang di seluruh aplikasi.
 * Terra medium di semua varian; ukuran ikut peran. Override
 * hanya lewat className agar hierarki tidak bercabang.
 */
export function TerbilangText({
  minor,
  variant = "caption",
  className,
}: TerbilangTextProps) {
  if (minor === null) return null;
  return (
    <p
      data-testid="kas-bank-terbilang"
      className={cn(
        "leading-relaxed text-terra font-medium",
        variant === "caption" ? "text-[11px]" : "text-xs",
        className
      )}
    >
      {terbilangRupiah(minor)}
    </p>
  );
}
