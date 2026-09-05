"use client";

import { Calendar, FileText, Loader2, Paperclip, Sparkles, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RequiredMark() {
  return (
    <span className="ml-1 font-semibold text-credit" aria-hidden="true">
      *
    </span>
  );
}

export function EntryDateCard({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-1.5">
      <Label htmlFor="tanggal" className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
        <Calendar className="size-3.5 text-ink-soft" />
        <span>
          Tanggal Transaksi
          <RequiredMark />
          <span className="sr-only">(wajib diisi)</span>
        </span>
      </Label>
      <Input
        id="tanggal"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="bg-paper"
      />
    </div>
  );
}

export function AttachmentCard({
  file,
  onSelect,
  onRemove,
}: {
  file: File | null;
  onSelect: (f: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="size-3.5 text-ink-soft" />
          <span className="text-xs font-semibold text-ink">Lampiran / Data Dukung</span>
        </div>
        <span className="text-[11px] text-ink-soft">Maks 5 MB</span>
      </div>

      {file ? (
        <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra">
              <FileText className="size-3.5" />
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-xs font-medium text-ink">{file.name}</p>
              <p className="text-[11px] text-ink-soft">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            className="text-ink-soft hover:bg-destructive/10 hover:text-destructive max-sm:min-h-[44px] max-sm:min-w-[44px]"
            aria-label="Hapus lampiran"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rule bg-canvas/30 px-3 py-3 text-xs text-ink-soft transition-colors hover:bg-canvas hover:text-ink">
          <UploadCloud className="size-4 text-terra" />
          <span className="text-[11px]">Unggah nota, kwitansi, atau PDF</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => {
              onSelect(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}

export function AiHelperCard({
  canGenerate,
  processing,
  statusMessage,
  onGenerate,
}: {
  canGenerate: boolean;
  processing: boolean;
  statusMessage: string;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-terra/25 bg-terra/[0.04] p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2 text-terra">
        <Sparkles className="size-4 shrink-0" />
        <h3 className="text-xs font-semibold">Otomasi Entri dengan AI</h3>
      </div>
      <p className="text-[11px] text-ink-soft leading-relaxed">
        Unggah lampiran atau tulis keterangan singkat di atas, lalu minta AI menyusun jurnal lengkap siap review.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onGenerate}
        disabled={processing || !canGenerate}
        className="w-full border-terra/30 text-terra bg-paper hover:bg-terra/10 text-xs font-semibold gap-1.5 h-8.5 shadow-2xs max-sm:min-h-[44px]"
      >
        {processing ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span>{statusMessage || "Memproses AI..."}</span>
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" />
            <span>Susun Otomatis via AI</span>
          </>
        )}
      </Button>
    </div>
  );
}
