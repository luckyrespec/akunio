"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import Image from "next/image";
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
import { AkunioStage, type StageStatus } from "./akunio-stage";
import { usePrefersReducedMotion } from "./use-reduced-motion";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const BASE_STEPS = ["NAMA", "USAHA", "JENIS", "SKALA", "LOKASI", "REFERRAL", "RINGKASAN", "COA"];

const PLACEHOLDERS: Record<string, string> = {
  NAMA: "cth: Budi",
  USAHA: "cth: Warung Barokah",
  JENIS: "cth: warteg, bengkel, toko online…",
  STOK: "cth: rata-rata",
  SKALA: "cth: omzet 20 juta / baru mulai",
  LOKASI: "cth: Yogyakarta (atau Lewati)",
  REFERRAL: "cth: dari teman",
};

/**
 * Bubble pesan yang di-memo: riwayat tidak ikut re-render tiap token
 * stream — hanya bubble stream yang diperbarui per frame. Tanpa ini,
 * React merekonsiliasi seluruh daftar pesan untuk setiap delta kecil
 * dan stream terlihat patah-patah.
 */
const ChatBubble = memo(function ChatBubble({
  role,
  content,
  staticAppear,
  delay,
}: {
  role: "user" | "assistant";
  content: string;
  staticAppear: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={staticAppear ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: "easeOut" }}
      className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs ${
          role === "user"
            ? "rounded-br-md bg-terra text-white"
            : "rounded-bl-md border border-rule bg-paper text-ink"
        }`}
      >
        {content}
      </div>
    </motion.div>
  );
});

export function OnboardingChatClient({
  initialMessages,
  initialStep,
  initialSteps,
  initialPreview,
  initialChips,
  initialBusinessName,
}: {
  initialMessages: Array<{ role: "user" | "assistant"; content: string }>;
  initialStep: string;
  initialSteps: string[];
  initialPreview: AccountDef[] | null;
  initialChips: string[];
  initialBusinessName: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map((m, i) => ({ ...m, id: `init-${i}` })),
  );
  const [chips, setChips] = useState<string[]>(initialChips);
  const [step, setStep] = useState<string>(initialStep);
  const [steps, setSteps] = useState<string[]>(
    initialSteps.length > 0 ? initialSteps : BASE_STEPS,
  );
  const [preview, setPreview] = useState<AccountDef[] | null>(initialPreview);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  // Id pesan yang baru selesai di-stream: teksnya sudah terlihat utuh di
  // bubble stream, jadi bubble finalnya harus muncul diam tanpa animasi
  // entrance (fade/slide) yang menggeser dan "menghancurkan" stream.
  const [freshId, setFreshId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [preparing, setPreparing] = useState(initialStep === "SELESAI");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(initialMessages.length);
  const nextId = () => `m${(idRef.current += 1)}`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Penambat bawah: true selama user di dekat bawah. Diperbarui oleh
  // onScroll container — effect auto-scroll menghormatinya agar tidak
  // merampas bacaan riwayat saat stream berjalan.
  const pinnedRef = useRef(true);
  // Buffer stream: delta jaringan menumpuk di ref, cat hanya disiram ke
  // state sekali per animation frame (maks 1 render/frame, bukan per token).
  const accRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const flushStream = () => {
    rafRef.current = null;
    setStreamText(accRef.current);
  };
  const scheduleFlush = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(flushStream);
  };

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
    // Pin instan ke bawah (tanpa animasi smooth): smooth scroll per token
    // saling membatalkan puluhan kali per detik dan itu sumber utama
    // stream terasa patah-patah. Instant scrollTop mengikuti teks tumbuh
    // seperti ChatGPT/Claude/Gemini.
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, preview, streamText]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  async function send(raw: string) {
    const value = raw.trim();
    if (!value || streaming || preparing) return;
    setText("");
    setChips([]);
    setMessages((m) => [...m, { id: nextId(), role: "user", content: value }]);
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
            accRef.current = acc;
            scheduleFlush();
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
        const assistantId = nextId();
        setMessages((m) => [
          ...m,
          { id: assistantId, role: "assistant", content: (final as { reply: string }).reply },
        ]);
        // Tandai agar bubble final ini dirender statis — stream sudah bagus,
        // jangan dianimasikan lagi setelah selesai.
        setFreshId(assistantId);
        const f = final as { chips: string[]; step: string; coaPreview: AccountDef[] | null; finished: boolean; steps?: string[] };
        setChips(f.chips);
        setStep(f.step);
        if (f.steps && f.steps.length > 0) setSteps(f.steps);
        if (f.coaPreview) setPreview(f.coaPreview);
        if (f.finished) setPreparing(true);
      } else if (acc) {
        // Stream terputus tanpa done (mis. dibatalkan): simpan yang sudah ada.
        setMessages((m) => [...m, { id: nextId(), role: "assistant", content: acc }]);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError" && !timedOut) return;
      const msg = timedOut
        ? "Koneksi lambat — coba kirim ulang ya."
        : "Maaf, ada gangguan sebentar. Coba kirim ulang ya.";
      if (timedOut && acc) {
        // Timeout di tengah stream: simpan potongan yang sudah ada.
        setMessages((m) => [...m, { id: nextId(), role: "assistant", content: acc }]);
      }
      setMessages((m) => [...m, { id: nextId(), role: "assistant", content: msg }]);
      setAnnounce(msg);
    } finally {
      clearTimeout(timeout);
      // Batalkan flush terjadwal agar teks basi tidak sempat tercat lagi
      // setelah bubble stream ditutup (bubble final sudah statis & utuh).
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setStreaming(false);
      setStreamText("");
    }
  }

  /** Saran chip hanya mengisi kotak chat (tidak langsung terkirim). */
  function fillSuggestion(c: string) {
    if (streaming || preparing) return;
    setText(c);
    // Textarea autoresize hanya jalan di event change — selaraskan manual,
    // lalu fokus agar user tinggal tekan Enter.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
      el.focus();
    });
  }

  const stepIndex = steps.indexOf(step);
  const busy = streaming || preparing;
  const reduced = usePrefersReducedMotion();
  const stageStatus: StageStatus = preparing ? "done" : streaming ? "typing" : "idle";

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl gap-8 px-4">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col lg:mx-0">
          <header className="shrink-0 border-b border-rule/60 bg-canvas/95 py-4 backdrop-blur-xs">
            <div className="flex items-center gap-2.5">
              <Image
                src="/brand/akunio-logo-mark.svg"
                alt="Akunio"
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg shadow-xs lg:hidden"
              />
              <div>
                <p className="font-display text-lg font-semibold text-ink">Kenalan dengan Akunio</p>
          <p className="text-xs text-ink-soft">
            {stepIndex >= 0 ? (
              <>Langkah {stepIndex + 1} dari {steps.length} · Penyiapan awal usaha Anda</>
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
              aria-valuemax={steps.length}
              className="mt-2 h-0.5 overflow-hidden rounded-full bg-rule"
            >
              <motion.div
                className="h-full origin-left rounded-full bg-terra"
                initial={false}
                animate={{ scaleX: (stepIndex + 1) / steps.length }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          )}
              </div>
            </div>
        </header>

        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 140;
          }}
          className="paper-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto py-5"
        >
          {messages.map((m, i) => (
            <ChatBubble
              key={m.id}
              role={m.role}
              content={m.content}
              staticAppear={reduced || m.id === freshId}
              delay={Math.min(i, 4) * 0.06}
            />
          ))}
          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line text-ink shadow-xs">
                {streamText || (
                  <span className="inline-flex items-center gap-1 py-1" aria-label="Akunio mengetik">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        animate={reduced ? undefined : { y: [0, -4, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: d * 0.15 }}
                        className="size-1.5 rounded-full bg-terra"
                      />
                    ))}
                  </span>
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
                {chips.map((c, ci) => (
                  <motion.span
                    key={c}
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(ci, 5) * 0.05 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="onboarding-chip"
                      disabled={busy}
                      onClick={() => fillSuggestion(c)}
                      className="rounded-full border-rule bg-paper text-xs shadow-xs hover:border-terra/50 hover:text-terra"
                    >
                      {c}
                    </Button>
                  </motion.span>
                ))}
              </div>
            )}
            <PromptInput onSubmit={() => send(text)}>
              <PromptInputBody>
                <PromptInputTextarea
                  ref={inputRef}
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

        <AkunioStage status={stageStatus} />
      </div>

      {preparing && (
        <PreparingOverlay
          businessName={initialBusinessName}
          coaCount={preview?.length ?? 0}
          onDone={() => (window.location.href = "/dashboard")}
        />
      )}
    </div>
  );
}
