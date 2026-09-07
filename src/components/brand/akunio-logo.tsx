import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export interface AkunioLogoProps extends SVGProps<SVGSVGElement> {
  className?: string;
  variant?: "mark" | "full" | "monochrome";
  size?: number | string;
}

/**
 * AkunioMark - Identitas Visual Resmi Akunio: The Modern Precision 'A' Book Ledger
 * 1. Monogram 'A' dari sampul luar buku akuntansi berdiri kokoh.
 * 2. Tulang punggung buku (spine) di tengah memisahkan Debit & Kredit.
 * 3. Kelengkungan daun halaman buku (page arch) dan lapisan kertas arsip di bagian bawah.
 * 4. Mistar Ganda (Double Rule): Simbol otentik akuntansi untuk saldo seimbang.
 * 5. Titik Keseimbangan Emerald & Mahkota Berlian di puncak.
 */
export function AkunioMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Akunio Logo"
      className={cn("size-8 shrink-0 transition-transform duration-200", className)}
      {...props}
    >
      <defs>
        <linearGradient id="akunio-mark-gradient" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-terra, #b66035)" />
          <stop offset="100%" stopColor="#8a3c1a" />
        </linearGradient>
        <linearGradient id="akunio-stroke-grad" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-paper, #ffffff)" />
          <stop offset="100%" stopColor="#fdf8f0" />
        </linearGradient>
        <filter id="akunio-mark-shadow" x="0" y="2" width="48" height="48" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2.2" floodColor="#240c03" floodOpacity="0.32" />
        </filter>
      </defs>

      {/* Squircle Background Matte */}
      <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#akunio-mark-gradient)" />
      <rect x="3.5" y="3.5" width="41" height="41" rx="11.5" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />

      {/* Mark Geometri: Buku Akuntansi Presisi 'A' & Mistar Ganda */}
      <g filter="url(#akunio-mark-shadow)">
        {/* Kaki Kiri & Kanan (Sampul Buku Luar Hardcover) */}
        <path
          d="M24 8.5L9.5 35.5"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24 8.5L38.5 35.5"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Tulang Belakang Buku Tengah (Center Spine Gutter) */}
        <path
          d="M24 10.5V36"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Lengkungan Daun Halaman Buku Terbuka Bawah (Book Page Arches) */}
        <path
          d="M9.5 35.5C14 32.5 19 33 24 36C29 33 34 32.5 38.5 35.5"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Lapisan Kertas Buku Kedua (Multi-page Archive Edge) */}
        <path
          d="M12.5 38.2C16 36.2 19.8 36.8 24 39C28.2 36.8 32 36.2 35.5 38.2"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.65"
        />

        {/* Mistar Ganda Pembukuan (Accounting Double Rule Crossbars) */}
        <path
          d="M15 24.5H33"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M13.5 29.5H34.5"
          stroke="url(#akunio-stroke-grad)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        {/* Titik Saldo Seimbang Emerald */}
        <circle cx="24" cy="24.5" r="2.2" fill="#4ade80" />

        {/* Mahkota Berlian Puncak Buku */}
        <path d="M24 6L26.5 8.5L24 11L21.5 8.5Z" fill="#ffffff" />
      </g>
    </svg>
  );
}

/**
 * AkunioLogoLockup - Logo lengkap (Icon Mark + Wordmark Tipografi Akunio, tanpa tag AI)
 */
export function AkunioLogoLockup({
  className,
  markClassName,
  showTagline = false,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <AkunioMark className={markClassName} />
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-display text-xl font-bold tracking-tight text-ink">
          Akunio
        </span>
      </div>
    </div>
  );
}