import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export interface AkunioLogoProps extends SVGProps<SVGSVGElement> {
  className?: string;
  variant?: "mark" | "full" | "monochrome";
  size?: number | string;
}

/**
 * AkunioMark - Identitas Visual Resmi Akunio
 * 1. Monogram 'A': Dua kaki diagonal melambangkan Debit & Kredit.
 * 2. Mistar Ganda (Double Rule): Simbol otentik akuntansi untuk saldo seimbang.
 * 3. Titik Puncak (Apex Node): Presisi AI dalam pencatatan ledger.
 * 4. Squircle Matte: Sesuai tema Paper & Ink Matte.
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
          <stop offset="100%" stopColor="#914522" />
        </linearGradient>
        <linearGradient id="akunio-inner-white" x1="12" y1="10" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-paper, #ffffff)" />
          <stop offset="100%" stopColor="#fdf9f2" />
        </linearGradient>
        <filter id="akunio-mark-shadow" x="0" y="2" width="48" height="48" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#351608" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* Squircle Background */}
      <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#akunio-mark-gradient)" />
      <rect x="3.5" y="3.5" width="41" height="41" rx="11.5" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />

      {/* Mark Geometri: Huruf A Ledger & Balance Bars */}
      <g filter="url(#akunio-mark-shadow)">
        {/* Kaki Kiri & Kanan (Debit & Kredit) */}
        <path
          d="M24 10.5L13 36.5"
          stroke="url(#akunio-inner-white)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24 10.5L35 36.5"
          stroke="url(#akunio-inner-white)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Mistar Ganda Pembukuan (Double Rule) */}
        <path
          d="M17.5 25.5H30.5"
          stroke="url(#akunio-inner-white)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M16 29.8H32"
          stroke="url(#akunio-inner-white)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        {/* Puncak AI Apex Node */}
        <circle cx="24" cy="10.5" r="2.2" fill="var(--color-paper, #ffffff)" />
      </g>
    </svg>
  );
}

/**
 * AkunioLogoLockup - Logo lengkap (Icon Mark + Wordmark Tipografi)
 */
export function AkunioLogoLockup({
  className,
  markClassName,
  showTagline = true,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <AkunioMark className={markClassName} />
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-display text-xl font-bold tracking-tight">
          Akunio
        </span>
        {showTagline && (
          <span className="rounded-md bg-terra/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-terra">
            AI
          </span>
        )}
      </div>
    </div>
  );
}