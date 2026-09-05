"use client";

import * as React from "react";
import { useState } from "react";
import {
  Boxes,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Save,
  Loader2,
  ShieldCheck,
  Calculator,
  ArrowRightLeft,
  BookOpen,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { updateInventorySettingsAction } from "@/server/actions/inventory.actions";
import { cn } from "@/lib/utils";

export interface InventorySettingsData {
  valuationMethod: "WEIGHTED_AVERAGE" | "FIFO";
  recordingMethod: "PERPETUAL" | "PERIODIC";
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  adjustmentLossAccountId?: string | null;
  adjustmentGainAccountId?: string | null;
  isLocked: boolean;
}

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface InventorySettingsProps {
  settings: InventorySettingsData | null;
  accounts: AccountOption[];
  canEdit: boolean;
}

export function InventorySettingsTab({
  settings,
  accounts,
  canEdit,
}: InventorySettingsProps) {
  const [valuationMethod, setValuationMethod] = useState<"WEIGHTED_AVERAGE" | "FIFO">(
    settings?.valuationMethod ?? "WEIGHTED_AVERAGE"
  );
  const [recordingMethod, setRecordingMethod] = useState<"PERPETUAL" | "PERIODIC">(
    settings?.recordingMethod ?? "PERPETUAL"
  );
  const [inventoryAccountId, setInventoryAccountId] = useState<string>(
    settings?.inventoryAccountId ?? accounts.find((a) => a.code === "1300")?.id ?? ""
  );
  const [cogsAccountId, setCogsAccountId] = useState<string>(
    settings?.cogsAccountId ?? accounts.find((a) => a.code === "5100")?.id ?? ""
  );
  const [adjustmentLossAccountId, setAdjustmentLossAccountId] = useState<string>(
    settings?.adjustmentLossAccountId ?? accounts.find((a) => a.code === "5900" || a.code === "5100")?.id ?? ""
  );
  const [adjustmentGainAccountId, setAdjustmentGainAccountId] = useState<string>(
    settings?.adjustmentGainAccountId ?? accounts.find((a) => a.code === "4200")?.id ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const isLocked = settings?.isLocked || false;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setFeedback(null);

    try {
      const res = await updateInventorySettingsAction({
        valuationMethod,
        recordingMethod,
        inventoryAccountId: inventoryAccountId || null,
        cogsAccountId: cogsAccountId || null,
        adjustmentLossAccountId: adjustmentLossAccountId || null,
        adjustmentGainAccountId: adjustmentGainAccountId || null,
      });

      if (res.ok) {
        setFeedback({
          type: "success",
          message: "Kebijakan akuntansi persediaan berhasil disimpan.",
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Gagal menyimpan perubahan kebijakan persediaan.",
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat menyimpan.";
      setFeedback({
        type: "error",
        message: errorMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  const assetAccounts = accounts.filter((a) => a.type === "ASET");
  const expenseAccounts = accounts.filter((a) => a.type === "BEBAN");
  const revenueAccounts = accounts.filter((a) => a.type === "PENDAPATAN");

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* 1. HEADER BAR - PERSIS KONSISTEN DENGAN COA & PERIODE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
            <Boxes className="size-5 text-terra" />
            <span>Kebijakan Persediaan &amp; Valuasi HPP</span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Standar valuasi harga pokok barang, sistem pencatatan buku besar, serta integrasi otomatisasi bagan akun (COA).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLocked ? (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-2.5 py-1 gap-1.5 font-semibold"
            >
              <Lock className="size-3 text-amber-600 dark:text-amber-400" />
              <span>Terkunci (Tahun Berjalan Aktif)</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs px-2.5 py-1 gap-1.5 font-semibold"
            >
              <Unlock className="size-3 text-emerald-600 dark:text-emerald-400" />
              <span>Dapat Diubah (Tutup Buku Terpenuhi)</span>
            </Badge>
          )}

          {canEdit && (
            <Button
              onClick={handleSave}
              disabled={saving || isLocked}
              size="sm"
              className="h-8 gap-1.5 rounded-xl bg-terra text-white text-xs px-3.5 shadow-2xs hover:bg-terra/90 transition-[transform,background-color] active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 2. SAK EMKM STATUTORY CARD */}
      <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-2xs">
        <div className="flex items-start gap-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-terra/10 border border-terra/25 text-terra mt-0.5">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-ink">
                Kepatuhan Standar Akuntansi Keuangan (SAK EMKM Bab 8)
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 border-terra/30 text-terra bg-terra/5">
                KONSISTENSI FORMAL
              </Badge>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              Metode penilaian persediaan yang dipilih wajib diterapkan secara taat asas dan konsisten antar-periode.
              Perubahan metode valuasi hanya diperbolehkan pada awal tahun buku baru setelah seluruh periode sebelumnya
              resmi berstatus <span className="font-semibold text-ink">Tutup Buku (Closed / Locked)</span> untuk mencegah rekayasa laba kotor &amp; mutasi fiktif.
            </p>
          </div>
        </div>
      </div>

      {/* 3. METODE VALUASI & METODE PENCATATAN (2-COLUMN GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* KARTU 1: METODE VALUASI */}
        <div className="rounded-2xl border border-rule bg-paper p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-rule/60">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-terra/10 text-terra border border-terra/20">
                  <Calculator className="size-3.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-ink">Metode Valuasi HPP</h3>
                  <p className="text-[11px] text-ink-soft">Formula penentuan biaya modal barang keluar</p>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-ink-soft hover:text-terra transition-colors">
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-[11px]">
                  SAK EMKM mengakui metode Rata-Rata Tertimbang dan FIFO untuk mengukur biaya persediaan entitas mikro, kecil, dan menengah.
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Radio Selection List */}
            <div className="mt-4 space-y-3">
              {/* Option A: Weighted Average */}
              <div
                onClick={() => !isLocked && setValuationMethod("WEIGHTED_AVERAGE")}
                className={cn(
                  "p-4 rounded-xl border transition-all text-left relative",
                  !isLocked ? "cursor-pointer" : "cursor-not-allowed opacity-75",
                  valuationMethod === "WEIGHTED_AVERAGE"
                    ? "border-terra bg-terra/5 ring-1 ring-terra shadow-2xs"
                    : "border-rule bg-canvas/40 hover:bg-canvas/70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-ink">Rata-Rata Tertimbang (Moving Average)</span>
                      <Badge className="border border-terra/30 bg-terra/10 text-terra text-[10px] px-1.5 py-0 h-4.5 font-bold">
                        REKOMENDASI EMKM
                      </Badge>
                    </div>
                    <p className="text-[11px] text-ink-soft leading-relaxed">
                      Menghitung ulang harga pokok rata-rata per unit secara dinamis setiap kali ada faktur penerimaan barang baru.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-colors",
                      valuationMethod === "WEIGHTED_AVERAGE"
                        ? "border-terra bg-terra text-white"
                        : "border-rule bg-paper"
                    )}
                  >
                    {valuationMethod === "WEIGHTED_AVERAGE" && <div className="size-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-rule/50 flex items-center gap-1.5 text-[10px] text-ink-soft font-mono">
                  <Info className="size-3 text-ink-soft/70 shrink-0" />
                  <span>Ideal untuk barang ritel umum, bahan baku industri, atau perdagangan non-kedaluwarsa.</span>
                </div>
              </div>

              {/* Option B: FIFO */}
              <div
                onClick={() => !isLocked && setValuationMethod("FIFO")}
                className={cn(
                  "p-4 rounded-xl border transition-all text-left relative",
                  !isLocked ? "cursor-pointer" : "cursor-not-allowed opacity-75",
                  valuationMethod === "FIFO"
                    ? "border-terra bg-terra/5 ring-1 ring-terra shadow-2xs"
                    : "border-rule bg-canvas/40 hover:bg-canvas/70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-ink">First-In, First-Out (FIFO)</span>
                    </div>
                    <p className="text-[11px] text-ink-soft leading-relaxed">
                      Stok barang yang pertama masuk diasumsikan keluar pertama kali sesuai kronologi tumpukan batch pembelian.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-colors",
                      valuationMethod === "FIFO"
                        ? "border-terra bg-terra text-white"
                        : "border-rule bg-paper"
                    )}
                  >
                    {valuationMethod === "FIFO" && <div className="size-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-rule/50 flex items-center gap-1.5 text-[10px] text-ink-soft font-mono">
                  <Info className="size-3 text-ink-soft/70 shrink-0" />
                  <span>Sangat cocok untuk produk dengan shelf-life terbatas (makanan, minuman, farmasi, kosmetik).</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KARTU 2: SISTEM PENCATATAN AKUNTANSI */}
        <div className="rounded-2xl border border-rule bg-paper p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-rule/60">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-terra/10 text-terra border border-terra/20">
                  <ArrowRightLeft className="size-3.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-ink">Sistem Pencatatan Akuntansi</h3>
                  <p className="text-[11px] text-ink-soft">Mekanisme pengakuan mutasi jurnal ke buku besar</p>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-ink-soft hover:text-terra transition-colors">
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-[11px]">
                  Sistem perpetual memperbarui buku besar seketika saat penjualan terjadi, sedangkan periodik memperbarui saat opname fisik.
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Radio Selection List */}
            <div className="mt-4 space-y-3">
              {/* Option A: Perpetual */}
              <div
                onClick={() => !isLocked && setRecordingMethod("PERPETUAL")}
                className={cn(
                  "p-4 rounded-xl border transition-all text-left relative",
                  !isLocked ? "cursor-pointer" : "cursor-not-allowed opacity-75",
                  recordingMethod === "PERPETUAL"
                    ? "border-terra bg-terra/5 ring-1 ring-terra shadow-2xs"
                    : "border-rule bg-canvas/40 hover:bg-canvas/70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-ink">Sistem Perpetual (Berkelanjutan)</span>
                      <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] px-1.5 py-0 h-4.5 font-bold">
                        STANDAR RESMI
                      </Badge>
                    </div>
                    <p className="text-[11px] text-ink-soft leading-relaxed">
                      Setiap penjualan langsung mendebit HPP dan mengkredit akun Persediaan secara instan dan otomatis.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-colors",
                      recordingMethod === "PERPETUAL"
                        ? "border-terra bg-terra text-white"
                        : "border-rule bg-paper"
                    )}
                  >
                    {recordingMethod === "PERPETUAL" && <div className="size-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-rule/50 flex items-center gap-1.5 text-[10px] text-ink-soft font-mono">
                  <Info className="size-3 text-ink-soft/70 shrink-0" />
                  <span>Nilai persediaan di neraca selalu akurat dan sinkron dengan stok fisik kapan saja.</span>
                </div>
              </div>

              {/* Option B: Periodic */}
              <div
                onClick={() => !isLocked && setRecordingMethod("PERIODIC")}
                className={cn(
                  "p-4 rounded-xl border transition-all text-left relative",
                  !isLocked ? "cursor-pointer" : "cursor-not-allowed opacity-75",
                  recordingMethod === "PERIODIC"
                    ? "border-terra bg-terra/5 ring-1 ring-terra shadow-2xs"
                    : "border-rule bg-canvas/40 hover:bg-canvas/70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-ink">Sistem Periodik (Fisik)</span>
                    </div>
                    <p className="text-[11px] text-ink-soft leading-relaxed">
                      Pembelian barang masuk dicatat ke akun Pembelian. HPP dihitung dan dijurnal secara periodik via Stok Opname.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-colors",
                      recordingMethod === "PERIODIC"
                        ? "border-terra bg-terra text-white"
                        : "border-rule bg-paper"
                    )}
                  >
                    {recordingMethod === "PERIODIC" && <div className="size-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-rule/50 flex items-center gap-1.5 text-[10px] text-ink-soft font-mono">
                  <Info className="size-3 text-ink-soft/70 shrink-0" />
                  <span>Didesain untuk usaha konvensional yang tidak melacak barcode per mutasi item harian.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PEMETAAN BAGAN AKUN (COA INTEGRATION) */}
      <div className="rounded-2xl border border-rule bg-paper p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-rule/60">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-terra/10 text-terra border border-terra/20">
              <BookOpen className="size-3.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-ink">Pemetaan Akun Buku Besar (COA Mapping)</h3>
              <p className="text-[11px] text-ink-soft">Tentukan akun neraca &amp; laba rugi untuk eksekusi posting mutasi persediaan</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Akun Persediaan */}
          <div className="space-y-1.5">
            <label htmlFor="inv-acc" className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Akun Persediaan Barang Dagang</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
                ASET LANCAR (D)
              </Badge>
            </label>
            <select
              id="inv-acc"
              value={inventoryAccountId}
              onChange={(e) => setInventoryAccountId(e.target.value)}
              disabled={!canEdit}
              className="w-full h-9.5 rounded-xl border border-rule bg-paper px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-terra/30 focus:border-terra transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">-- Pilih Akun Persediaan --</option>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-soft">Menampung saldo aktiva barang di neraca (default akun: 1300).</p>
          </div>

          {/* Akun HPP */}
          <div className="space-y-1.5">
            <label htmlFor="cogs-acc" className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Akun Beban Pokok Penjualan (HPP)</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 border-rose-500/30 text-rose-700 dark:text-rose-300 bg-rose-500/10">
                BEBAN POKOK (D)
              </Badge>
            </label>
            <select
              id="cogs-acc"
              value={cogsAccountId}
              onChange={(e) => setCogsAccountId(e.target.value)}
              disabled={!canEdit}
              className="w-full h-9.5 rounded-xl border border-rule bg-paper px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-terra/30 focus:border-terra transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">-- Pilih Akun Beban Pokok --</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-soft">Akun pengurang pendapatan kotor di laporan laba rugi (default: 5100).</p>
          </div>

          {/* Akun Kerugian Selisih */}
          <div className="space-y-1.5">
            <label htmlFor="loss-acc" className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Beban Selisih Kurang Stok (Defisit Opname)</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 border-rose-500/30 text-rose-700 dark:text-rose-300 bg-rose-500/10">
                BEBAN LAIN/HPP (D)
              </Badge>
            </label>
            <select
              id="loss-acc"
              value={adjustmentLossAccountId}
              onChange={(e) => setAdjustmentLossAccountId(e.target.value)}
              disabled={!canEdit}
              className="w-full h-9.5 rounded-xl border border-rule bg-paper px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-terra/30 focus:border-terra transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">-- Pilih Akun Selisih Defisit --</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-soft">Mencatat penyusutan/kehilangan fisik saat hasil opname lebih rendah (5900/5100).</p>
          </div>

          {/* Akun Keuntungan Selisih */}
          <div className="space-y-1.5">
            <label htmlFor="gain-acc" className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Pendapatan Selisih Lebih Stok (Surplus Opname)</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 border-sky-500/30 text-sky-700 dark:text-sky-300 bg-sky-500/10">
                PENDAPATAN LAIN (K)
              </Badge>
            </label>
            <select
              id="gain-acc"
              value={adjustmentGainAccountId}
              onChange={(e) => setAdjustmentGainAccountId(e.target.value)}
              disabled={!canEdit}
              className="w-full h-9.5 rounded-xl border border-rule bg-paper px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-terra/30 focus:border-terra transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">-- Pilih Akun Selisih Surplus --</option>
              {revenueAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-soft">Mencatat surplus fisik barang saat opname lebih tinggi daripada catatan (4200).</p>
          </div>
        </div>
      </div>

      {/* 5. FEEDBACK STATE MESSAGE */}
      {feedback && (
        <div
          className={cn(
            "p-4 rounded-xl border text-xs flex items-center gap-3 shadow-2xs animate-in fade-in-50",
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25"
              : "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/25"
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      {/* 6. BOTTOM ACTION FOOTER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <p className="text-xs text-ink-soft">
          {isLocked
            ? "* Perubahan metode valuasi terkunci sementara demi konsistensi laporan laba rugi periode aktif."
            : "Pastikan pemetaan akun sudah sesuai bagan akun sebelum menekan tombol simpan."}
        </p>

        {canEdit && (
          <Button
            onClick={handleSave}
            disabled={saving || isLocked}
            className="h-9 gap-1.5 rounded-xl bg-terra text-white text-xs px-4 shadow-2xs hover:bg-terra/90 transition-[transform,background-color] active:scale-[0.98] self-end sm:self-auto"
          >
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Save className="size-3.5" />
                <span>Simpan Kebijakan Persediaan</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
