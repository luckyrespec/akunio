import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

export interface AkunioLogoV3Props extends SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

/**
 * AkunioMarkV3 - Identitas Visual Akunio v3: The Modern Precision 'A' Book Ledger
 * 1. Monogram 'A' dari sampul buku akuntansi berdiri kokoh.
 * 2. Tulang punggung buku (spine) di tengah memisahkan Debit & Kredit.
 * 3. Kelengkungan daun halaman buku dan lapisan kertas arsip di bagian bawah.
 * 4. Mistar Ganda (Double Rule): Simbol otentik saldo seimbang.
 * 5. Titik Keseimbangan Emerald & Mahkota Berlian di puncak.
 */
export function AkunioMarkV3({ className, ...props }: AkunioLogoV3Props) {
  return (
    <svg
      viewBox='0 0 48 48'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      role='img'
      aria-label='Logo Akunio'
      className={cn(
        'size-9 shrink-0 transition-transform duration-200 hover:scale-105',
        className,
      )}
      {...props}
    >
      <defs>
        <linearGradient
          id='akunio-v3-bg'
          x1='4'
          y1='4'
          x2='44'
          y2='44'
          gradientUnits='userSpaceOnUse'
        >
          <stop offset='0%' stopColor='#b66035' />
          <stop offset='100%' stopColor='#8a3c1a' />
        </linearGradient>
        <linearGradient
          id='akunio-v3-stroke'
          x1='12'
          y1='8'
          x2='36'
          y2='40'
          gradientUnits='userSpaceOnUse'
        >
          <stop offset='0%' stopColor='#ffffff' />
          <stop offset='100%' stopColor='#fdf8f0' />
        </linearGradient>
        <filter
          id='akunio-v3-shadow'
          x='0'
          y='2'
          width='48'
          height='48'
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feDropShadow
            dx='0'
            dy='2.2'
            stdDeviation='2.2'
            floodColor='#240c03'
            floodOpacity='0.32'
          />
        </filter>
      </defs>

      {/* Squircle Base (Paper & Ink Matte) */}
      <rect
        x='3'
        y='3'
        width='42'
        height='42'
        rx='12'
        fill='url(#akunio-v3-bg)'
      />
      <rect
        x='3.5'
        y='3.5'
        width='41'
        height='41'
        rx='11.5'
        stroke='rgba(255,255,255,0.22)'
        strokeWidth='1'
      />

      {/* Geometric A Accounting Book Ledger */}
      <g filter='url(#akunio-v3-shadow)'>
        {/* Kaki Kiri & Kanan (Sampul Buku Luar Hardcover) */}
        <path
          d='M24 8.5L9.5 35.5'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='3.6'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path
          d='M24 8.5L38.5 35.5'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='3.6'
          strokeLinecap='round'
          strokeLinejoin='round'
        />

        {/* Tulang Belakang Buku Tengah */}
        <path
          d='M24 10.5V36'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='2.2'
          strokeLinecap='round'
        />

        {/* Lengkungan Daun Halaman Buku Terbuka Bawah */}
        <path
          d='M9.5 35.5C14 32.5 19 33 24 36C29 33 34 32.5 38.5 35.5'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='3'
          strokeLinecap='round'
          strokeLinejoin='round'
        />

        {/* Lapisan Kertas Buku Kedua */}
        <path
          d='M12.5 38.2C16 36.2 19.8 36.8 24 39C28.2 36.8 32 36.2 35.5 38.2'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='1.8'
          strokeLinecap='round'
          opacity='0.65'
        />

        {/* Mistar Ganda Pembukuan (Double Rule Crossbars) */}
        <path
          d='M15 24.5H33'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='2.6'
          strokeLinecap='round'
        />
        <path
          d='M13.5 29.5H34.5'
          stroke='url(#akunio-v3-stroke)'
          strokeWidth='2.6'
          strokeLinecap='round'
        />

        {/* Titik Saldo Seimbang Emerald */}
        <circle cx='24' cy='24.5' r='2.2' fill='#4ade80' />

        {/* Mahkota Berlian Puncak Buku */}
        <path d='M24 6L26.5 8.5L24 11L21.5 8.5Z' fill='#ffffff' />
      </g>
    </svg>
  )
}

/**
 * AkunioLogoLockupV3 - Logo Lengkap dengan Tipografi Editorial Fraunces
 */
export function AkunioLogoLockupV3({
  className,
  markClassName,
  showTagline = false,
}: {
  className?: string
  markClassName?: string
  showTagline?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3 select-none', className)}>
      <AkunioMarkV3 className={markClassName} />
      <div className='flex flex-col justify-center'>
        <span className='font-display text-2xl font-bold tracking-tight text-ink'>
          Akunio
        </span>
      </div>
    </div>
  )
}
