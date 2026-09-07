"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Lock, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const EASE_OUT_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PROMPT = "catat: beli kertas A4 2 rim, tunai";

const JOURNAL_ROWS = [
  { akun: "Persediaan", debit: "178.000", kredit: null },
  { akun: "PPN masukan", debit: "19.580", kredit: null },
  { akun: "Kas", debit: null, kredit: "197.580" },
] as const;

// Baris jurnal: muncul saat fase mencapai urutannya.
function DemoRow({
  show,
  reduce,
  children,
}: {
  show: boolean;
  reduce: boolean | null;
  children: ReactNode;
}) {
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={{ duration: 0.32, ease: EASE_OUT_SOFT }}
    >
      {children}
    </motion.div>
  );
}

// Urutan demo. Diremount lewat key dari luar untuk putar ulang,
// sehingga state awal cukup diturunkan dari reduce tanpa setState sinkron.
function DemoSequence({ onReplay }: { onReplay: () => void }) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(() => (reduce ? PROMPT : ""));
  const [phase, setPhase] = useState(() => (reduce ? 5 : 0));

  useEffect(() => {
    if (reduce) return;
    const timers: number[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    at(400, () => {
      let i = 0;
      interval = setInterval(() => {
        i += 1;
        setTyped(PROMPT.slice(0, i));
        if (i >= PROMPT.length && interval) clearInterval(interval);
      }, 42);
    });
    at(1000, () => setPhase(1)); // nota masuk
    at(2150, () => setPhase(2)); // baris 1
    at(2400, () => setPhase(3)); // baris 2
    at(2650, () => setPhase(4)); // baris 3
    at(2950, () => setPhase(5)); // seimbang

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (interval) clearInterval(interval);
    };
  }, [reduce]);

  return (
    <>
      {/* Baris prompt */}
      <div className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-rule bg-canvas px-3 text-sm text-ink">
        <span aria-hidden className="text-ink-soft">›</span>
        <span className="truncate">
          {typed}
          {phase < 2 && !reduce ? (
            <span aria-hidden className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-ink-soft align-middle" />
          ) : null}
        </span>
      </div>

      {/* Nota + draf jurnal */}
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Nota */}
        <DemoRow show={phase >= 1} reduce={reduce}>
          <div className="rotate-[-1.5deg] rounded-lg border border-rule bg-canvas p-4 text-sm text-ink">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
              Toko ATK Sentosa
            </p>
            <p className="tnum mt-0.5 text-[11px] text-ink-soft">12 Jun 2026 · Nota #0421</p>
            <div className="mt-3 space-y-1.5 border-t border-dashed border-rule pt-3">
              <div className="flex justify-between gap-2">
                <span>Kertas A4 · 2 rim</span>
                <span className="tnum">178.000</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>PPN 11%</span>
                <span className="tnum">19.580</span>
              </div>
            </div>
            <div className="mt-3 flex justify-between gap-2 border-t border-dashed border-rule pt-2.5 font-semibold">
              <span>TOTAL · TUNAI</span>
              <span className="tnum">197.580</span>
            </div>
          </div>
        </DemoRow>

        {/* Draf jurnal */}
        <div className="overflow-hidden rounded-lg border border-rule">
          <div className="grid grid-cols-[minmax(0,1fr)_84px_84px] items-center gap-2 bg-canvas px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
            <span>Akun</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Kredit</span>
          </div>
          <div className="bg-paper">
            {JOURNAL_ROWS.map((row, i) => (
              <DemoRow key={row.akun} show={phase >= i + 2} reduce={reduce}>
                <div className="grid grid-cols-[minmax(0,1fr)_84px_84px] items-center gap-2 border-t border-rule/60 px-3 py-2.5 text-sm">
                  <span className="truncate text-ink">{row.akun}</span>
                  <span className={`tnum text-right ${row.debit ? "font-medium text-debit" : "text-ink-soft"}`}>
                    {row.debit ?? "—"}
                  </span>
                  <span className={`tnum text-right ${row.kredit ? "font-medium text-ink" : "text-ink-soft"}`}>
                    {row.kredit ?? "—"}
                  </span>
                </div>
              </DemoRow>
            ))}
            {/* Total */}
            <DemoRow show={phase >= 4} reduce={reduce}>
              <div className="grid grid-cols-[minmax(0,1fr)_84px_84px] items-center gap-2 border-t border-rule bg-canvas/60 px-3 py-2.5 text-sm font-semibold">
                <span className="text-ink">Total</span>
                <span className="tnum text-right text-debit">197.580</span>
                <span className="tnum text-right text-ink">197.580</span>
              </div>
            </DemoRow>
          </div>
        </div>
      </div>

      {/* Status keseimbangan */}
      <div className="mt-4 flex min-h-9 flex-wrap items-center justify-between gap-2">
        {phase >= 5 ? (
          reduce ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-debit/30 bg-debit/10 px-3 py-1 text-sm font-medium text-debit">
              <Check aria-hidden className="size-3.5" />
              Seimbang — Debit = Kredit
            </span>
          ) : (
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-debit/30 bg-debit/10 px-3 py-1 text-sm font-medium text-debit"
            >
              <Check aria-hidden className="size-3.5" />
              Seimbang — Debit = Kredit
            </motion.span>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm text-ink-soft">
            <Lock aria-hidden className="size-3.5" />
            Menunggu review Anda…
          </span>
        )}
        <button
          type="button"
          onClick={onReplay}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Putar ulang
        </button>
      </div>
    </>
  );
}

export function HeroDemo() {
  const [run, setRun] = useState(0);

  return (
    <div className="matte-card relative rounded-2xl border border-rule bg-paper p-4 sm:p-5">
      {/* Header kartu */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
          AI capture
        </span>
        <span className="tnum rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
          JE-2026-0147 · Draf
        </span>
      </div>

      <DemoSequence key={run} onReplay={() => setRun((r) => r + 1)} />
    </div>
  );
}
