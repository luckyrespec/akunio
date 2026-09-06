import { terbilangRupiah } from "@/core/money/terbilang";
import { cn } from "@/lib/utils";

interface TerbilangTextProps {
  /** Nominal minor; null tidak merender apa pun. */
  minor: bigint | null;
  /** caption: baris di form. body: di halaman detail. */
  variant?: "caption" | "body";
  className?: string;
}

/**
 * Satu-satunya cara merender terbilang di seluruh aplikasi.
 * Gaya baris terbilang kwitansi: serif display diapit tanda #,
 * aksen terra menandakan nilai terhitung langsung. Override
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
        "font-display leading-relaxed text-terra",
        variant === "caption" ? "text-[13px]" : "text-[15px]",
        className
      )}
    >
      <span aria-hidden className="opacity-60">
        #{" "}
      </span>
      {terbilangRupiah(minor)}
      <span aria-hidden className="opacity-60">
        {" "}
        #
      </span>
    </p>
  );
}
