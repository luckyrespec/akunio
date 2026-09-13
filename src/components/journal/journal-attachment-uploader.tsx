"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip } from "lucide-react";
import { attachJournalDocumentAction } from "@/server/actions/journal.actions";

/** Unggah lampiran bukti untuk entri jurnal (draf maupun POSTED).
 *  Baris jurnal tetap terkunci; lampiran hanya memperkaya jejak audit. */
export function JournalAttachmentUploader({
  entryId,
  hint = "Gambar, PDF, CSV, atau Excel. Maks 5 MB.",
}: {
  entryId: string;
  hint?: string;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await attachJournalDocumentAction(entryId, fd);
      if (!res.ok) {
        setStatus({ kind: "err", text: res.error ?? "Gagal mengunggah lampiran." });
        return;
      }
      setStatus({ kind: "ok", text: "Lampiran terunggah." });
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`journal-attachment-${entryId}`}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <label
          htmlFor={`journal-attachment-${entryId}`}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-rule bg-paper px-3 text-xs font-medium text-ink transition-colors hover:bg-canvas"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Paperclip className="size-3.5" />
          )}
          {uploading ? "Mengunggah..." : "Unggah Lampiran"}
        </label>
        <span className="text-[10px] text-ink-soft">{hint}</span>
      </div>
      {status && (
        <p
          role="status"
          className={`text-[11px] ${status.kind === "ok" ? "text-debit" : "text-rose-600"}`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
