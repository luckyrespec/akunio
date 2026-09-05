"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Coins,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisposalDialog } from "./disposal-dialog";
import { Money } from "@/core/money/money";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function AssetDetailClient({
  asset,
  schedule,
  disposal,
  accounts,
}: {
  asset: any;
  schedule: any[];
  disposal: any | null;
  accounts: AccountOption[];
}) {
  const [currentAsset, setCurrentAsset] = useState(asset);
  const [currentDisposal, setCurrentDisposal] = useState(disposal);
  const [disposalDialogOpen, setDisposalDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "info">("schedule");

  const costMinor = BigInt(currentAsset.acquisitionCostMinor);
  const salvageMinor = BigInt(currentAsset.salvageValueMinor || 0);

  // Total posted depreciation
  const postedDepMinor = schedule
    .filter((s) => s.status === "POSTED")
    .reduce((sum, s) => sum + BigInt(s.depreciationAmountMinor), 0n);

  const currentBookValueMinor = costMinor - postedDepMinor;

  const assetAccount = accounts.find((a) => a.id === currentAsset.assetAccountId);
  const depAccount = accounts.find((a) => a.id === currentAsset.accumulatedDepAccountId);
  const expAccount = accounts.find((a) => a.id === currentAsset.depreciationExpenseAccountId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/aset"
            className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink mb-1.5 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar Aset
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">
              {currentAsset.name}
            </h1>
            <Badge
              variant="outline"
              className={
                currentAsset.status === "ACTIVE"
                  ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                  : currentAsset.status === "FULLY_DEPRECIATED"
                  ? "border-blue-500/30 text-blue-700 bg-blue-500/10"
                  : "border-rose-500/30 text-rose-700 bg-rose-500/10"
              }
            >
              {currentAsset.status === "ACTIVE"
                ? "Aktif"
                : currentAsset.status === "FULLY_DEPRECIATED"
                ? "Lunas Susut"
                : "Dilepas"}
            </Badge>
          </div>
          <p className="text-xs font-mono text-ink-soft mt-0.5">
            Kode: {currentAsset.code} • Kategori: {currentAsset.category.replace(/_/g, " ")}
          </p>
        </div>

        {currentAsset.status !== "DISPOSED" && (
          <Button
            variant="destructive"
            onClick={() => setDisposalDialogOpen(true)}
            className="text-xs"
          >
            <AlertTriangle className="size-3.5 mr-1.5" />
            Pelepasan / Jual Aset
          </Button>
        )}
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
              Harga Perolehan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {Money.formatIdr(costMinor)}
            </div>
            <p className="text-[11px] text-ink-soft mt-0.5">Residu: {Money.formatIdr(salvageMinor)}</p>
          </CardContent>
        </Card>

        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
              Akumulasi Penyusutan Terposting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {Money.formatIdr(postedDepMinor)}
            </div>
            <p className="text-[11px] text-ink-soft mt-0.5">
              {schedule.filter((s) => s.status === "POSTED").length} dari {schedule.length} bulan
            </p>
          </CardContent>
        </Card>

        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
              Nilai Buku Bersih (NBV)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {Money.formatIdr(currentBookValueMinor)}
            </div>
            <p className="text-[11px] text-ink-soft mt-0.5">Nilai aset di neraca saat ini</p>
          </CardContent>
        </Card>
      </div>

      {/* Disposal Banner if Disposed */}
      {currentDisposal && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-ink space-y-1">
          <div className="font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
            <AlertTriangle className="size-4" />
            Aset ini telah dilepas / dijual pada tanggal {currentDisposal.disposalDate}
          </div>
          <div className="text-ink-soft">
            Tipe Pelepasan: <strong>{currentDisposal.disposalType}</strong> • Hasil Penjualan:{" "}
            <strong>{Money.formatIdr(BigInt(currentDisposal.proceedsMinor))}</strong> • Laba/Rugi:{" "}
            <strong className={BigInt(currentDisposal.gainLossMinor) >= 0n ? "text-emerald-600" : "text-rose-600"}>
              {Money.formatIdr(BigInt(currentDisposal.gainLossMinor))}
            </strong>
          </div>
        </div>
      )}

      {/* Tabs Nav */}
      <div className="flex items-center gap-1 rounded-lg border border-rule bg-canvas p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-[color,background-color,box-shadow] ${
            activeTab === "schedule"
              ? "bg-paper text-terra font-semibold shadow-xs"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          <FileSpreadsheet className="size-3.5" />
          Jadwal Penyusutan Bulanan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("info")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-[color,background-color,box-shadow] ${
            activeTab === "info"
              ? "bg-paper text-terra font-semibold shadow-xs"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          <Building2 className="size-3.5" />
          Informasi Spesifikasi & Akun
        </button>
      </div>

      {activeTab === "schedule" && (
        <div className="pt-1">
          <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-rule bg-canvas/70 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Periode</th>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3 text-right">Beban Penyusutan</th>
                    <th className="px-4 py-3 text-right">Akumulasi Beban</th>
                    <th className="px-4 py-3 text-right">Nilai Buku (NBV)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule/60 text-ink">
                  {schedule.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                        Aset ini tidak memiliki jadwal penyusutan (misal: Tanah).
                      </td>
                    </tr>
                  ) : (
                    schedule.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-canvas/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-medium">{item.periodName}</td>
                        <td className="px-4 py-2.5 font-mono text-ink-soft">{item.depreciationDate}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">
                          {Money.formatIdr(BigInt(item.depreciationAmountMinor))}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-ink-soft">
                          {Money.formatIdr(BigInt(item.accumulatedDepreciationMinor))}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium">
                          {Money.formatIdr(BigInt(item.bookValueMinor))}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={
                              item.status === "POSTED"
                                ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10 text-[11px]"
                                : "border-rule text-ink-soft bg-canvas/60 text-[11px]"
                            }
                          >
                            {item.status === "POSTED" ? "Terposting" : "Terjadwal"}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "info" && (
        <div className="pt-1">
          <Card className="border-rule bg-paper">
            <CardContent className="pt-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-ink-soft block mb-0.5">Tanggal Pembelian</span>
                  <strong className="font-mono">{currentAsset.acquisitionDate}</strong>
                </div>
                <div>
                  <span className="text-ink-soft block mb-0.5">Tanggal Mulai Digunakan</span>
                  <strong className="font-mono">{currentAsset.inServiceDate}</strong>
                </div>
                <div>
                  <span className="text-ink-soft block mb-0.5">Masa Manfaat</span>
                  <span>
                    {currentAsset.usefulLifeMonths} bulan ({Math.floor(currentAsset.usefulLifeMonths / 12)} tahun)
                  </span>
                </div>
                <div>
                  <span className="text-ink-soft block mb-0.5">Metode Penyusutan</span>
                  <span>
                    {currentAsset.depreciationMethod === "STRAIGHT_LINE"
                      ? "Garis Lurus (Straight-Line)"
                      : "Saldo Menurun (Declining Balance)"}
                  </span>
                </div>
              </div>

              <div className="border-t border-rule pt-3 space-y-2">
                <h4 className="font-semibold text-ink">Akun Buku Besar Terkait</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-rule/70 bg-canvas p-2.5">
                    <span className="text-[11px] text-ink-soft block">Akun Aset (15xx)</span>
                    <span className="font-mono font-semibold text-terra">
                      {assetAccount ? `${assetAccount.code} - ${assetAccount.name}` : "-"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-rule/70 bg-canvas p-2.5">
                    <span className="text-[11px] text-ink-soft block">Akun Akumulasi (16xx)</span>
                    <span className="font-mono font-semibold text-ink">
                      {depAccount ? `${depAccount.code} - ${depAccount.name}` : "-"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-rule/70 bg-canvas p-2.5">
                    <span className="text-[11px] text-ink-soft block">Akun Beban Penyusutan (62xx)</span>
                    <span className="font-mono font-semibold text-ink">
                      {expAccount ? `${expAccount.code} - ${expAccount.name}` : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {currentAsset.notes && (
                <div className="border-t border-rule pt-3">
                  <span className="text-ink-soft block mb-0.5">Catatan Tambahan</span>
                  <p className="text-ink whitespace-pre-wrap">{currentAsset.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Disposal Dialog */}
      <DisposalDialog
        open={disposalDialogOpen}
        onOpenChange={setDisposalDialogOpen}
        asset={currentAsset}
        accumulatedDepMinor={postedDepMinor}
        accounts={accounts}
        onSuccess={(disposalData) => {
          setCurrentAsset((prev: any) => ({ ...prev, status: "DISPOSED" }));
          setCurrentDisposal(disposalData);
        }}
      />
    </div>
  );
}
