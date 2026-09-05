"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const INK = "#232a33";
const PAPER = "#fbfaf6";
const TERRA = "#a8562f";
const DEBIT = "#3e7c5a";
const CREDIT = "#9c5a38";
const SOFT = "#64696f";
const RULE = "#e7e1d4";

function Slip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 92" className={className} aria-hidden>
      <path
        d="M6 4h60v72l-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6L6 82V4Z"
        fill={PAPER}
        stroke={INK}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M18 22h36M18 32h36M18 42h24" stroke={SOFT} strokeWidth={4} strokeLinecap="round" />
      <text x="18" y="66" fontSize="14" fontWeight="800" fill={INK} fontFamily="Plus Jakarta Sans, sans-serif">
        Rp
      </text>
      <circle cx="56" cy="62" r="8" fill={TERRA} />
      <path d="M52.5 62l2.4 2.4 4.2-4.6" stroke={PAPER} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FloatSlip({ className, delay = 0, distance = 8, duration = 5 }: { className?: string; delay?: number; distance?: number; duration?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <Slip className={className} />;
  return (
    <motion.div
      className={cn("absolute", className)}
      animate={{ y: [0, -distance, 0], rotate: [0, 3, -2, 0] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <Slip className="h-full w-full drop-shadow-sm" />
    </motion.div>
  );
}

function Shopkeeper({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 240" className={className} role="img" aria-label="Pemilik usaha tersenyum memegang ponsel">
      {/* badan + celemek */}
      <path d="M60 128 Q100 112 140 128 L150 230 H50 Z" fill={TERRA} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M78 140h44v52a8 8 0 0 1-8 8H86a8 8 0 0 1-8-8v-52Z" fill={PAPER} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M78 152h44" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.25} />
      {/* lengan kiri melambai */}
      <path d="M60 138 Q34 128 30 100" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <circle cx="30" cy="94" r="9" fill={PAPER} stroke={INK} strokeWidth={4} />
      {/* kepala */}
      <circle cx="100" cy="72" r="34" fill={PAPER} stroke={INK} strokeWidth={5} />
      {/* kerudung */}
      <path d="M66 72a34 34 0 0 1 68 0v-6a34 30 0 0 0-68 0v6Z" fill={TERRA} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M66 70a34 34 0 0 1 10-22" fill="none" stroke={PAPER} strokeWidth={4} strokeLinecap="round" opacity={0.7} />
      {/* wajah */}
      <circle cx="88" cy="74" r="3.4" fill={INK} />
      <circle cx="112" cy="74" r="3.4" fill={INK} />
      <path d="M88 88q12 10 24 0" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx="80" cy="82" r="4" fill={TERRA} opacity={0.35} />
      <circle cx="120" cy="82" r="4" fill={TERRA} opacity={0.35} />
      {/* lengan kanan + ponsel */}
      <path d="M140 138q26-8 30-30" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <rect x="158" y="78" width="30" height="52" rx="8" transform="rotate(12 173 104)" fill={INK} />
      <rect x="163" y="86" width="20" height="30" rx="3" transform="rotate(12 173 104)" fill={PAPER} />
      <circle cx="176" cy="122" r="2.4" transform="rotate(12 176 122)" fill={PAPER} />
    </svg>
  );
}

function LedgerBook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 220" className={className} role="img" aria-label="Buku jurnal seimbang">
      <path d="M20 40 Q80 26 150 40 Q220 26 280 40 V180 Q220 166 150 180 Q80 166 20 180 Z" fill={PAPER} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M150 40 V180" stroke={INK} strokeWidth={4} />
      <text x="52" y="70" fontSize="13" fontWeight="800" letterSpacing="2" fill={DEBIT} fontFamily="Plus Jakarta Sans, sans-serif">DEBIT</text>
      <text x="198" y="70" fontSize="13" fontWeight="800" letterSpacing="2" fill={CREDIT} fontFamily="Plus Jakarta Sans, sans-serif">KREDIT</text>
      {[86, 104, 122].map((y) => (
        <g key={y}>
          <path d={`M34  ${y}h84`} stroke={RULE} strokeWidth={5} strokeLinecap="round" />
          <path d={`M182 ${y}h84`} stroke={RULE} strokeWidth={5} strokeLinecap="round" />
        </g>
      ))}
      <path d="M34 140h84M182 140h84" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M34 148h84M182 148h84" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx="150" cy="196" r="20" fill={DEBIT} stroke={INK} strokeWidth={4} />
      <path d="M141 196l6.5 6.5L160 190" stroke={PAPER} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockBadge({ className, label = "POSTED" }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-full border border-rule bg-paper py-1.5 pr-4 pl-1.5 shadow-sm", className)}>
      <span className="grid size-8 place-items-center rounded-full bg-terra">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke={PAPER} strokeWidth={2.4} strokeLinecap="round" aria-hidden>
          <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <span className="text-[11px] font-bold tracking-[0.12em] text-ink">{label}</span>
    </div>
  );
}

export function HeroStage() {
  return (
    <div className="relative mx-auto aspect-[7/6] w-full max-w-[560px]" aria-hidden={false}>
      <svg viewBox="0 0 560 480" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d="M60 30h440a40 40 0 0 1 40 40v360a40 40 0 0 1-40 40H60a40 40 0 0 1-40-40V70a40 40 0 0 1 40-40Z" fill={PAPER} stroke={RULE} strokeWidth={3} />
        <path d="M150 150 C 240 190, 320 190, 400 130" fill="none" stroke={TERRA} strokeWidth={4} strokeDasharray="2 12" strokeLinecap="round" opacity={0.8} />
        <circle cx="472" cy="76" r="26" fill={TERRA} opacity={0.14} />
        <circle cx="88" cy="392" r="34" fill={DEBIT} opacity={0.1} />
      </svg>
      <Shopkeeper className="absolute bottom-[4%] left-[2%] w-[38%]" />
      <div className="absolute right-[2%] bottom-[6%] w-[62%]">
        <LedgerBook className="h-auto w-full drop-shadow-sm" />
      </div>
      <FloatSlip className="top-[6%] left-[38%] h-20 w-16 -rotate-12" delay={0} />
      <FloatSlip className="top-[26%] left-[52%] h-16 w-12 rotate-6" delay={1.2} distance={10} duration={6} />
      <FloatSlip className="top-[10%] right-[8%] h-14 w-11 rotate-12" delay={2.1} distance={6} duration={4.4} />
      <LockBadge className="absolute top-[46%] right-[4%] origin-top-right scale-90 sm:scale-100" />
    </div>
  );
}

function SceneShell({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cn("rounded-xl border border-rule bg-paper p-4 shadow-xs", className)}>
      {children}
    </div>
  );
}

