"use client";

import * as React from "react";
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { disposeAssetAction } from "@/server/actions/assets.actions";
import { Money } from "@/core/money/money";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function DisposalDialog({
  open,
  onOpenChange,
  asset,
  accumulatedDepMinor,
  accounts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: any;
  accumulatedDepMinor: bigint;
  accounts: AccountOption[];
  onSuccess: (disposalData: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [disposalDate, setDisposalDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [disposalType, setDisposalType] = useState<"SALE" | "SCRAP" | "WRITE_OFF">("SALE");
  const [proceedsText, setProceedsText] = useState("");

  const bankAccounts = accounts.filter((a) => a.type === "ASET" && a.code.startsWith("11"));
  const gainLossAccounts = accounts.filter(
    (a) =>
      (a.type === "PENDAPATAN" || a.type === "BEBAN") &&
      (a.code.startsWith("7") || a.code.startsWith("8")),
  );

  const [depositAccountId, setDepositAccountId] = useState(bankAccounts[0]?.id || "");
  const [gainLossAccountId, setGainLossAccountId] = useState(
    gainLossAccounts[0]?.id || accounts[0]?.id || "",
  );
  const [notes, setNotes] = useState("");

  // Live Net Book Value & Gain/Loss preview
  const costMinor = BigInt(asset.acquisitionCostMinor);
  const bookValueMinor = costMinor - accumulatedDepreciationMinor();
  function accumulatedDepreciationMinor(): bigint {
    return accumulatedDepMinor;
  }

  let proceedsMinor = 0n;
  try {
    if (disposalType === "SALE" && proceedsText.trim()) {
      proceedsMinor = Money.parseIdr(proceedsText).minor;
    }
  } catch {}

  const estimatedGainLossMinor = proceedsMinor - bookValueMinor;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await disposeAssetAction({
        assetId: asset.id,
        disposalDate,
        disposalType,
        proceedsText: disposalType === "SALE" ? proceedsText : "0",
        depositAccountId: disposalType === "SALE" ? depositAccountId : undefined,
        gainLossAccountId,
        notes,
      });

      if (!res.ok) {
        setError(res.error || "Gagal melakukan pelepasan aset.");
        return;
      }

      onSuccess({
        disposalDate,
        disposalType,
        proceedsMinor,
        gainLossMinor: (res.data as any)?.gainLossMinor,
      });
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-serif font-bold text-ink flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600" />
            Pelepasan / Penjualan Aset Tetap
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-xs">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-rule/70 bg-canvas/70 p-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-ink-soft">Harga Perolehan Historis:</span>
              <strong className="font-mono">{Money.formatIdr(costMinor)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Akumulasi Penyusutan Terposting:</span>
              <span className="font-mono">{Money.formatIdr(bookValueMinor <= 0n ? costMinor : accumulatedDepMinor)}</span>
            </div>
            <div className="flex justify-between border-t border-rule/50 pt-1.5 font-medium">
              <span className="text-ink">Nilai Buku Bersih (NBV) Saat Ini:</span>
              <strong className="font-mono text-terra">{Money.formatIdr(bookValueMinor)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tanggal Pelepasan</Label>
              <Input
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tipe Pelepasan</Label>
              <select
                value={disposalType}
                onChange={(e) => setDisposalType(e.target.value as any)}
                className="w-full rounded-md border border-rule bg-canvas px-2.5 py-2 text-xs text-ink"
              >
                <option value="SALE">Penjualan Aset</option>
                <option value="SCRAP">Afkir / Dibuang (Scrap)</option>
                <option value="WRITE_OFF">Penghapusan Kerugian (Write-Off)</option>
              </select>
            </div>
          </div>

          {disposalType === "SALE" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Harga Jual Diterima (Rp)</Label>
                <Input
                  value={proceedsText}
                  onChange={(e) => setProceedsText(e.target.value)}
                  placeholder="Contoh: 10.000.000"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Akun Kas/Bank Penerima</Label>
                <select
                  value={depositAccountId}
                  onChange={(e) => setDepositAccountId(e.target.value)}
                  className="w-full rounded-md border border-rule bg-canvas px-2.5 py-2 text-xs text-ink"
                  required
                >
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Akun Laba/Rugi Pelepasan Aset (7xxx)</Label>
            <select
              value={gainLossAccountId}
              onChange={(e) => setGainLossAccountId(e.target.value)}
              className="w-full rounded-md border border-rule bg-canvas px-2.5 py-2 text-xs text-ink"
              required
            >
              {gainLossAccounts.length > 0 ? (
                gainLossAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))
              ) : (
                accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Estimasi Laba / Rugi */}
          <div className="rounded-lg border border-rule bg-canvas p-2.5 flex items-center justify-between">
            <span className="text-ink-soft">Estimasi Laba / Rugi Pelepasan:</span>
            <span
              className={`font-mono font-bold ${
                estimatedGainLossMinor >= 0n ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {estimatedGainLossMinor >= 0n
                ? `Laba ${Money.formatIdr(estimatedGainLossMinor)}`
                : `Rugi ${Money.formatIdr(-estimatedGainLossMinor)}`}
            </span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Keterangan / Alasan Pelepasan</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Alasan penjualan, kondisi fisik aset, pihak pembeli, dsb."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={loading}
            >
              {loading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Proses Pelepasan Aset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
