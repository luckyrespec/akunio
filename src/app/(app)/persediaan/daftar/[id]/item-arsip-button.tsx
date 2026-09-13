"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setItemActiveAction } from "@/server/actions/inventory.actions";

export function ItemArsipButton({ itemId, isActive }: { itemId: string; isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await setItemActiveAction(itemId, !isActive);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={toggle}
        className="h-8 rounded-xl text-xs"
      >
        {isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : isActive ? (
          <Archive className="mr-1.5 size-3.5" />
        ) : (
          <ArchiveRestore className="mr-1.5 size-3.5" />
        )}
        {isActive ? "Arsipkan" : "Aktifkan"}
      </Button>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
