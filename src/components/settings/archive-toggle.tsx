"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveAccountAction } from "@/server/actions/account.actions";
import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";

export function ArchiveToggle({ accountId, archived }: { accountId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      title={archived ? "Pulihkan akun ini" : "Arsipkan akun ini"}
      aria-label={archived ? "Pulihkan akun ini" : "Arsipkan akun ini"}
      className="size-7 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg transition-colors"
      onClick={() =>
        start(async () => {
          await archiveAccountAction(accountId, !archived);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin text-ink-soft" />
      ) : archived ? (
        <ArchiveRestore className="size-3.5 text-terra hover:scale-110 transition-transform" />
      ) : (
        <Archive className="size-3.5 hover:text-destructive hover:scale-110 transition-transform" />
      )}
    </Button>
  );
}
