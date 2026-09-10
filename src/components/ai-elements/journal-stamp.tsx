"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, Loader2, Lock, Undo2 } from "lucide-react";
import { getJournalDetailAction } from "@/server/actions/journal.actions";
import { cn } from "@/lib/utils";

export type PostingStampKind = "journal" | "invoice" | "reversal" | "draft" | "opname" | "kontak" | "faktur";

interface JournalStampProps {
  kind: PostingStampKind;
  /** Nomor dokumen utama: JE / faktur / jurnal pembalik. */
  number: string;
  /** Keterangan tambahan (memo jurnal / nomor lawan). */
  caption?: string;
  /** Tujuan tautan "Lihat". */
  href: string;
  /** Id entri jurnal (untuk aksi Batalkan). */
  entryId?: string;
  /** Dipanggil saat Batalkan diklik — pemanggil membuka kartu persetujuan reversal. */
  onReverse?: (entryId: string, number: string) => void;
  /** Id kontak (untuk tombol Lihat Kontak). */
  contactId?: string;
  /** Dipanggil saat Lihat Kontak diklik — pemanggil membuka drawer kontak. */
  onOpenContact?: (contactId: string) => void;
  /** Nomor faktur (untuk tombol Lihat Faktur). */
  invoiceNumber?: string;
  /** Dipanggil saat Lihat Faktur diklik — pemanggil membuka drawer faktur. */
  onOpenInvoice?: (invoiceNumber: string) => void;
}

const KIND_LABEL: Record<PostingStampKind, string> = {
  journal: "Terposting & Terkunci",
  invoice: "Faktur Terposting ke Jurnal",
  reversal: "Pembalik Terposting & Terkunci",
  draft: "Draft Menunggu Review",
  opname: "Stok Opname Selesai",
  kontak: "Kontak Terdaftar",
  faktur: "Faktur Dibuat",
};

/**
 * Stempel ledger untuk hasil posting di chat: nomor dokumen yang sah,
 * status finalitas, dan jalan kembali — ritual yang sama seperti
 * layar posting manual, dirender statis agar nyaman diulang ratusan kali.
 */
