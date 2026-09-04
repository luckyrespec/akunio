"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAdjustmentDraftAction } from "@/server/actions/inventory.actions";

export function GenerateDraftButton({ opnameId }: { opnameId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(async () => {
      const res = await generateAdjustmentDraftAction(opnameId);
      if (res.ok) {
        router.refresh();
      } else {
        alert(res.error || "Gagal membuat draf jurnal penyesuaian");
      }
    });
  };

  return (
    <Button
      onClick={handleGenerate}
      disabled={isPending}
      className="bg-[var(--color-tinta)] text-[var(--color-paper)] hover:opacity-90"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
      ) : (
        <FilePlus2 className="w-4 h-4 mr-1.5" />
      )}
      Buat Draf Jurnal Penyesuaian
    </Button>
  );
}
