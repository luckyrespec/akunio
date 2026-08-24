"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDraftAction } from "@/server/actions/ai.actions";
import { uploadDocumentAction } from "@/server/actions/upload.actions";
import { AiStatusCard } from "@/components/ai/status-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ComposerClient({
  quotaAllowed, quotaUsed, quotaLimit,
}: { quotaAllowed: boolean; quotaUsed: number; quotaLimit: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let documentId: string | undefined;
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        const up = await uploadDocumentAction(fd);
        if (!up.ok) { setError(up.error ?? "Gagal unggah."); return; }
        documentId = up.documentId;
      }
      const res = await createDraftAction({ text: text.trim() || undefined, documentId });
      if (!res.ok) { setError(res.error ?? "Gagal membuat draft."); return; }
      router.push(`/jurnal/ai/${res.draftId}`);
    });
  }

  if (!quotaAllowed) {
    return <AiStatusCard state="QUOTA" quotaUsed={quotaUsed} quotaLimit={quotaLimit} />;
  }

  const canSubmit = !pending && (text.trim().length > 0 || file !== null);

  return (
    <form onSubmit={submit} className="space-y-4">
      <AiStatusCard state="READY" quotaUsed={quotaUsed} quotaLimit={quotaLimit} />

      <div className="space-y-2">
        <Label htmlFor="deskripsi">Deskripsi transaksi</Label>
        <textarea
          id="deskripsi"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending || !!file}
          rows={4}
          placeholder="mis. bayar sewa kantor 3 bulan 15 juta via bank BCA"
          className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-terra"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dokumen">… atau unggah faktur (gambar/PDF, maks 5 MB)</Label>
        <Input
          id="dokumen" ref={fileRef} type="file" accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={pending}
          className="border-rule bg-paper"
        />
        {file && (
          <p className="text-xs text-ink-soft">
            Mode dokumen aktif: {file.name} — deskripsi teks dinonaktifkan.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-credit">{error}</p>}

      <Button type="submit" disabled={!canSubmit} className="bg-terra hover:bg-terra/90">
        {pending ? "Menyusun draft..." : "Buat Draft"}
      </Button>
    </form>
  );
}
