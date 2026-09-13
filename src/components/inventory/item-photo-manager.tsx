"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CloudUpload, Image as ImageIcon, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { compressImageToLimit } from "@/lib/compress-image";

export interface ItemPhotoManagerHandle {
  /** Terapkan perubahan foto (unggah/hapus). No-op bila tak ada perubahan. */
  commit: () => Promise<{ ok: boolean; error?: string }>;
  /** Buang perubahan yang belum disimpan. */
  discard: () => void;
}

interface Staged {
  blob: Blob;
  mime: string;
  name: string;
  url: string;
}

type Phase = "idle" | "uploading" | "deleting";

/** Foto item dengan UX edit: hover → pencil/trash, modal drag & drop + preview,
 *  pratinjau tertunda, dan progress unggah nyata via XHR saat commit. */
export const ItemPhotoManager = forwardRef<
  ItemPhotoManagerHandle,
  {
    itemId: string;
    imageStorageKey: string | null;
    editing: boolean;
    label?: string;
  }
>(function ItemPhotoManager({ itemId, imageStorageKey, editing, label = "barang" }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [removeStaged, setRemoveStaged] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Modal ganti foto
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Staged | null>(null);
  const [dragging, setDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const stagedRef = useRef<Staged | null>(null);
  stagedRef.current = staged;
  const draftRef = useRef<Staged | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    setImgFailed(false);
  }, [imageStorageKey, staged?.url]);

  const discard = useCallback(() => {
    setStaged((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRemoveStaged(false);
    setError(null);
    setPhase("idle");
    setProgress(0);
  }, []);

  // Keluar dari mode edit → buang perubahan yang belum disimpan.
  useEffect(() => {
    if (!editing) discard();
  }, [editing, discard]);

  // Bersihkan object URL saat unmount.
  useEffect(
    () => () => {
      if (stagedRef.current) URL.revokeObjectURL(stagedRef.current.url);
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
    },
    [],
  );

  const closeModal = useCallback(() => {
    setDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setModalError(null);
    setDragging(false);
    setCompressing(false);
    setModalOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const processFile = useCallback(async (file: File) => {
    setModalError(null);
    setCompressing(true);
    try {
      const { blob, mime } = await compressImageToLimit(file);
      const url = URL.createObjectURL(blob);
      setDraft((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, mime, name: file.name, url };
      });
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Gagal memproses foto.");
    } finally {
      setCompressing(false);
    }
  }, []);

  const onModalInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void processFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const applyDraft = () => {
    if (!draft) return;
    const next = draft;
    setStaged((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return next;
    });
    setDraft(null); // kepemilikan URL pindah ke staged
    setRemoveStaged(false);
    setModalOpen(false);
    setModalError(null);
  };

  const commit = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setError(null);
    const current = stagedRef.current;
    try {
      if (current) {
        setPhase("uploading");
        setProgress(0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/inventory/${itemId}/photo`);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setProgress(Math.max(1, Math.min(100, Math.round((ev.loaded / ev.total) * 100))));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              let msg = "Gagal mengunggah foto.";
              try {
                msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
              } catch {
                /* respons bukan JSON */
              }
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => reject(new Error("Koneksi gagal saat mengunggah foto."));
          const fd = new FormData();
          fd.set(
            "file",
            new File([current.blob], current.name.replace(/\.[^.]+$/, ".jpg"), { type: current.mime }),
          );
          xhr.send(fd);
        });
        setProgress(100);
      } else if (removeStaged) {
        setPhase("deleting");
        const res = await fetch(`/api/inventory/${itemId}/photo`, { method: "DELETE" });
        if (!res.ok) {
          let msg = "Gagal menghapus foto.";
          try {
            msg = ((await res.json()) as { error?: string }).error ?? msg;
          } catch {
            /* respons bukan JSON */
          }
          throw new Error(msg);
        }
      }
      setStaged((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setRemoveStaged(false);
      setPhase("idle");
      setProgress(0);
      return { ok: true };
    } catch (e) {
      setPhase("idle");
      setProgress(0);
      const msg = e instanceof Error ? e.message : "Gagal menyimpan foto.";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, [itemId, removeStaged]);

  useImperativeHandle(ref, () => ({ commit, discard }), [commit, discard]);

  const busy = phase !== "idle";
  const effectiveUrl = staged
    ? staged.url
    : !removeStaged && imageStorageKey
      ? `/api/inventory/${itemId}/photo`
      : null;
  const showImg = Boolean(effectiveUrl) && !imgFailed;
  const pending = Boolean(staged || removeStaged);
  const canDelete = Boolean(effectiveUrl) && !busy;
  const inputId = `foto-input-${itemId}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="group/photo relative w-full max-w-60">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-rule bg-canvas/40">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={effectiveUrl!}
              alt={`Foto ${label}`}
              className="size-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 border border-dashed border-rule text-ink-soft/60">
              <ImageIcon className="size-6" />
              <span className="text-[11px]">Belum ada foto</span>
            </div>
          )}

          {removeStaged && !staged && !busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10">
              <span className="rounded-full bg-paper/95 px-2.5 py-1 text-[10px] font-semibold text-rose-700 shadow-xs">
                Akan dihapus saat Simpan
              </span>
            </div>
          )}

          {/* Overlay proses (unggah/hapus) */}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-paper">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-[11px] font-medium">
                {phase === "deleting" ? "Menghapus…" : `Mengunggah ${progress}%`}
              </span>
              {phase === "uploading" && (
                <span className="block h-1.5 w-32 overflow-hidden rounded-full bg-white/25">
                  <span
                    className="block h-full rounded-full bg-terra transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              )}
            </div>
          )}

          {/* Aksi hover (mode edit) */}
          {editing && !busy && (
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-ink/45 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/photo:opacity-100 lg:focus-within:opacity-100">
              <button
                type="button"
                aria-label="Ganti foto"
                title="Ganti foto"
                onClick={() => setModalOpen(true)}
                className="flex size-9 items-center justify-center rounded-full bg-paper text-ink shadow-md transition-[transform,color] hover:scale-105 hover:text-terra focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra/60"
              >
                <Pencil className="size-4" />
              </button>
              {canDelete && (
                <button
                  type="button"
                  aria-label="Hapus foto"
                  title="Hapus foto"
                  onClick={() => setRemoveStaged(true)}
                  className="flex size-9 items-center justify-center rounded-full bg-paper text-ink shadow-md transition-[transform,color] hover:scale-105 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra/60"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          )}

          {/* Badge perubahan tertunda + undo */}
          {pending && !busy && (
            <>
              <span className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-terra/50" />
              <span className="absolute left-2 top-2 rounded-full bg-terra px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                Belum disimpan
              </span>
              <button
                type="button"
                aria-label="Batalkan perubahan foto"
                title="Batalkan perubahan foto"
                onClick={discard}
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-paper/95 text-ink shadow-md transition-colors hover:text-terra"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* Modal ganti foto: drag & drop + pratinjau */}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onModalInput}
      />
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (open) setModalOpen(true);
          else closeModal();
        }}
      >
        <DialogContent className="border-rule bg-paper sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Ganti Foto</DialogTitle>
            <DialogDescription>
              Tarik &amp; lepas foto baru, lalu periksa pratinjaunya sebelum dipakai.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.url}
                alt="Pratinjau foto baru"
                className="mx-auto max-h-64 w-auto max-w-full rounded-xl border border-rule object-contain"
              />
              <div className="flex items-center justify-between gap-3 text-[11px] text-ink-soft">
                <span className="truncate">{draft.name}</span>
                <span className="shrink-0 font-mono">
                  {(draft.blob.size / 1024).toFixed(0)} KB setelah kompres
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                className="h-8 rounded-xl text-xs"
              >
                Ganti file lain
              </Button>
            </div>
          ) : (
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragging
                  ? "border-terra bg-terra/5"
                  : "border-rule bg-canvas/40 hover:border-terra/50 hover:bg-canvas"
              }`}
            >
              {compressing ? (
                <>
                  <Loader2 className="size-6 animate-spin text-terra" />
                  <span className="text-xs font-medium text-ink">Mengompres…</span>
                </>
              ) : (
                <>
                  <CloudUpload className="size-6 text-terra" />
                  <span className="text-xs font-medium text-ink">
                    Tarik &amp; lepas foto ke sini
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    atau klik untuk memilih dari perangkat
                  </span>
                  <span className="mt-1 text-[10px] text-ink-soft/80">
                    JPG/PNG/WebP — otomatis dikompres maks 500 KB
                  </span>
                </>
              )}
            </label>
          )}

          {modalError && (
            <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400">
              {modalError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeModal}
              className="h-9 rounded-xl text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!draft || compressing}
              onClick={applyDraft}
              className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white hover:bg-terra/90"
            >
              Gunakan Foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
