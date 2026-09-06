"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateItemImageAction, deleteItemImageAction } from "@/server/actions/inventory.actions";
import { compressImageToLimit } from "@/lib/compress-image";

export function PhotoFormClient({ itemId, hasPhoto }: { itemId: string; hasPhoto: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleSave = () => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const { blob, mime } = await compressImageToLimit(file);
        const fd = new FormData();
        fd.set("file", new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: mime }));
        const res = await updateItemImageAction(itemId, fd);
        if (!res.ok) setError(res.error || "Gagal menyimpan foto");
        else setFile(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memproses foto");
      }
    });
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteItemImageAction(itemId);
      if (!res.ok) setError(res.error || "Gagal menghapus foto");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="h-9 max-w-xs text-xs"
          aria-label="Foto barang"
        />
        <Button size="sm" disabled={!file || isPending} onClick={handleSave} className="h-9 text-xs">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Simpan Foto"}
        </Button>
        {hasPhoto && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={handleDelete} className="h-9 text-xs">
            Hapus
          </Button>
        )}
      </div>
      <p className="text-[11px] text-ink-soft">JPG/PNG/WebP, maks 500 KB — otomatis dikompres di browser.</p>
    </div>
  );
}
