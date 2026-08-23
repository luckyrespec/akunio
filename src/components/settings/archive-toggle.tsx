"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveAccountAction } from "@/server/actions/account.actions";
import { Button } from "@/components/ui/button";

export function ArchiveToggle({ accountId, archived }: { accountId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending}
            onClick={() => start(async () => {
              await archiveAccountAction(accountId, !archived);
              router.refresh();
            })}>
      {archived ? "Pulihkan" : "Arsipkan"}
    </Button>
  );
}
