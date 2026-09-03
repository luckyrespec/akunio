"use client";

import { useEffect, useRef, useState } from "react";
import { finishOnboarding } from "./actions";
import { Button } from "@/components/ui/button";

const STAGES = ["Menyimpan profil", "Menyiapkan bagan akun", "Membuka periode"] as const;

export function PreparingOverlay({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
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
          // Small beat so the final stage is perceivable (skipped if reduced).
          setTimeout(onDone, reduced ? 0 : 900);
        } else {
          setError("Gagal menyiapkan — coba lagi.");
        }
      },
      () => setError("Gagal menyiapkan — coba lagi."),
    );
    return () => {
      if (timer) clearInterval(timer);
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
        {!error ? (
          <>
            <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-2 border-rule border-t-terra" aria-hidden />
            <p className="font-display text-lg font-semibold text-ink">Mempersiapkan pembukuan…</p>
            <ul className="mt-4 space-y-2 text-left text-sm">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      i < stage
                        ? "bg-emerald-500/15 text-emerald-600"
                        : i === stage
                          ? "bg-terra/10 text-terra"
                          : "bg-canvas text-ink-soft"
                    }`}
                  >
                    {i < stage ? "✓" : i + 1}
                  </span>
                  <span className={i <= stage ? "text-ink" : "text-ink-soft"}>{s}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-semibold text-ink">{error}</p>
            <Button type="button" onClick={retry} className="mt-4 w-full bg-terra hover:bg-terra/90">
              Coba lagi
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
