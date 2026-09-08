"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Pencil, Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EditAccountDialog, DeleteAccountDialog } from "./account-actions-dialog";
import { archiveAccountAction } from "@/server/actions/account.actions";

interface AccountRow {
  id: string;
  code: string;
  name: string;
  archivedAt: Date | string | null;
}

/** Satu tombol kebab pengganti tiga ikon aksi per baris akun. */
export function AccountRowMenu({ account }: { account: AccountRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isArchived = Boolean(account.archivedAt);

  function toggleArchive() {
    start(async () => {
      await archiveAccountAction(account.id, !isArchived);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Aksi akun ${account.code}`}
            aria-label={`Aksi akun ${account.code} ${account.name}`}
            className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Ellipsis className="size-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-3.5" />
            <span>Edit nama akun</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={toggleArchive}>
            {isArchived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
            <span>{isArchived ? "Pulihkan akun" : "Arsipkan akun"}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" />
            <span>Hapus akun</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditAccountDialog
        accountId={account.id}
        accountCode={account.code}
        currentName={account.name}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteAccountDialog
        accountId={account.id}
        accountCode={account.code}
        accountName={account.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
