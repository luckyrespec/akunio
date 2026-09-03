"use client";

import * as React from "react";
import { Edit2, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editAccountNameAction, deleteAccountAction } from "@/server/actions/account.actions";
import { useRouter } from "next/navigation";

export function EditAccountDialog({
  accountId,
  accountCode,
  currentName,
}: {
  accountId: string;
  accountCode: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(currentName);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Nama akun tidak boleh kosong.");
      return;
    }

    setLoading(true);
    try {
      const res = await editAccountNameAction(accountId, name);
      if (!res.ok) throw new Error(res.error || "Gagal memperbarui nama akun.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Edit Nama Akun"
          className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
        >
          <Edit2 className="size-3" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-display text-base font-bold text-ink">
            Ubah Nama Akun ({accountCode})
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Sesuai standar akuntansi, perubahan akun setelah didaftarkan hanya diperbolehkan pada nama akun untuk menjaga integritas kode dan leveling.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-1 text-xs">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-ink">Nama Akun</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Kas Utama Operasional Toko"
              className="text-xs h-9 rounded-xl font-medium"
              required
            />
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8 text-xs rounded-xl px-4"
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs rounded-xl bg-terra text-white hover:bg-terra/90 px-4 shadow-2xs"
              disabled={loading}
            >
              {loading && <Loader2 className="size-3 animate-spin mr-1.5" />}
              <span>Simpan Perubahan</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAccountDialog({
  accountId,
  accountCode,
  accountName,
}: {
  accountId: string;
  accountCode: string;
  accountName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await deleteAccountAction(accountId);
      if (!res.ok) throw new Error(res.error || "Gagal menghapus akun.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Hapus Akun"
          className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="size-3" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-display text-base font-bold text-destructive flex items-center gap-2">
            <AlertCircle className="size-4.5" />
            Hapus Akun {accountCode}
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Apakah Anda yakin ingin menghapus akun &ldquo;<strong>{accountName}</strong>&rdquo;? Akun hanya dapat dihapus jika belum pernah memiliki mutasi atau saldo di buku besar, dan tidak memiliki sub-akun.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-8 text-xs rounded-xl px-4"
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDelete}
            className="h-8 text-xs rounded-xl bg-destructive text-white hover:bg-destructive/90 px-4 shadow-2xs"
            disabled={loading}
          >
            {loading && <Loader2 className="size-3 animate-spin mr-1.5" />}
            Hapus Akun
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
