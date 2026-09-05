"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";

export type PostingStampKind = "journal" | "invoice" | "reversal";

interface JournalStampProps {
  kind: PostingStampKind;
  /** Nomor dokumen utama: JE / faktur / jurnal pembalik. */
  number: string;
  /** Keterangan tambahan (memo jurnal / nomor lawan). */
  caption?: string;
  /** Tujuan tautan "Lihat". */
  href: string;
}

const KIND_LABEL: Record<PostingStampKind, string> = {
  journal: "Terposting & Terkunci",
  invoice: "Faktur Terposting ke Jurnal",
  reversal: "Pembalik Terposting & Terkunci",
};

/**
 * Stempel ledger untuk hasil posting di chat: nomor dokumen yang sah,
 * status finalitas, dan jalan kembali — ritual yang sama seperti
 * layar posting manual, dirender statis agar nyaman diulang ratusan kali.
 */
export function JournalStampCard({ kind, number, caption, href }: JournalStampProps) {
  return (
    <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-debit/10 text-debit"
        >
          <CheckCircle2 className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            {KIND_LABEL[kind]}
          </p>
          <p className="tnum truncate font-display text-lg font-semibold tracking-tight text-ink">
            {number}
          </p>
        </div>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-rule bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
          <Lock className="size-3" />
          Final
        </span>
      </div>
      {caption && (
        <p className="mt-2 truncate text-xs text-ink-soft" title={caption}>
          {caption}
        </p>
      )}
      <div className="rule-double mt-3" />
      <Link
        href={href}
        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
      >
        Lihat di Jurnal Umum
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function asText(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Memetakan hasil tool posting menjadi kartu stempel.
 * Mengembalikan null bila bukan hasil posting yang dikenali —
 * pemanggil tetap merender output mentah seperti biasa.
 */
export function postingStampFor(toolName: string, result: unknown): React.ReactNode {
  const data = asRecord(result);
  if (!data || typeof data.success === "boolean" && data.success === false) return null;
  const payload = asRecord(data.data) ?? data;

  if (toolName === "post_journal") {
    const number = asText(payload.number);
    if (!number) return null;
    return (
      <JournalStampCard
        kind="journal"
        number={number}
        caption={asText(payload.memo) ?? undefined}
        href={`/jurnal?highlight=${encodeURIComponent(number)}`}
      />
    );
  }

  if (toolName === "post_invoice_to_journal") {
    const invoiceNumber = asText(payload.invoiceNumber);
    if (!invoiceNumber) return null;
    const entryId = asText(payload.journalEntryId);
    return (
      <JournalStampCard
        kind="invoice"
        number={invoiceNumber}
        caption="Tercatat di buku besar."
        href={entryId ? `/jurnal?highlight=${encodeURIComponent(entryId)}` : "/jurnal"}
      />
    );
  }

  if (toolName === "reverse_journal") {
    const reversalNumber = asText(payload.reversalNumber);
    if (!reversalNumber) return null;
    const target = asText(payload.targetNumber);
    return (
      <JournalStampCard
        kind="reversal"
        number={reversalNumber}
        caption={target ? `Membalikkan ${target}.` : undefined}
        href={`/jurnal?highlight=${encodeURIComponent(reversalNumber)}`}
      />
    );
  }

  return null;
}
