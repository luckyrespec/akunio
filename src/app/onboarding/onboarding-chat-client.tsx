"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AccountDef } from "@/core/accounts/types";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { sendOnboardingMessage } from "./actions";
import { CoaPreview } from "./coa-preview";
import { PreparingOverlay } from "./preparing-overlay";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STEP_ORDER = ["NAMA", "USAHA", "JENIS", "SKALA", "LOKASI", "REFERRAL", "RINGKASAN", "COA"] as const;

const PLACEHOLDERS: Record<string, string> = {
  NAMA: "cth: Budi",
  USAHA: "cth: Warung Barokah",
  JENIS: "cth: warteg, bengkel, toko online…",
  SKALA: "cth: omzet 20 juta, karyawan 3",
  LOKASI: "cth: Yogyakarta (atau Lewati)",
  REFERRAL: "cth: dari teman",
};

export function OnboardingChatClient({
  initialMessages,
  initialStep,
  initialPreview,
  initialChips,
}: {
  initialMessages: ChatMessage[];
  initialStep: string;
  initialPreview: AccountDef[] | null;
  initialChips: string[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [chips, setChips] = useState<string[]>(initialChips);
  const [step, setStep] = useState<string>(initialStep);
  const [preview, setPreview] = useState<AccountDef[] | null>(initialPreview);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [preparing, setPreparing] = useState(initialStep === "SELESAI");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Testability marker: effects run only after hydration commits, so e2e
  // can wait for this instead of racing keystrokes against hydration
  // (pre-hydration typing into the controlled input gets wiped).
  useEffect(() => {
    document.body.dataset.onboardingReady = "1";
    return () => {
      delete document.body.dataset.onboardingReady;
    };
  }, []);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [messages, preview]);

  function send(raw: string) {
    const value = raw.trim();
    if (!value || pending || preparing) return;
    setText("");
    setChips([]);
    setMessages((m) => [...m, { role: "user", content: value }]);
    startTransition(async () => {
      try {
        const res = await sendOnboardingMessage(value);
        setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
        setChips(res.chips ?? []);
        setStep(res.step);
        if (res.coaPreview) setPreview(res.coaPreview);
        if (res.finished) setPreparing(true);
      } catch {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Maaf, ada gangguan sebentar. Coba kirim ulang ya." },
        ]);
      }
    });
  }

  const stepIndex = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const busy = pending || preparing;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-6">
        <header className="sticky top-0 z-10 border-b border-rule/60 bg-canvas/95 py-4 backdrop-blur-xs">
          <p className="font-display text-lg font-semibold text-ink">Kenalan dengan Nara</p>
          <p className="text-xs text-ink-soft">
            {stepIndex >= 0 ? (
              <>Langkah {stepIndex + 1} dari {STEP_ORDER.length} · Penyiapan awal usaha Anda</>
            ) : (
              <>Penyiapan awal usaha Anda</>
            )}
          </p>
        </header>

        <div className="flex-1 space-y-3 py-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs ${
                  m.role === "user"
                    ? "rounded-br-md bg-terra text-white"
                    : "rounded-bl-md border border-rule bg-paper text-ink"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm text-ink-soft">
                <span className="animate-pulse">Nara mengetik…</span>
              </div>
            </div>
          )}
          {step === "COA" && preview && !preparing && (
            <CoaPreview defs={preview} onConfirm={() => send("gunakan ini")} disabled={busy} />
          )}
          <div ref={bottomRef} />
        </div>

        {!preparing && (
          <div className="sticky bottom-4 space-y-2">
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="onboarding-chip"
                    disabled={busy}
                    onClick={() => send(c)}
                    className="rounded-full border-rule bg-paper text-xs shadow-xs hover:border-terra/50 hover:text-terra"
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}
            <PromptInput onSubmit={() => send(text)}>
              <PromptInputBody>
                <PromptInputTextarea
                  data-testid="onboarding-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onSubmit={() => send(text)}
                  placeholder={PLACEHOLDERS[step] ?? "Tulis jawaban…"}
                  disabled={busy}
                  aria-label="Jawaban onboarding"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <span className="text-[11px] text-ink-soft">Enter untuk kirim</span>
                <PromptInputSubmit
                  data-testid="onboarding-send"
                  disabled={busy || text.trim().length === 0}
                  onClick={() => send(text)}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        )}
      </div>

      {preparing && <PreparingOverlay onDone={() => (window.location.href = "/dasbor")} />}
    </div>
  );
}
