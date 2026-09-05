"use client";

import { useEffect, useRef, useState } from "react";
import type { AccountDef } from "@/core/accounts/types";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
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
  SKALA: "cth: omzet 20 juta / baru mulai",
  LOKASI: "cth: Yogyakarta (atau Lewati)",
  REFERRAL: "cth: dari teman",
};

export function OnboardingChatClient({
  initialMessages,
  initialStep,
  initialPreview,
  initialChips,
  initialBusinessName,
}: {
  initialMessages: ChatMessage[];
  initialStep: string;
  initialPreview: AccountDef[] | null;
  initialChips: string[];
  initialBusinessName: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [chips, setChips] = useState<string[]>(initialChips);
  const [step, setStep] = useState<string>(initialStep);
  const [preview, setPreview] = useState<AccountDef[] | null>(initialPreview);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [announce, setAnnounce] = useState("");
  const [preparing, setPreparing] = useState(initialStep === "SELESAI");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    // Hanya ikut ke bawah bila user memang sudah di dekat bawah —
    // jangan rampas bacaan riwayat saat stream berjalan.
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 140) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [messages, preview, streamText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(raw: string) {
    const value = raw.trim();
    if (!value || streaming || preparing) return;
    setText("");
    setChips([]);
    setMessages((m) => [...m, { role: "user", content: value }]);
    setStreaming(true);
    setStreamText("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 30000);
    let acc = "";
    try {
      const res = await fetch("/api/onboarding/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("Gagal memproses pesan.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: {
        reply: string;
        chips: string[];
        step: string;
        coaPreview: AccountDef[] | null;
        finished: boolean;
      } | null = null;
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: string;
            delta?: string;
            message?: string;
            reply?: string;
            chips?: string[];
            step?: string;
            coaPreview?: AccountDef[] | null;
            finished?: boolean;
          };
          if (payload.type === "text" && payload.delta) {
            acc += payload.delta;
            setStreamText(acc);
          } else if (payload.type === "done") {
            final = {
              reply: payload.reply ?? acc,
              chips: payload.chips ?? [],
              step: payload.step ?? step,
              coaPreview: payload.coaPreview ?? null,
              finished: !!payload.finished,
            };
          } else if (payload.type === "error") {
            throw new Error(payload.message || "Gagal memproses pesan.");
          }
        }
      }
      if (final) {
        setMessages((m) => [...m, { role: "assistant", content: (final as { reply: string }).reply }]);
        const f = final as { chips: string[]; step: string; coaPreview: AccountDef[] | null; finished: boolean };
        setChips(f.chips);
        setStep(f.step);
        if (f.coaPreview) setPreview(f.coaPreview);
        if (f.finished) setPreparing(true);
      } else if (acc) {
        // Stream terputus tanpa done (mis. dibatalkan): simpan yang sudah ada.
        setMessages((m) => [...m, { role: "assistant", content: acc }]);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError" && !timedOut) return;
      const msg = timedOut
        ? "Koneksi lambat — coba kirim ulang ya."
        : "Maaf, ada gangguan sebentar. Coba kirim ulang ya.";
      if (timedOut && acc) {
        // Timeout di tengah stream: simpan potongan yang sudah ada.
        setMessages((m) => [...m, { role: "assistant", content: acc }]);
      }
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
      setAnnounce(msg);
    } finally {
      clearTimeout(timeout);
      setStreaming(false);
      setStreamText("");
    }
  }

  const stepIndex = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const busy = streaming || preparing;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col px-4">
        <header className="shrink-0 border-b border-rule/60 bg-canvas/95 py-4 backdrop-blur-xs">
          <p className="font-display text-lg font-semibold text-ink">Kenalan dengan Akunio</p>
          <p className="text-xs text-ink-soft">
            {stepIndex >= 0 ? (
              <>Langkah {stepIndex + 1} dari {STEP_ORDER.length} · Penyiapan awal usaha Anda</>
            ) : (
              <>Penyiapan awal usaha Anda</>
            )}
          </p>
          {stepIndex >= 0 && (
            <div
              role="progressbar"
              aria-label="Kemajuan penyiapan"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={STEP_ORDER.length}
              className="mt-2 h-0.5 overflow-hidden rounded-full bg-rule"
            >
              <div
                className="h-full origin-left rounded-full bg-terra transition-transform duration-300 ease-out"
                style={{ transform: `scaleX(${(stepIndex + 1) / STEP_ORDER.length})` }}
              />
            </div>
          )}
        </header>

        <div ref={scrollRef} className="paper-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto py-5">
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
          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line text-ink shadow-xs">
                {streamText || (
                  <span className="animate-pulse text-ink-soft">Akunio mengetik…</span>
                )}
                {streamText && (
                  <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-terra" />
                )}
              </div>
            </div>
          )}
          {step === "COA" && preview && !preparing && (
            <CoaPreview defs={preview} onConfirm={() => send("gunakan ini")} disabled={busy} />
          )}
          <div ref={bottomRef} />
          {announce && (
            <p role="status" className="sr-only">
              {announce}
            </p>
          )}
        </div>

        {!preparing && (
          <div className="shrink-0 space-y-2 pt-2 pb-6">
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
                  isStreaming={streaming}
                  onStop={() => abortRef.current?.abort()}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        )}
      </div>

      {preparing && (
        <PreparingOverlay
          businessName={initialBusinessName}
          coaCount={preview?.length ?? 0}
          onDone={() => (window.location.href = "/dasbor")}
        />
      )}
    </div>
  );
}
