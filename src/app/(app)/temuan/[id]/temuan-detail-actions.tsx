"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageActionButton, PageActions } from "@/components/page-actions";
import { IconReview, IconSparkles } from "@/components/icons";
import { findingErrorMessage } from "@/app/(app)/jurnal/ai/[id]/proposal-labels";
import {
  dismissFindingAction,
  proposeCorrectionAction,
  resolveFindingAction,
} from "../actions";

interface TemuanDetailActionsProps {
  findingId: string;
  findingType?: string;
  status: string;
  pendingDraftId?: string;
  onTriggerUpload?: () => void;
}

/** Tombol aksi temuan sejajar header — unik sesuai jenis permasalahan. */
export function TemuanDetailActions({
  findingId,
  findingType,
  status,
  pendingDraftId,
  onTriggerUpload,
}: TemuanDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; draftId?: string; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setError(r.error ? findingErrorMessage(r.error) : "Aksi gagal. Coba lagi.");
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

  // Konfigurasi tombol utama sesuai jenis permasalahan
  let primaryLabel = pendingDraftId ? "Tinjau Draf Koreksi" : "Buat Draf Koreksi Jurnal";
  let primaryPendingLabel = pendingDraftId ? "Membuka Draf..." : "Menyiapkan Draf...";
  let primaryAction = () => {
    if (pendingDraftId) {
      window.location.href = `/jurnal/ai/${pendingDraftId}`;
      return;
    }
    run(() => proposeCorrectionAction(findingId));
  };

  if (findingType === "missingReceipts") {
    primaryLabel = "Unggah Dokumen Lampiran";
    primaryAction = () => {
      if (onTriggerUpload) {
        onTriggerUpload();
      } else {
        const el = document.getElementById("upload-lampiran-section");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }
    };
  } else if (findingType === "duplicates") {
    primaryLabel = pendingDraftId ? "Tinjau Draf Pembalik" : "Buat Draf Jurnal Pembalik";
    primaryPendingLabel = pendingDraftId ? "Membuka Pembalik..." : "Menyiapkan Pembalik...";
  } else if (findingType === "abnormalBalances") {
    primaryLabel = pendingDraftId ? "Tinjau Draf Penyesuaian" : "Buat Jurnal Penyesuaian";
    primaryPendingLabel = pendingDraftId ? "Membuka Penyesuaian..." : "Menyiapkan Reklasifikasi...";
  } else if (findingType === "oddDates") {
    primaryLabel = pendingDraftId ? "Tinjau Draf Pisah Batas" : "Buat Draf Pisah Batas";
    primaryPendingLabel = pendingDraftId ? "Membuka Pisah Batas..." : "Menyiapkan Pisah Batas...";
  } else if (findingType === "ratioAnomalies") {
    primaryLabel = "Konfirmasi & Selesaikan";
    primaryPendingLabel = "Menyelesaikan...";
    primaryAction = () => run(() => resolveFindingAction(findingId));
  }

  return (
    <PageActions>
      <PageActionButton variant="ghost" disabled={pending} onClick={() => run(() => dismissFindingAction(findingId))}>
        Abaikan
      </PageActionButton>
      {findingType !== "ratioAnomalies" && (
        <PageActionButton
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => resolveFindingAction(findingId))}
        >
          Tandai Selesai
        </PageActionButton>
      )}
      <PageActionButton
        variant="primary"
        loading={pending}
        icon={pendingDraftId ? <IconReview className="size-3.5" /> : <IconSparkles className="size-3.5" />}
        onClick={primaryAction}
      >
        {pending ? primaryPendingLabel : primaryLabel}
      </PageActionButton>
      {error && (
        <p role="alert" className="w-full text-xs text-terra">
          {error}
        </p>
      )}
    </PageActions>
  );
}