export function ProblemUnbalanced() {
  return (
    <SceneShell label="Timbangan debit dan kredit tidak seimbang">
      <svg viewBox="0 0 220 150" className="h-auto w-full">
        <path d="M110 18v78M60 128h100" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        <path d="M52 40 L110 30 M110 30 L168 52" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        <circle cx="110" cy="28" r="6" fill={TERRA} stroke={INK} strokeWidth={3} />
        <g>
          <path d="M52 40l-24 34h48Z" fill={PAPER} stroke={DEBIT} strokeWidth={4} strokeLinejoin="round" />
          <text x="52" y="66" textAnchor="middle" fontSize="12" fontWeight="800" fill={DEBIT} fontFamily="Plus Jakarta Sans, sans-serif">D</text>
        </g>
        <g>
          <path d="M168 52l-24 34h48Z" fill={PAPER} stroke={CREDIT} strokeWidth={4} strokeLinejoin="round" />
          <text x="168" y="78" textAnchor="middle" fontSize="12" fontWeight="800" fill={CREDIT} fontFamily="Plus Jakarta Sans, sans-serif">K</text>
        </g>
        <path d="M186 108l6 12 12-14" stroke={TERRA} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </SceneShell>
  );
}

export function ProblemPileup() {
  return (
    <SceneShell label="Tumpukan nota menumpuk dimakan waktu">
      <svg viewBox="0 0 220 150" className="h-auto w-full">
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`rotate(${-8 + i * 6} 90 110)`}>
            <rect x="48" y={86 - i * 14} width="84" height="34" rx="4" fill={PAPER} stroke={INK} strokeWidth={4} />
            <path d={`M58 ${98 - i * 14}h48M58 ${106 - i * 14}h32`} stroke={SOFT} strokeWidth={3.5} strokeLinecap="round" />
          </g>
        ))}
        <circle cx="168" cy="52" r="30" fill={PAPER} stroke={INK} strokeWidth={5} />
        <path d="M168 52v-18M168 52l13 9" stroke={TERRA} strokeWidth={5} strokeLinecap="round" />
        <path d="M156 22l4-8M180 22l-4-8" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      </svg>
    </SceneShell>
  );
}

