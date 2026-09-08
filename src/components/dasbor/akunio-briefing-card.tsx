"use client";

import { Sparkles, ArrowRight, MessageCircle } from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra/60";

/** Kartu briefing AKUNIO — puncak halaman: display penuh + ritme sendiri. */
export function AkunioBriefingCard({
  sentences,
  assistantSummary,
}: {
  sentences: string[];
  assistantSummary: string;
}) {
  const openAssistant = (prompt?: string) => {
    window.dispatchEvent(
      new CustomEvent("akunio:open-assistant", { detail: { prompt } }),
    );
  };

  return (
    <div
      className="matte-card rounded-2xl border border-terra/30 bg-paper p-6 shadow-xs sm:p-7"
      data-assistant-context={assistantSummary}
      data-testid="dasbor-akunio-briefing"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-terra text-white shadow-xs">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="font-display text-xl font-semibold tracking-tight text-balance text-ink">
              Briefing AKUNIO hari ini
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              Ringkasan deterministik dari jurnal POSTED — bukan karangan AI
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openAssistant()}
          className={`hidden shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-canvas px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-terra/50 hover:text-terra sm:inline-flex ${FOCUS}`}
          data-testid="dasbor-ask-akunio"
        >
          <MessageCircle className="size-3.5" />
          Tanya lanjutan
        </button>
      </div>

      <ul className="mt-5 max-w-prose divide-y divide-rule/60">
        {sentences.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 py-2.5 text-sm leading-relaxed text-pretty text-ink first:pt-0 last:pb-0"
          >
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-terra" />
            <span>{s}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule/60 pt-3.5">
        <button
          type="button"
          onClick={() => openAssistant("Jelaskan kondisi kas saya 7 hari ke depan.")}
          className={`inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-terra/10 hover:text-terra ${FOCUS}`}
        >
          Jelaskan kas 7 hari <ArrowRight className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => openAssistant("Mana piutang yang harus saya tagih duluan?")}
          className={`inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-terra/10 hover:text-terra ${FOCUS}`}
        >
          Mana yang ditagih duluan? <ArrowRight className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => openAssistant("Bandingkan kinerja bulan ini vs bulan lalu.")}
          className={`inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-terra/10 hover:text-terra ${FOCUS}`}
        >
          Bandingkan MoM <ArrowRight className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => openAssistant()}
          className={`inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-terra/10 hover:text-terra sm:hidden ${FOCUS}`}
        >
          Tanya lanjutan <ArrowRight className="size-3" />
        </button>
      </div>
    </div>
  );
}