export function JournalStampCard({ kind, number, caption, href, entryId, onReverse, contactId, onOpenContact, invoiceNumber, onOpenInvoice }: JournalStampProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [lines, setLines] = React.useState<
    Array<{ accountCode: string; accountName: string; debitMinor: string; creditMinor: string }> | null
  >(null);
  const [linesLoading, setLinesLoading] = React.useState(false);

  const toggleLines = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (lines || linesLoading || kind !== "journal") return;
    setLinesLoading(true);
    try {
      const res = await getJournalDetailAction(number);
      if (res.ok && res.data) setLines(res.data.lines);
    } catch {
    } finally {
      setLinesLoading(false);
    }
  };

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
          {kind === "draft" || kind === "kontak" || kind === "faktur" ? null : <Lock className="size-3" />}
          {kind === "draft" ? "Draft" : kind === "kontak" ? "Baru" : kind === "faktur" ? "Baru" : "Final"}
        </span>
      </div>
      {caption && (
        <p className="mt-2 truncate text-xs text-ink-soft" title={caption}>
          {caption}
        </p>
      )}
      <div className="rule-double mt-3" />
      {kind === "journal" && (
        <div className="mt-2">
          <button
            type="button"
            onClick={toggleLines}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink transition-colors"
            aria-expanded={expanded}
          >
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Sembunyikan rincian" : "Lihat rincian baris"}
          </button>
          {expanded && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-rule bg-canvas">
              {linesLoading ? (
                <p className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-ink-soft">
                  <Loader2 className="size-3 animate-spin" /> Memuat rincian...
                </p>
              ) : lines && lines.length > 0 ? (
                <table className="w-full text-left text-[11px]">
                  <tbody className="divide-y divide-rule/60 text-ink">
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-2.5 py-1.5">
                          <span className="font-mono font-semibold text-terra">{l.accountCode}</span>{" "}
                          <span className="text-ink-soft">{l.accountName}</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {l.debitMinor !== "0" ? `D ${Number(l.debitMinor).toLocaleString("id-ID")}` : ""}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {l.creditMinor !== "0" ? `K ${Number(l.creditMinor).toLocaleString("id-ID")}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-2 text-[11px] text-ink-soft">Rincian tidak tersedia.</p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-3">
        {kind === "kontak" && contactId && onOpenContact ? (
          <button
            type="button"
            onClick={() => onOpenContact(contactId)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
          >
            Lihat Kontak
            <ArrowRight className="size-3" />
          </button>
        ) : kind === "faktur" && invoiceNumber && onOpenInvoice ? (
          <button
            type="button"
            onClick={() => onOpenInvoice(invoiceNumber)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
          >
            Lihat Faktur
            <ArrowRight className="size-3" />
          </button>
        ) : (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
          >
            {kind === "draft" ? "Tinjau Draft" : kind === "opname" ? "Lihat Opname" : "Lihat di Jurnal Umum"}
            <ArrowRight className="size-3" />
          </Link>
        )}
        {kind === "journal" && entryId && onReverse && (
          <button
            type="button"
            onClick={() => onReverse(entryId, number)}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-destructive transition-colors"
          >
            <Undo2 className="size-3" />
            Batalkan
          </button>
        )}
      </div>
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
export function postingStampFor(
  toolName: string,
  result: unknown,
  opts?: { onReverse?: (entryId: string, number: string) => void; onOpenContact?: (contactId: string) => void; onOpenInvoice?: (invoiceNumber: string) => void },
): React.ReactNode {
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
        entryId={asText(payload.journalId) ?? undefined}
        onReverse={opts?.onReverse}
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

  if (toolName === "create_journal_draft") {
    const draftId = asText(payload.draftId);
    if (!draftId) return null;
    return (
      <JournalStampCard
        kind="draft"
        number={asText(payload.memo) ?? "Draft Jurnal"}
        caption="Belum diposting — tinjau dulu sebelum posting."
        href={`/jurnal/ai/${encodeURIComponent(draftId)}`}
      />
    );
  }

  if (toolName === "create_stock_opname") {
    const number = asText(payload.number);
    const id = asText(payload.id);
    if (!number || !id) return null;
    const completed = payload.status === "COMPLETED";
    return (
      <JournalStampCard
        kind={completed ? "opname" : "draft"}
        number={number}
        caption={
          completed
            ? asText(payload.journalNumber)
              ? `Jurnal ${payload.journalNumber} terposting — stok bertambah.`
              : "Selesai tanpa selisih — stok sesuai."
            : "Draf opname — sahkan di Persediaan agar stok bertambah."
        }
        href={`/persediaan/opname/${encodeURIComponent(id)}`}
      />
    );
  }

  if (toolName === "create_contact" || toolName === "update_contact") {
    const contact = asRecord(payload.contact);
    const id = contact ? asText(contact.id) : null;
    if (!contact || !id) return null;
    const name = asText(contact.name) ?? "Kontak";
    const type = asText(contact.type);
    const phone = asText(contact.phone);
    return (
      <JournalStampCard
        kind="kontak"
        number={name}
        caption={[type, phone].filter(Boolean).join(" • ") || undefined}
        href="/kontak"
        contactId={id}
        onOpenContact={opts?.onOpenContact}
      />
    );
  }

  if (toolName === "create_invoice" || toolName === "record_invoice_payment" || toolName === "post_invoice_to_journal") {
    const number = asText(payload.invoiceNumber);
    if (!number) return null;
    const customer = asText(payload.customerName);
    const total =
      asText(payload.totalFormatted) ?? asText(payload.amountPaidFormatted) ?? asText(payload.remainingFormatted);
    return (
      <JournalStampCard
        kind="faktur"
        number={number}
        caption={[customer, total].filter(Boolean).join(" • ") || undefined}
        href="/faktur"
        invoiceNumber={number}
        onOpenInvoice={opts?.onOpenInvoice}
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
