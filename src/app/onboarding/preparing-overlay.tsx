"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { finishOnboarding } from "./actions";

const STAGES = ["Menyimpan profil", "Menyiapkan bagan akun", "Membuka periode"] as const;

export function PreparingOverlay({
  businessName,
  coaCount,
  onDone,
}: {
  businessName: string | null;
  coaCount: number;
  onDone: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `key-${Date.now()}`,
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let timer: ReturnType<typeof setInterval> | undefined;
    if (!reduced) {
      timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 900);
    } else {
      setStage(STAGES.length - 1);
    }

    finishOnboarding(keyRef.current).then(
      (res) => {
        if (res?.ok) {
          // Rayakan spesifik (nama usaha + hasil nyata), lalu lanjut.
          // Otomatis jalan, tombol untuk yang tak sabar.
          setStage(STAGES.length - 1);
          setReady(true);
          doneTimer.current = setTimeout(onDone, reduced ? 1200 : 3200);
        } else {
          setError("Gagal menyiapkan — coba lagi.");
        }
      },
      () => setError("Gagal menyiapkan — coba lagi."),
    );
    return () => {
      if (timer) clearInterval(timer);
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retry() {
    setError(null);
    try {
      const res = await finishOnboarding(keyRef.current);
      if (res?.ok) onDone();
      else setError("Gagal menyiapkan — coba lagi.");
    } catch {
      setError("Gagal menyiapkan — coba lagi.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/95 px-6 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-8 text-center shadow-lg">
        {error ? (
          <>
            <p className="font-display text-lg font-semibold text-ink">{error}</p>
            <Button type="button" onClick={retry} className="mt-4 w-full bg-terra hover:bg-terra/90">
              Coba lagi
            </Button>
          </>
        ) : ready ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 size-10 text-debit" strokeWidth={1.8} />
            <p className="font-display text-2xl leading-tight tracking-tight text-balance text-ink">
              {businessName ? `${businessName} siap dibukukan!` : "Pembukuan Anda siap!"}
            </p>
            <div aria-hidden className="rule-double mx-auto mt-4 max-w-36" />
            <p className="tnum mt-3 text-sm text-ink-soft">
              {coaCount > 0 ? `${coaCount} akun · 12 periode · terkunci rapi` : "Bagan akun · 12 periode · terkunci rapi"}
            </p>
            <Button
              type="button"
              onClick={() => {
                if (doneTimer.current) clearTimeout(doneTimer.current);
                onDone();
              }}
              className="mt-6 w-full bg-terra hover:bg-terra/90"
            >
              Buka dashboard
            </Button>
            <p className="mt-3 text-xs text-ink-soft">Mengalihkan otomatis…</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-2 border-rule border-t-terra" aria-hidden />
            <p className="font-display text-lg font-semibold text-ink">Mempersiapkan pembukuan…</p>
            <ul className="mt-4 space-y-2 text-left text-sm">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      i < stage
                        ? "bg-debit/15 text-debit"
                        : i === stage
                          ? "bg-terra/10 text-terra"
                          : "bg-canvas text-ink-soft"
                    }`}
                  >
                    {i < stage ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={i <= stage ? "text-ink" : "text-ink-soft"}>
                    {i === 1 && businessName ? `Menyiapkan bagan akun ${businessName}` : s}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
