"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, FilePlus2, FileX2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageActionButton, PageActions } from "@/components/page-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  cancelStockOpnameAction,
  deleteCancelledOpnameAction,
  generateAdjustmentDraftAction,
  postOpnameAdjustmentAction,
} from "@/server/actions/inventory.actions";

interface DialogState {
  tone: "default" | "danger";
  title: string;
  description: React.ReactNode;
}

/** Terjemahkan error server jadi pesan + langkah perbaikan yang ramah. */
function friendlyDraftError(raw: string): DialogState {
  if (
    raw.startsWith("AKUN_BEBAN_SELISIH_BELUM_DIPETAKAN") ||
    raw.startsWith("AKUN_PENDAPATAN_SELISIH_BELUM_DIPETAKAN")
  ) {
    const isGain = raw.startsWith("AKUN_PENDAPATAN_SELISIH");
    return {
      tone: "danger",
      title: "Akun selisih belum diatur",
      description: (
        <>
          Pilih akun <strong>{isGain ? "Pendapatan Selisih Surplus" : "Beban Selisih Defisit"}</strong>{" "}
          di{" "}
          <Link
            href="/pengaturan?tab=persediaan"
            className="font-medium text-terra underline underline-offset-2"
          >
            Pengaturan, bagian Kebijakan Persediaan
          </Link>
          , lalu buat draf jurnal lagi.
        </>
      ),
    };
  }
  if (raw.startsWith("AKUN_PERSEDIAAN_BELUM_DIPETAKAN")) {
    return {
      tone: "danger",
      title: "Akun persediaan belum terhubung",
      description: (
        <>
          Periksa pemetaannya di{" "}
          <Link
            href="/pengaturan?tab=persediaan"
            className="font-medium text-terra underline underline-offset-2"
          >
            Pengaturan, bagian Kebijakan Persediaan
          </Link>
          .
        </>
      ),
    };
  }
  const [code, ...rest] = raw.split(":");
  const detail = rest.join(":").trim();
  return {
    tone: "danger",
    title: "Gagal membuat draf jurnal penyesuaian",
    description: detail || code,
  };
}

export function GenerateDraftButton({ opnameId }: { opnameId: string }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await generateAdjustmentDraftAction(opnameId);
      if (!res.ok) {
        setDialog(friendlyDraftError(res.error || "Gagal membuat draf jurnal penyesuaian"));
        return;
      }
      if ("noJournal" in res && res.noJournal) {
        setDialog({
          tone: "default",
          title: "Selesai tanpa jurnal (nilai Rp0)",
          description:
            "Harga modal barang masih Rp0, jadi tidak ada yang perlu dijurnal. Stok fisik tetap diperbarui dan tercatat di kartu stok. Untuk jurnal bernilai, isi Harga Modal saat membuat sesi berikutnya.",
        });
      }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageActions>
        <PageActionButton
          variant="primary"
          loading={generating}
          icon={<FilePlus2 />}
          onClick={handleGenerate}
        >
          Buat Draf Jurnal Penyesuaian
        </PageActionButton>
      </PageActions>
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        tone={dialog?.tone ?? "default"}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
      />
    </>
  );
}

export function PostOpnameButton({ opnameId }: { opnameId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handlePost = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await postOpnameAdjustmentAction(opnameId);
    if (!res.ok) {
      return { ok: false, error: res.error || "Gagal memposting penyesuaian opname" };
    }
    router.refresh();
    return { ok: true };
  };

  return (
    <>
      <PageActions>
        <PageActionButton
          variant="primary"
          icon={<BadgeCheck />}
          onClick={() => setOpen(true)}
        >
          Posting &amp; Selesaikan
        </PageActionButton>
      </PageActions>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Posting jurnal ini?"
        description="Jurnal dikunci permanen dan stok buku mengikuti hasil hitung fisik. Koreksi setelahnya lewat jurnal pembalik atau sesi opname baru."
        confirmLabel="Ya, Posting"
        onConfirm={handlePost}
      />
    </>
  );
}

/** Batalkan sesi opname pra-posting (DRAFT / draf jurnal terbit). */
export function CancelOpnameButton({
  opnameId,
  hasJournal,
}: {
  opnameId: string;
  hasJournal: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleCancel = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await cancelStockOpnameAction(opnameId);
    if (!res.ok) {
      return { ok: false, error: res.error || "Gagal membatalkan sesi opname" };
    }
    router.refresh();
    return { ok: true };
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="opname-cancel"
        className="h-10 rounded-[var(--radius-lg)] border-destructive/30 px-4 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <FileX2 className="mr-2 size-4" />
        Batalkan Sesi
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title="Batalkan sesi opname ini?"
        description={
          hasJournal
            ? "Draf jurnal ikut dihapus karena belum menyentuh stok maupun buku besar. Hasil hitung sesi ini ditandai dibatalkan."
            : "Hasil hitung yang tersimpan ditandai dibatalkan dan tidak bisa dikembalikan."
        }
        confirmLabel="Ya, Batalkan Sesi"
        onConfirm={handleCancel}
      />
    </>
  );
}

/** Hapus permanen sesi yang sudah dibatalkan (satu-satunya status yang boleh). */
export function DeleteOpnameButton({ opnameId, number }: { opnameId: string; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleDelete = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await deleteCancelledOpnameAction(opnameId);
    if (!res.ok) {
      return { ok: false, error: res.error || "Gagal menghapus sesi opname" };
    }
    router.push("/persediaan/opname");
    return { ok: true };
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="opname-delete"
        className="h-10 rounded-[var(--radius-lg)] border-destructive/30 px-4 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="mr-2 size-4" />
        Hapus Permanen
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title={`Hapus sesi ${number}?`}
        description="Sesi yang sudah dibatalkan dihapus permanen beserta hasil hitungnya. Tindakan ini tidak bisa dikembalikan."
        confirmLabel="Ya, Hapus"
        onConfirm={handleDelete}
      />
    </>
  );
}
