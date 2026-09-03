"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface AsistenDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function AsistenDeleteModal({
  isOpen,
  onClose,
  onConfirm,
}: AsistenDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-5 shadow-xl">
        <h4 className="font-display text-sm font-semibold text-ink">Hapus Percakapan Ini?</h4>
        <p className="mt-1 text-xs text-ink-soft leading-relaxed">
          Semua pesan dan riwayat interaksi di dalam percakapan ini akan dihapus secara permanen.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-rule"
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            onClick={onConfirm}
          >
            Hapus
          </Button>
        </div>
      </div>
    </div>
  );
}
