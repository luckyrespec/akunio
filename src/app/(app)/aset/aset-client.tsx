"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Plus,
  Play,
  TrendingDown,
  Coins,
  PackageCheck,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateAssetDialog } from "./create-asset-dialog";
import { RunDepreciationDialog } from "./run-depreciation-dialog";
import { Money } from "@/core/money/money";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface PeriodOption {
  name: string;
  status: string;
}

export function AsetClient({
  initialAssets,
  accounts,
  openPeriods,
}: {
  initialAssets: any[];
  accounts: AccountOption[];
  openPeriods: PeriodOption[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [runDepDialogOpen, setRunDepDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Summary KPI calculation
  const totalCostMinor = assets.reduce(
    (sum, a) => sum + BigInt(a.acquisitionCostMinor),
    0n,
  );
  const activeAssets = assets.filter((a) => a.status === "ACTIVE");

  const filteredAssets = assets.filter((a) => {
    if (categoryFilter === "ALL") return true;
    return a.category === categoryFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-ink tracking-tight flex items-center gap-2.5">
            <Building2 className="size-6 text-terra" />
            Daftar Aset Tetap
          </h1>
          <p className="text-sm text-ink-soft">
            Pencatatan inventaris aset, penyusutan otomatis, dan pelaporan nilai buku (SAK EMKM).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => setRunDepDialogOpen(true)}
            className="border-terra/40 text-terra hover:bg-terra/10 transition-colors"
          >
            <Play className="size-4 mr-1.5" />
            Jalankan Penyusutan
          </Button>

          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-terra text-white hover:bg-terra/90 transition-colors"
          >
            <Plus className="size-4 mr-1.5" />
            Tambah Aset
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center justify-between">
              Total Nilai Perolehan
              <Coins className="size-4 text-ink-soft" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {Money.formatIdr(totalCostMinor)}
            </div>
            <p className="text-[11px] text-ink-soft mt-1">Harga historis seluruh aset</p>
          </CardContent>
        </Card>

        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center justify-between">
              Aset Aktif
              <PackageCheck className="size-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {activeAssets.length} <span className="text-xs font-normal text-ink-soft">unit</span>
            </div>
            <p className="text-[11px] text-ink-soft mt-1">Sedang aktif disusutkan</p>
          </CardContent>
        </Card>

        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center justify-between">
              Lunas Susut
              <TrendingDown className="size-4 text-ink-soft" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {assets.filter((a) => a.status === "FULLY_DEPRECIATED").length}{" "}
              <span className="text-xs font-normal text-ink-soft">unit</span>
            </div>
            <p className="text-[11px] text-ink-soft mt-1">Masa manfaat berakhir</p>
          </CardContent>
        </Card>

        <Card className="border-rule bg-paper">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center justify-between">
              Aset Dilepas / Jual
              <AlertCircle className="size-4 text-ink-soft" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-ink">
              {assets.filter((a) => a.status === "DISPOSED").length}{" "}
              <span className="text-xs font-normal text-ink-soft">unit</span>
            </div>
            <p className="text-[11px] text-ink-soft mt-1">Telah dihapus/dijual</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {["ALL", "KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR", "BANGUNAN", "TANAH"].map(
          (cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full font-medium transition-all ${
                categoryFilter === cat
                  ? "bg-ink text-paper shadow-xs dark:bg-terra dark:text-white"
                  : "bg-canvas border border-rule text-ink hover:bg-paper"
              }`}
            >
              {cat === "ALL" ? "Semua Kategori" : cat.replace(/_/g, " ")}
            </button>
          ),
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-canvas/70 text-ink-soft font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Aset</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Tgl Perolehan</th>
                <th className="px-4 py-3 text-right">Biaya Perolehan</th>
                <th className="px-4 py-3">Metode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60 text-ink">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ink-soft">
                    Belum ada aset tetap terdaftar. Klik "+ Tambah Aset" untuk mendaftarkan aset baru.
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-canvas/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-terra">
                      {asset.code}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/aset/${asset.id}`}
                        className="hover:text-terra transition-colors flex items-center gap-1 group"
                      >
                        {asset.name}
                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {asset.category.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-ink-soft font-mono">
                      {asset.acquisitionDate}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {Money.formatIdr(BigInt(asset.acquisitionCostMinor))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-canvas px-1.5 py-0.5 border border-rule/70 text-[10px] font-mono">
                        {asset.depreciationMethod === "STRAIGHT_LINE" ? "Garis Lurus" : "Saldo Menurun"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          asset.status === "ACTIVE"
                            ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                            : asset.status === "FULLY_DEPRECIATED"
                            ? "border-blue-500/30 text-blue-700 bg-blue-500/10"
                            : "border-rose-500/30 text-rose-700 bg-rose-500/10"
                        }
                      >
                        {asset.status === "ACTIVE"
                          ? "Aktif"
                          : asset.status === "FULLY_DEPRECIATED"
                          ? "Lunas Susut"
                          : "Dilepas"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/aset/${asset.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs">
                          Detail
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialogs */}
      <CreateAssetDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        accounts={accounts}
        onSuccess={(newAsset) => setAssets((prev) => [newAsset, ...prev])}
      />

      <RunDepreciationDialog
        open={runDepDialogOpen}
        onOpenChange={setRunDepDialogOpen}
        openPeriods={openPeriods}
      />
    </div>
  );
}
