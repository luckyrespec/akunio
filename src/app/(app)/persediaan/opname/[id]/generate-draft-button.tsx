"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FilePlus2 } from "lucide-react";
import { PageActionButton, PageActions } from "@/components/page-actions";
import {
  generateAdjustmentDraftAction,
  postOpnameAdjustmentAction,
} from "@/server/actions/inventory.actions";

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
    <PageActions>
      <PageActionButton
        variant="primary"
        loading={isPending}
        icon={<FilePlus2 />}
        onClick={handleGenerate}
      >
        Buat Draf Jurnal Penyesuaian
      </PageActionButton>
    </PageActions>
  );
}

export function PostOpnameButton({ opnameId }: { opnameId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handlePost = () => {
    if (!confirm("Posting draf penyesuaian akan mengunci jurnal dan memperbarui stok buku ke hasil fisik. Lanjutkan?")) return;
    startTransition(async () => {
      const res = await postOpnameAdjustmentAction(opnameId);
      if (res.ok) {
        router.refresh();
      } else {
        alert(res.error || "Gagal memposting penyesuaian opname");
      }
    });
  };

  return (
    <PageActions>
      <PageActionButton
        variant="primary"
        loading={isPending}
        icon={<CheckCircle2 />}
        onClick={handlePost}
      >
        Posting & Selesaikan Opname
      </PageActionButton>
    </PageActions>
  );
}
