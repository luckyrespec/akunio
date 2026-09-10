"use client";

import * as React from "react";
import { Loader2, ThumbsUp } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

interface AsistenDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** true bila server benar-benar menghapus sesi. */
  onConfirm: () => Promise<boolean>;
}

type Status = "confirm" | "deleting" | "success";

export function AsistenDeleteModal({
  isOpen,
  onClose,
  onConfirm,
}: AsistenDeleteModalProps) {
  const [status, setStatus] = React.useState<Status>("confirm");
  const [error, setError] = React.useState<string | null>(null);

  // Reset tiap kali modal dibuka untuk sesi lain.
  React.useEffect(() => {
    if (isOpen) {
      setStatus("confirm");
      setError(null);
    }
  }, [isOpen]);

  // Sukses: rayakan sebentar lalu tutup sendiri.
  React.useEffect(() => {
    if (!isOpen || status !== "success") return;
    const t = setTimeout(onClose, 1400);
    return () => clearTimeout(t);
  }, [isOpen, status, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setStatus("deleting");
    setError(null);
    const ok = await onConfirm().catch(() => false);
    if (ok) {
      setStatus("success");
    } else {
      setStatus("confirm");
      setError("Gagal menghapus percakapan. Coba lagi.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-5 shadow-xl">
        {status === "success" ? (
          <div className="flex flex-col items-center py-4 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="relative flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
            >
              <motion.span
                initial={{ scale: 0.4, opacity: 0.8 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-emerald-500"
              />
              <ThumbsUp className="size-7" />
            </motion.div>
            <h4 className="mt-3 text-sm font-semibold text-ink">Percakapan dihapus</h4>
            <p className="mt-1 text-xs text-ink-soft">Sesi sudah bersih dari daftar Anda.</p>
          </div>
        ) : (
          <>
            <h4 className="text-sm font-semibold text-ink">Hapus Percakapan Ini?</h4>
            <p className="mt-1 text-xs text-ink-soft leading-relaxed">
              Semua pesan dan riwayat interaksi di dalam percakapan ini akan dihapus secara permanen.
            </p>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-rule"
                onClick={onClose}
                disabled={status === "deleting"}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs min-w-20"
                onClick={handleConfirm}
                disabled={status === "deleting"}
              >
                {status === "deleting" ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                    Menghapus...
                  </>
                ) : (
                  "Hapus"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
