"use client";

import * as React from "react";
import { useState } from "react";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { postMonthlyDepreciationAction } from "@/server/actions/assets.actions";

interface PeriodOption {
  name: string;
  status: string;
}

export function RunDepreciationDialog({
  open,
  onOpenChange,
  openPeriods,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openPeriods: PeriodOption[];
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(
    openPeriods[0]?.name || new Date().toISOString().slice(0, 7),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await postMonthlyDepreciationAction(selectedPeriod);
      if (!res.ok) {
        setError(res.error || "Gagal memproses penyusutan.");
        return;
      }

      const data = res.data as any;
      if (data?.postedCount === 0) {
        setSuccessMsg(
          `Tidak ada aset aktif yang memiliki jadwal penyusutan di periode ${selectedPeriod}, atau beban periode ini sudah diposting sebelumnya.`,
        );
      } else {
        setSuccessMsg(
          `Berhasil memposting beban penyusutan untuk ${data?.postedCount} aset ke Buku Besar resmi.`,
        );
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <Play className="size-4 text-terra" />
            Posting Penyusutan Bulanan
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <p className="text-ink-soft leading-relaxed">
            Sistem akan mengumpulkan seluruh aset aktif yang memiliki jadwal penyusutan belum terposting pada periode yang dipilih, lalu memposting 1 jurnal resmi ke Buku Besar.
          </p>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {!successMsg && (
            <div className="space-y-1.5">
              <Label className="text-xs">Pilih Periode Akuntansi</Label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full rounded-md border border-rule bg-canvas px-3 py-2 text-xs text-ink"
              >
                {openPeriods.map((p) => (
                  <option key={p.name} value={p.name}>
                    Periode {p.name} ({p.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          {successMsg ? (
            <Button
              onClick={() => {
                setSuccessMsg(null);
                onOpenChange(false);
              }}
              className="bg-terra text-white hover:bg-terra/90"
            >
              Tutup
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Batal
              </Button>
              <Button
                onClick={handleRun}
                disabled={loading}
                className="bg-terra text-white hover:bg-terra/90"
              >
                {loading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Posting ke Buku Besar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
