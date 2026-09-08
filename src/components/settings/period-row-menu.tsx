"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Pencil, Lock, LockOpen, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PeriodDialog, DeletePeriodButton, type PeriodItem } from "./period-dialog";
import { closePeriodAction, reopenPeriodAction } from "@/server/actions/periods.actions";

/** Satu tombol kebab pengganti tiga ikon aksi per baris periode. */
export function PeriodRowMenu({ period }: { period: PeriodItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) console.error(res.error);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Aksi periode ${period.name}`}
            aria-label={`Aksi periode ${period.name}`}
            className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Ellipsis className="size-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-3.5" />
            <span>Edit periode</span>
          </DropdownMenuItem>
          {period.status === "OPEN" && (
            <DropdownMenuItem disabled={pending} onSelect={() => run(() => closePeriodAction(period.id))}>
              <Lock className="size-3.5" />
              <span>Tutup periode</span>
            </DropdownMenuItem>
          )}
          {period.status === "CLOSED" && (
            <DropdownMenuItem disabled={pending} onSelect={() => run(() => reopenPeriodAction(period.id))}>
              <LockOpen className="size-3.5" />
              <span>Buka kembali</span>
            </DropdownMenuItem>
          )}
          {period.status === "LOCKED" && (
            <DropdownMenuItem disabled>
              <Lock className="size-3.5" />
              <span>Terkunci permanen</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" />
            <span>Hapus periode</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PeriodDialog mode="edit" period={period} open={editOpen} onOpenChange={setEditOpen} />
      <DeletePeriodButton
        periodId={period.id}
        periodName={period.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
