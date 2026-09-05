"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageActionButton, PageActions } from "@/components/page-actions";
import {
  dismissFindingAction,
  proposeCorrectionAction,
  resolveFindingAction,
} from "../actions";

/** Tombol aksi temuan sejajar header — konsisten dengan halaman lain. */
export function TemuanDetailActions({
  findingId,
  status,
}: {
  findingId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; draftId?: string; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setError(r.error || "Aksi gagal. Coba lagi.");
          return;
        }
        if (r.draftId) {
          window.location.href = `/jurnal/ai/${r.draftId}`;
        } else {
          router.push("/temuan");
          router.refresh();
        }
      } catch {
        setError("Terjadi kesalahan jaringan. Coba lagi.");
      }
    });
  }

  if (status !== "open") return null;

  return (
    <PageActions>
      <PageActionButton variant="ghost" disabled={pending} onClick={() => run(() => dismissFindingAction(findingId))}>
        Abaikan
      </PageActionButton>
      <PageActionButton
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => resolveFindingAction(findingId))}
      >
        Tandai Selesai
      </PageActionButton>
      <PageActionButton
        variant="primary"
        loading={pending}
        onClick={() => run(() => proposeCorrectionAction(findingId))}
      >
        {pending ? "Menyiapkan Draf..." : "Buat Draf Koreksi Jurnal"}
      </PageActionButton>
      {error && (
        <p role="alert" className="w-full text-xs text-terra">
          {error}
        </p>
      )}
    </PageActions>
  );
}
