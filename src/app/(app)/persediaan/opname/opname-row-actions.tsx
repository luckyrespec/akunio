"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteCancelledOpnameAction } from "@/server/actions/inventory.actions";

/** Aksi baris untuk sesi yang sudah dibatalkan: hapus permanen. */
export function OpnameRowActions({ opnameId, number }: { opnameId: string; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleDelete = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await deleteCancelledOpnameAction(opnameId);
    if (!res.ok) return { ok: false, error: res.error || "Gagal menghapus sesi opname" };
    router.refresh();
    return { ok: true };
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Hapus sesi ${number}`}
        title="Hapus sesi yang sudah dibatalkan"
        onClick={() => setOpen(true)}
        className="h-8 px-2 text-ink-soft transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title={`Hapus sesi ${number}?`}
        description="Sesi yang sudah dibatalkan dihapus permanen beserta hasil hitungnya. Sesi draf dan sesi selesai tidak bisa dihapus."
        confirmLabel="Ya, Hapus"
        onConfirm={handleDelete}
      />
    </>
  );
}
