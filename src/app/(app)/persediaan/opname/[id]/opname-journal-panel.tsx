"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JournalAttachmentUploader } from "@/components/journal/journal-attachment-uploader";
import { Money } from "@/core/money/money";
import { updateOpnameJournalMemoAction } from "@/server/actions/inventory.actions";
import { PostOpnameButton } from "./generate-draft-button";

export interface OpnameJournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  debitMinor: string;
  creditMinor: string;
  memo: string | null;
}

export interface OpnameJournalDoc {
  id: string;
  fileName: string | null;
  sizeBytes: number;
}

/** Panel kanan halaman detail opname: pratinjau & penguncian jurnal penyesuaian. */
export function OpnameJournalPanel({
  opnameId,
  opnameStatus,
  journal,
  documents,
}: {
  opnameId: string;
  opnameStatus: string;
  journal: {
    id: string;
    number: string;
    entryDate: string;
    memo: string;
    status: string;
    lines: OpnameJournalLine[];
  } | null;
  documents: OpnameJournalDoc[];
}) {
  const router = useRouter();
  const [memo, setMemo] = useState(journal?.memo ?? "");
  const [savingMemo, setSavingMemo] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const debitTotal = journal
    ? journal.lines.reduce((acc, l) => acc + BigInt(l.debitMinor), 0n)
    : 0n;
  const creditTotal = journal
    ? journal.lines.reduce((acc, l) => acc + BigInt(l.creditMinor), 0n)
    : 0n;
  const balanced = debitTotal === creditTotal;
  const isDraft = journal?.status === "DRAFT";

  const saveMemo = async () => {
    if (!journal) return;
    setSavingMemo(true);
    setFeedback(null);
    try {
      const res = await updateOpnameJournalMemoAction(opnameId, memo);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      setFeedback({ kind: "ok", text: "Catatan jurnal tersimpan." });
      router.refresh();
    } finally {
      setSavingMemo(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-2xl)] border border-[var(--color-rule)] bg-[var(--color-paper)] shadow-[var(--elevation-sm)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-rule)] p-4">
        <div className="flex items-center gap-2">
          <BookOpenText className="size-4 text-[var(--color-terra)]" />
          <h2 className="font-serif text-base font-medium text-[var(--color-ink)]">
            Jurnal Penyesuaian
          </h2>
        </div>
        {journal && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--color-ink-soft)]">{journal.number}</span>
            <Badge
              variant="outline"
              className={`text-[10px] font-mono ${
                journal.status === "POSTED"
                  ? "border-[var(--color-debit)]/30 bg-[color-mix(in_oklab,var(--color-debit)_10%,transparent)] text-[var(--color-debit)]"
                  : "border-[var(--color-terra)]/30 bg-[color-mix(in_oklab,var(--color-terra)_10%,transparent)] text-[var(--color-terra)]"
              }`}
            >
              {journal.status === "POSTED" ? "Posted" : "Draf"}
            </Badge>
          </div>
        )}
      </div>

      {/* Belum ada jurnal */}
      {!journal && (
        <div className="p-5">
          {opnameStatus === "CANCELLED" ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)]/50 p-4">
              <Trash2 className="mt-0.5 size-4 shrink-0 text-[var(--color-ink-soft)]" />
              <div className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
                <p className="font-medium text-[var(--color-ink)]">Sesi dibatalkan</p>
                <p className="mt-1">
                  Draf jurnalnya sudah dihapus dan stok tidak berubah. Buat sesi opname baru kalau
                  mau menghitung ulang.
                </p>
              </div>
            </div>
          ) : opnameStatus === "COMPLETED" ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)]/50 p-4">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-debit)]" />
              <div className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
                <p className="font-medium text-[var(--color-ink)]">Selesai tanpa jurnal</p>
                <p className="mt-1">
                  Harga modal barang masih Rp0, jadi nilai selisihnya nol dan tidak ada yang perlu
                  dijurnal. Stok fisik tetap diperbarui dan tercatat di kartu stok.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-rule)] bg-[var(--color-canvas)]/40 p-5 text-center">
              <FileText className="mx-auto size-6 text-[var(--color-ink-soft)]/50" />
              <p className="mt-2 font-serif text-sm font-medium text-[var(--color-ink)]">
                Belum ada jurnal
              </p>
              <p className="mx-auto mt-1 max-w-[34ch] text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                Kalau harga modal masih Rp0, isi dulu di tabel kiri supaya selisihnya bernilai.
                Setelah itu klik Buat Draf Jurnal Penyesuaian, hasilnya muncul di sini untuk
                ditinjau.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ada jurnal */}
      {journal && (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-soft)]">
            <span>
              Tanggal <span className="font-mono text-[var(--color-ink)]">{journal.entryDate}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              {balanced ? (
                <>
                  <CheckCircle2 className="size-3.5 text-[var(--color-debit)]" />
                  Seimbang
                </>
              ) : (
                <span className="text-[var(--color-terra)]">Tidak seimbang</span>
              )}
            </span>
          </div>

          {/* Baris jurnal */}
          <div className="overflow-hidden rounded-xl border border-[var(--color-rule)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--color-rule)] bg-[var(--color-canvas)]/50 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Akun</th>
                  <th className="px-3 py-2 text-right font-medium">Debit</th>
                  <th className="px-3 py-2 text-right font-medium">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]/60">
                {journal.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--color-ink)]">
                        <span className="mr-1.5 font-mono text-[10px] text-[var(--color-ink-soft)]">
                          {line.accountCode}
                        </span>
                        {line.accountName}
                      </div>
                      {line.memo && (
                        <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                          {line.memo}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-[var(--color-ink)]">
                      {BigInt(line.debitMinor) > 0n ? Money.fromMinor(line.debitMinor).formatIdr() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-[var(--color-ink)]">
                      {BigInt(line.creditMinor) > 0n ? Money.fromMinor(line.creditMinor).formatIdr() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--color-rule)] bg-[var(--color-canvas)]/40 font-mono text-[11px]">
                <tr>
                  <td className="px-3 py-2 font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold tnum text-[var(--color-ink)]">
                    {Money.fromMinor(debitTotal).formatIdr()}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tnum text-[var(--color-ink)]">
                    {Money.fromMinor(creditTotal).formatIdr()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Catatan jurnal */}
          <div className="space-y-1.5">
            <label
              htmlFor="opname-journal-memo"
              className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
            >
              Catatan Jurnal
            </label>
            <textarea
              id="opname-journal-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={!isDraft}
              rows={2}
              className="w-full rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)]/50 px-3 py-2 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30 disabled:opacity-60"
              placeholder="Contoh: hitung ulang gudang A, 12 September"
            />
            {isDraft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingMemo || memo === journal.memo}
                onClick={saveMemo}
                className="h-8 rounded-xl text-xs"
              >
                {savingMemo ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Simpan Catatan
              </Button>
            )}
          </div>

          {/* Lampiran */}
          <div className="space-y-2 border-t border-[var(--color-rule)]/60 pt-3">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              <Paperclip className="size-3.5" />
              Lampiran
            </div>
            {documents.length > 0 && (
              <ul className="space-y-1">
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      className="flex items-center gap-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-canvas)]/40 px-2.5 py-1.5 text-xs text-[var(--color-ink)] transition-colors hover:border-[var(--color-terra)]/40 hover:text-[var(--color-terra)]"
                    >
                      <FileText className="size-3.5 shrink-0 text-[var(--color-terra)]" />
                      <span className="min-w-0 flex-1 truncate">{doc.fileName ?? "lampiran"}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-soft)]">
                        {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB
                      </span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <JournalAttachmentUploader entryId={journal.id} />
          </div>

          {feedback && (
            <p role="status" className={`text-[11px] ${feedback.kind === "ok" ? "text-[var(--color-debit)]" : "text-rose-600"}`}>
              {feedback.text}
            </p>
          )}

          {/* Aksi posting */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)]/60 pt-3">
            <Link
              href="/jurnal"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-terra)] hover:underline"
            >
              Buka halaman Jurnal <ArrowUpRight className="size-3" />
            </Link>
            {isDraft && <PostOpnameButton opnameId={opnameId} />}
          </div>
        </div>
      )}
    </div>
  );
}