export function ProblemTamper() {
  return (
    <SceneShell label="Angka laporan bisa diubah sepihak">
      <svg viewBox="0 0 220 150" className="h-auto w-full">
        <rect x="30" y="30" width="120" height="90" rx="8" fill={PAPER} stroke={INK} strokeWidth={5} />
        <path d="M44 52h64M44 66h64M44 80h40" stroke={SOFT} strokeWidth={4} strokeLinecap="round" />
        <path d="M120 96l14 14" stroke={TERRA} strokeWidth={7} strokeLinecap="round" />
        <path d="M112 118l22-4-4 22-18-18Z" fill={TERRA} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M168 40l22 38h-44Z" fill={PAPER} stroke={TERRA} strokeWidth={5} strokeLinejoin="round" />
        <path d="M168 56v12" stroke={TERRA} strokeWidth={5} strokeLinecap="round" />
        <circle cx="168" cy="80" r="3" fill={TERRA} />
      </svg>
    </SceneShell>
  );
}

export function LevelJourney() {
  return (
    <div role="img" aria-label="Dari catatan chaos menjadi laporan naik kelas" className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <SceneShell label="Sebelum: catatan tercecer" className="opacity-80 saturate-50">
        <svg viewBox="0 0 200 160" className="h-auto w-full">
          <g transform="rotate(-14 70 90)">
            <rect x="34" y="60" width="72" height="60" rx="4" fill={PAPER} stroke={INK} strokeWidth={4} />
            <path d="M44 76h52M44 88h52M44 100h30" stroke={SOFT} strokeWidth={3.5} strokeLinecap="round" />
          </g>
          <g transform="rotate(10 140 100)">
            <rect x="104" y="70" width="72" height="60" rx="4" fill={PAPER} stroke={INK} strokeWidth={4} />
            <path d="M114 86h52M114 98h30" stroke={SOFT} strokeWidth={3.5} strokeLinecap="round" />
          </g>
          <circle cx="100" cy="52" r="17" fill={PAPER} stroke={INK} strokeWidth={4} />
          <path d="M92 52h16" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <path d="M88 62q12 6 24 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        </svg>
        <p className="mt-2 text-center text-sm font-semibold text-ink-soft">Nota di kresek, angka di kepala</p>
      </SceneShell>
      <svg viewBox="0 0 48 48" className="w-8 shrink-0 sm:w-12" aria-hidden>
        <path d="M8 24h28M24 12l12 12-12 12" fill="none" stroke={TERRA} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="rounded-xl border border-rule bg-paper p-4 shadow-sm ring-2 ring-debit/40">
        <svg viewBox="0 0 200 160" className="h-auto w-full" role="img" aria-label="Sesudah: laporan rapi siap dibawa ke bank">
          <rect x="40" y="26" width="120" height="108" rx="10" fill={PAPER} stroke={INK} strokeWidth={5} />
          <path d="M40 52h120" stroke={INK} strokeWidth={3.5} />
          <text x="100" y="44" textAnchor="middle" fontSize="12" fontWeight="800" letterSpacing="1.5" fill={INK} fontFamily="Plus Jakarta Sans, sans-serif">LABA RUGI</text>
          <path d="M56 70h88M56 84h88M56 98h56" stroke={SOFT} strokeWidth={4} strokeLinecap="round" />
          <path d="M56 116h88M56 122h88" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M118 66l10 24 22-34" fill="none" stroke={DEBIT} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="140" cy="32" r="5" fill={TERRA} />
        </svg>
        <p className="mt-2 text-center text-sm font-semibold text-ink">Laporan rapi, siap dibawa ke bank</p>
      </div>
    </div>
  );
}
