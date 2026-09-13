"use client";

import { useState } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Dialog konfirmasi / pemberitahuan aksi (pengganti window.confirm & alert).
 *  - Dengan `onConfirm`: mode konfirmasi (Batal + tombol aksi), loading & error
 *    tampil di dalam dialog, menutup otomatis saat aksi berhasil.
 *  - Tanpa `onConfirm`: mode notice satu tombol untuk error/informasi. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = tone === "danger" ? AlertTriangle : Info;
  const isNotice = !onConfirm;
  const acceptLabel = confirmLabel ?? (isNotice ? "Mengerti" : "Lanjutkan");

  const handleConfirm = async () => {
    if (!onConfirm) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onConfirm();
      if (!res.ok) {
        setError(res.error ?? "Terjadi kesalahan.");
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-rule bg-paper sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                tone === "danger"
                  ? "border-destructive/25 bg-destructive/10 text-destructive"
                  : "border-terra/25 bg-terra/10 text-terra",
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="font-display text-base font-semibold text-ink">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-ink-soft">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter className="mt-1 flex-row justify-end gap-2 border-rule/60">
          {!isNotice && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-xl px-4 text-xs"
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={busy}
            onClick={handleConfirm}
            data-testid="confirm-dialog-accept"
            className={cn(
              "h-9 rounded-xl px-5 text-xs font-semibold",
              tone !== "danger" && "bg-terra text-white hover:bg-terra/90",
            )}
          >
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {acceptLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
