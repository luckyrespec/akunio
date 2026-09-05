"use client";

import * as React from "react";
import { Plus, Edit2, Trash2, Loader2, AlertCircle } from "lucide-react";
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
import {
  createPeriodAction,
  updatePeriodAction,
  deletePeriodAction,
} from "@/server/actions/periods.actions";
import { useRouter } from "next/navigation";

export interface PeriodItem {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
}

interface PeriodDialogProps {
  mode: "create" | "edit";
  period?: PeriodItem;
  trigger?: React.ReactNode;
}

export function PeriodDialog({ mode, period, trigger }: PeriodDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(period?.name ?? "");
  const [startsOn, setStartsOn] = React.useState(period?.startsOn ?? "");
  const [endsOn, setEndsOn] = React.useState(period?.endsOn ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (period) {
      setName(period.name);
      setStartsOn(period.startsOn);
      setEndsOn(period.endsOn);
    }
  }, [period]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Nama periode harus diisi (misal: 2026-01, 2026-13).");
      return;
    }
    if (!startsOn || !endsOn) {
      setError("Tanggal mulai dan akhir periode harus diisi.");
      return;
    }
    if (startsOn > endsOn) {
      setError("Tanggal mulai tidak boleh melebihi tanggal akhir.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "create") {
        const res = await createPeriodAction({
          name: name.trim(),
          startsOn,
          endsOn,
        });
        if (!res.ok) throw new Error(res.error || "Gagal membuat periode.");
      } else if (period) {
        const res = await updatePeriodAction(period.id, {
          name: name.trim(),
          startsOn,
          endsOn,
        });
        if (!res.ok) throw new Error(res.error || "Gagal memperbarui periode.");
      }

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
        {trigger ? (
          trigger
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-xl bg-terra text-white text-xs px-3.5 shadow-2xs hover:bg-terra/90 transition-[transform,background-color] active:scale-[0.98]"
          >
            <Plus className="size-3.5" />
            <span>Tambah Periode</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-display text-base font-bold text-ink">
            {mode === "create" ? "Tambah Periode Fiskal Baru" : `Edit Periode ${period?.name}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Mendukung periode bulanan (1-12) serta periode penyesuaian/audit (misal: 13 perbaikan, 14 audit).
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
            <Label className="text-xs font-semibold text-ink">Nama Periode</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: 2026-01, 2026-13 (Adjustment)"
              maxLength={7}
              className="font-mono text-xs h-9 rounded-xl font-bold"
              required
            />
            <p className="text-[11px] text-ink-soft">
              Format standar 7 karakter: YYYY-MM (misal: 2026-01 s/d 2026-12, atau 2026-13 untuk penyesuaian akhir tahun).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-ink">Tanggal Mulai</Label>
              <Input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="text-xs h-9 rounded-xl"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-ink">Tanggal Selesai</Label>
              <Input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="text-xs h-9 rounded-xl"
                required
              />
            </div>
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
              <span>{mode === "create" ? "Simpan Periode" : "Perbarui"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePeriodButton({ periodId, periodName }: { periodId: string; periodName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await deletePeriodAction(periodId);
      if (!res.ok) throw new Error(res.error || "Gagal menghapus periode.");
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
          title="Hapus Periode"
          className="flex size-7 items-center justify-center rounded-lg text-ink-soft hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="size-3.5" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-display text-base font-bold text-destructive flex items-center gap-2">
            <AlertCircle className="size-4.5" />
            Hapus Periode {periodName}
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Apakah Anda yakin ingin menghapus periode ini? Periode hanya dapat dihapus jika belum pernah memiliki transaksi jurnal.
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
            Hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
