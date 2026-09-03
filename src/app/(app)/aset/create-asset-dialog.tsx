"use client";

import * as React from "react";
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
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
import { createFixedAssetAction } from "@/server/actions/assets.actions";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function CreateAssetDialog({
  open,
  onOpenChange,
  accounts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOption[];
  onSuccess: (asset: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<
    "TANAH" | "BANGUNAN" | "KENDARAAN" | "MESIN_PERALATAN" | "INVENTARIS_KANTOR"
  >("INVENTARIS_KANTOR");
  const [acquisitionDate, setAcquisitionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [inServiceDate, setInServiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [acquisitionCostText, setAcquisitionCostText] = useState("");
  const [salvageValueText, setSalvageValueText] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(48);
  const [depreciationMethod, setDepreciationMethod] = useState<
    "STRAIGHT_LINE" | "DECLINING_BALANCE"
  >("STRAIGHT_LINE");
  const [decliningRatePercent, setDecliningRatePercent] = useState<number | undefined>(undefined);

  // Accounts
  const assetAccounts = accounts.filter((a) => a.type === "ASET" && a.code.startsWith("15"));
  const depAccounts = accounts.filter((a) => a.type === "ASET" && a.code.startsWith("16"));
  const expAccounts = accounts.filter((a) => a.type === "BEBAN" && a.code.startsWith("6"));

  const [assetAccountId, setAssetAccountId] = useState(assetAccounts[0]?.id || accounts[0]?.id || "");
  const [accumulatedDepAccountId, setAccumulatedDepAccountId] = useState(depAccounts[0]?.id || accounts[0]?.id || "");
  const [depreciationExpenseAccountId, setDepreciationExpenseAccountId] = useState(expAccounts[0]?.id || accounts[0]?.id || "");
  const [notes, setNotes] = useState("");

  // Smart Recommendation via SAK EMKM rules
  const handleSmartRecommendation = () => {
    const lower = name.toLowerCase();
    if (lower.includes("mobil") || lower.includes("motor") || lower.includes("truk") || lower.includes("kendaraan")) {
      setCategory("KENDARAAN");
      setUsefulLifeMonths(96); // 8 tahun (Kelompok 2)
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("komputer") || lower.includes("laptop") || lower.includes("printer") || lower.includes("hp")) {
      setCategory("INVENTARIS_KANTOR");
      setUsefulLifeMonths(48); // 4 tahun (Kelompok 1)
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("gedung") || lower.includes("kantor") || lower.includes("ruko")) {
      setCategory("BANGUNAN");
      setUsefulLifeMonths(240); // 20 tahun permanen
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("mesin") || lower.includes("genset") || lower.includes("alat")) {
      setCategory("MESIN_PERALATAN");
      setUsefulLifeMonths(96); // 8 tahun
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("tanah")) {
      setCategory("TANAH");
      setUsefulLifeMonths(1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await createFixedAssetAction({
        name,
        category,
        acquisitionDate,
        inServiceDate,
        acquisitionCostText,
        salvageValueText,
        usefulLifeMonths: Number(usefulLifeMonths),
        depreciationMethod,
        depreciationRatePercent: decliningRatePercent ? Number(decliningRatePercent) : undefined,
        assetAccountId,
        accumulatedDepAccountId,
        depreciationExpenseAccountId,
        notes,
      });

      if (!res.ok) {
        setError(res.error || "Gagal menyimpan aset.");
        return;
      }

      onSuccess(res.data);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold text-ink">
            Pendaftaran Aset Tetap Baru
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2 text-xs">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Nama Aset</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSmartRecommendation}
                  className="h-6 text-[11px] text-terra hover:bg-terra/10 px-2 flex items-center gap-1"
                >
                  <Sparkles className="size-3" />
                  Rekomendasi Cerdas SAK EMKM
                </Button>
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Laptop MacBook Pro M3 Kantor"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Kategori Aset</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-xs text-ink"
              >
                <option value="INVENTARIS_KANTOR">Inventaris / Peralatan Kantor</option>
                <option value="KENDARAAN">Kendaraan</option>
                <option value="MESIN_PERALATAN">Mesin & Peralatan</option>
                <option value="BANGUNAN">Bangunan</option>
                <option value="TANAH">Tanah (Tidak Disusutkan)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Metode Penyusutan</Label>
              <select
                value={depreciationMethod}
                onChange={(e) => setDepreciationMethod(e.target.value as any)}
                className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-xs text-ink"
              >
                <option value="STRAIGHT_LINE">Garis Lurus (Straight-Line)</option>
                <option value="DECLINING_BALANCE">Saldo Menurun (Declining Balance)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal Pembelian</Label>
              <Input
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal Mulai Digunakan</Label>
              <Input
                type="date"
                value={inServiceDate}
                onChange={(e) => setInServiceDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Harga Perolehan (Rp)</Label>
              <Input
                value={acquisitionCostText}
                onChange={(e) => setAcquisitionCostText(e.target.value)}
                placeholder="Contoh: 15.000.000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nilai Residu / Sisa (Rp)</Label>
              <Input
                value={salvageValueText}
                onChange={(e) => setSalvageValueText(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Masa Manfaat (Bulan)</Label>
              <Input
                type="number"
                min={1}
                value={usefulLifeMonths}
                onChange={(e) => setUsefulLifeMonths(parseInt(e.target.value, 10))}
                required
              />
              <span className="text-[10px] text-ink-soft">
                {Math.floor(usefulLifeMonths / 12)} tahun {usefulLifeMonths % 12} bulan
              </span>
            </div>

            {depreciationMethod === "DECLINING_BALANCE" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Tarif Saldo Menurun (% / Tahun)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={decliningRatePercent || ""}
                  onChange={(e) => setDecliningRatePercent(parseFloat(e.target.value))}
                  placeholder="Contoh: 25.00"
                />
              </div>
            )}
          </div>

          <div className="border-t border-rule/70 pt-3 space-y-3">
            <h4 className="font-semibold text-xs text-ink">Pemetaan Akun Buku Besar (COA)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Akun Aset</Label>
                <select
                  value={assetAccountId}
                  onChange={(e) => setAssetAccountId(e.target.value)}
                  className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Akun Akumulasi</Label>
                <select
                  value={accumulatedDepAccountId}
                  onChange={(e) => setAccumulatedDepAccountId(e.target.value)}
                  className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Akun Beban Penyusutan</Label>
                <select
                  value={depreciationExpenseAccountId}
                  onChange={(e) => setDepreciationExpenseAccountId(e.target.value)}
                  className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Catatan Tambahan (Opsional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="No. Seri, Lokasi Barang, Bukti Faktur Pembelian, dsb."
              rows={2}
            />
          </div>

          <DialogFooter className="pt-2">
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
              disabled={loading}
              className="bg-terra text-white hover:bg-terra/90"
            >
              {loading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Daftarkan Aset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
