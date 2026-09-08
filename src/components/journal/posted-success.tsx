"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE_CONFIDENT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Satu momen ledger-stamp: lingkaran digambar, centang menekan, serpih kertas mental sekali. */
function Seal({ reduce }: { reduce: boolean }) {
  // Sudut deterministik — stabil antara SSR dan klien, tanpa Math.random.
  const flecks = [
    { angle: -90, dist: 52, size: 6, tone: "bg-terra" },
    { angle: -54, dist: 46, size: 5, tone: "bg-debit" },
    { angle: -18, dist: 58, size: 4, tone: "bg-ink-soft/60" },
    { angle: 18, dist: 48, size: 6, tone: "bg-terra/80" },
    { angle: 54, dist: 56, size: 4, tone: "bg-debit/70" },
    { angle: 90, dist: 50, size: 5, tone: "bg-credit/70" },
    { angle: 126, dist: 46, size: 4, tone: "bg-ink-soft/50" },
    { angle: 162, dist: 57, size: 6, tone: "bg-debit/60" },
    { angle: 198, dist: 48, size: 5, tone: "bg-terra/70" },
    { angle: 234, dist: 54, size: 4, tone: "bg-ink-soft/60" },
  ];

  return (
    <div className="relative mx-auto size-20" aria-hidden="true">
      {/* Cahaya kertas di belakang segel — jawaban state, bukan dekorasi loop. */}
      <div
        className="absolute inset-[-18px] rounded-full"
        style={{ background: "var(--color-glow)" }}
      />
      {/* Gelombang tinta sekali jalan. */}
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full bg-debit/20"
          initial={{ scale: 0.6, opacity: 0.7 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 0.65, ease: EASE_CONFIDENT, delay: 0.12 }}
        />
      )}
      {/* Serpih arsip — mental keluar sekali lalu hilang. */}
      {!reduce &&
        flecks.map((f, i) => {
          const rad = (f.angle * Math.PI) / 180;
          return (
            <motion.span
              key={i}
              className={cn("absolute left-1/2 top-1/2 rounded-full", f.tone)}
              style={{ width: f.size, height: f.size }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
              animate={{
                x: Math.cos(rad) * f.dist,
                y: Math.sin(rad) * f.dist,
                opacity: [0, 1, 0],
                scale: [1, 1, 0.5],
              }}
              transition={{ duration: 0.7, ease: EASE_CONFIDENT, delay: 0.18 + i * 0.015 }}
            />
          );
        })}

      {/* Medali segel. */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center rounded-full border border-debit/25 bg-debit/10 text-debit"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.35, rotate: -10 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.45, ease: EASE_CONFIDENT }}
      >
        <svg viewBox="0 0 64 64" className="size-12" fill="none" role="presentation">
          {reduce ? (
            <>
              <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="2.5" opacity="0.45" />
              <path
                d="M22 33.5 29 40.5 43 24.5"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <motion.circle
                cx="32"
                cy="32"
                r="26"
                stroke="currentColor"
                strokeWidth="2.5"
                opacity="0.45"
                strokeLinecap="round"
                initial={{ pathLength: 0, rotate: -90 }}
                animate={{ pathLength: 1, rotate: 0 }}
                transition={{ duration: 0.55, ease: EASE_CONFIDENT, delay: 0.05 }}
                style={{ transformOrigin: "32px 32px" }}
              />
              {/* Ring buku-buku putus-putus — ciri ledger, mendarat setelah lingkaran penuh. */}
              <motion.circle
                cx="32"
                cy="32"
                r="20.5"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeDasharray="3 4"
                opacity="0.35"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.35 }}
                transition={{ duration: 0.5, ease: EASE_CONFIDENT, delay: 0.3 }}
                style={{ transformOrigin: "32px 32px" }}
              />
              <motion.path
                d="M22 33.5 29 40.5 43 24.5"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.32, ease: EASE_CONFIDENT, delay: 0.38 }}
              />
            </>
          )}
        </svg>
      </motion.div>
    </div>
  );
}

export function PostedSuccess({
  id,
  number,
  totalMinor,
}: {
  id: string;
  number: string;
  totalMinor: bigint;
}) {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const regionRef = useRef<HTMLDivElement>(null);

  // Pindahkan fokus ke status agar pembaca layar langsung mendengar nomor jurnal.
  useEffect(() => {
    regionRef.current?.focus({ preventScroll: true });
  }, []);

  const amount = Money.fromMinor(totalMinor).formatIdr();

  return (
    <motion.div
      ref={regionRef}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      className="matte-card mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-rule bg-paper p-8 text-center outline-none"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_CONFIDENT }}
    >
      <Seal reduce={reduce} />

      <motion.p
        className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_CONFIDENT, delay: reduce ? 0 : 0.3 }}
      >
        Terposting &amp; Terkunci
      </motion.p>
      <motion.p
        className="tnum mt-1 font-display text-3xl font-semibold tracking-tight text-ink"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_CONFIDENT, delay: reduce ? 0 : 0.36 }}
      >
        {number}
      </motion.p>
      <motion.p
        className="tnum mt-1 text-xs text-ink-soft"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_CONFIDENT, delay: reduce ? 0 : 0.42 }}
      >
        {amount} · koreksi hanya via jurnal pembalik
      </motion.p>

      {/* Garis ganda ledger — digambar dari tengah, bukan sekadar muncul. */}
      <div className="mx-auto mt-4 max-w-[220px]" aria-hidden="true">
        {reduce ? (
          <div className="rule-double" />
        ) : (
          <motion.div
            className="rule-double origin-center"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_CONFIDENT, delay: 0.48 }}
          />
        )}
      </div>

      <motion.div
        className="mt-5 flex flex-col justify-center gap-2 sm:flex-row"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_CONFIDENT, delay: reduce ? 0 : 0.54 }}
      >
        {id && (
          <Button
            type="button"
            onClick={() => router.push(`/jurnal/${id}`)}
            className="bg-terra text-xs text-white hover:bg-terra/90"
          >
            Lihat Detail
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/jurnal")}
          className="text-xs"
        >
          Lihat Jurnal Umum
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.reload()}
          className="text-xs"
        >
          Tulis Jurnal Lagi
        </Button>
      </motion.div>
    </motion.div>
  );
}
