"use client";

import * as React from "react";
import {
  ShieldCheck,
  Building2,
  User,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Save,
  Loader2,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaxSettings, TaxpayerType } from "@/core/tax/pph-final";
import { updateTaxSettingsAction } from "@/server/actions/tax.actions";

interface TaxSettingsTabProps {
  initialSettings: TaxSettings;
  userRole?: string;
}

export function TaxSettingsTab({ initialSettings, userRole }: TaxSettingsTabProps) {
  const [taxpayerType, setTaxpayerType] = React.useState<TaxpayerType>(
    initialSettings.taxpayerType ?? "INDIVIDUAL"
  );
  const [npwp, setNpwp] = React.useState<string>(initialSettings.npwp ?? "");
  const [pphFinalEnabled, setPphFinalEnabled] = React.useState<boolean>(
    initialSettings.pphFinalEnabled ?? true
  );
  const [autoMonthlyAccrual, setAutoMonthlyAccrual] = React.useState<boolean>(
    initialSettings.autoMonthlyAccrual ?? true
  );
  const [ppnEnabled, setPpnEnabled] = React.useState<boolean>(
    initialSettings.ppnEnabled ?? false
  );
  const [ppnRatePercent, setPpnRatePercent] = React.useState<number>(
    initialSettings.ppnRatePercent ?? 12
  );
  const [withholdingTaxEnabled, setWithholdingTaxEnabled] = React.useState<boolean>(
    initialSettings.withholdingTaxEnabled ?? false
  );

  const [isPending, startTransition] = React.useTransition();
  const [statusMsg, setStatusMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const canEdit = userRole === "OWNER" || userRole === "ACCOUNTANT";

  const handleSave = () => {
    setStatusMsg(null);
    startTransition(async () => {
      const res = await updateTaxSettingsAction({
        taxpayerType,
        npwp: npwp.trim() || undefined,
        pphFinalEnabled,
        autoMonthlyAccrual,
        ppnEnabled,
        ppnRatePercent,
        withholdingTaxEnabled,
      });

      if (res.ok) {
        setStatusMsg({ type: "success", text: "Pengaturan perpajakan berhasil disimpan." });
      } else {
        setStatusMsg({ type: "error", text: res.error || "Gagal menyimpan pengaturan." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Pengaturan Pajak Entitas</h2>
        <p className="text-xs text-ink-soft mt-1">
          Konfigurasi status perpajakan UMKM berpedoman pada PP No. 55 Tahun 2022 dan standar SAK EMKM Bab 15.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            statusMsg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 1. Jenis Wajib Pajak */}
      <div className="rounded-2xl border-2 border-rule bg-paper p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Jenis Wajib Pajak Usaha</h3>
            <p className="text-xs text-ink-soft mt-0.5">
              Menentukan hak fasilitas bebas pajak peredaran bruto Rp 500 juta per tahun kalender.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setTaxpayerType("INDIVIDUAL")}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
              taxpayerType === "INDIVIDUAL"
                ? "border-terra bg-terra/5 ring-2 ring-terra/20"
                : "border-rule bg-canvas/40 hover:border-rule/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="size-4 text-terra" />
                <span className="font-semibold text-xs text-ink">Orang Pribadi (UMKM)</span>
              </div>
              <Badge variant="default" className="bg-emerald-600 text-white text-[10px]">
                Fasilitas Rp 500 Juta
              </Badge>
            </div>
            <p className="text-[11px] text-ink-soft mt-2 leading-relaxed">
              Peredaran bruto s.d. Rp 500 juta setahun bebas dari pengenaan PPh Final. Pajak 0,5% hanya dihitung atas omzet di atas Rp 500 juta.
            </p>
          </button>

          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setTaxpayerType("CORPORATE")}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
              taxpayerType === "CORPORATE"
                ? "border-terra bg-terra/5 ring-2 ring-terra/20"
                : "border-rule bg-canvas/40 hover:border-rule/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-ink" />
                <span className="font-semibold text-xs text-ink">Badan Usaha (PT / CV / Koperasi)</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Tarif 0,5% Penuh
              </Badge>
            </div>
            <p className="text-[11px] text-ink-soft mt-2 leading-relaxed">
              Tidak berlaku fasilitas batas Rp 500 juta. PPh Final 0,5% langsung dikenakan dari rupiah pertama peredaran bruto tiap bulan.
            </p>
          </button>
        </div>
      </div>

      {/* 2. NPWP / NITKU */}
      <div className="rounded-2xl border-2 border-rule bg-paper p-5 space-y-3 shadow-xs">
        <label htmlFor="npwp-input" className="block text-xs font-semibold text-ink">
          Nomor Pokok Wajib Pajak (NPWP / NITKU 16 Digit)
        </label>
        <p className="text-xs text-ink-soft">
          Digunakan saat menyusun formulir SPT Masa dan pencatatan bukti pelunasan NTPN resmi.
        </p>
        <input
          id="npwp-input"
          type="text"
          value={npwp}
          disabled={!canEdit}
          onChange={(e) => setNpwp(e.target.value)}
          placeholder="Contoh: 01.234.567.8-901.000 atau 16 digit NIK"
          className="w-full sm:max-w-md h-9 px-3 text-xs font-mono rounded-xl border-2 border-rule bg-canvas text-ink focus:border-terra focus:outline-none"
        />
      </div>

      {/* 3. Otomasi & Fitur Pajak */}
      <div className="rounded-2xl border-2 border-rule bg-paper p-5 space-y-4 shadow-xs">
        <h3 className="text-sm font-semibold text-ink">Opsi Otomasi &amp; Penjurnalan Pajak</h3>

        <div className="divide-y divide-rule/60 text-xs">
          {/* Toggle PPh Final */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span>Perhitungan PPh Final UMKM 0,5% (PP 55/2022)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3 text-ink-soft cursor-pointer" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Secara berkala menghitung peredaran bruto dari pendapatan usaha dan menentukan beban pajak terutang.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Mengaktifkan rekapitulasi omzet dan kalkulasi PPh Final bulanan.
              </p>
            </div>
            <input
              type="checkbox"
              checked={pphFinalEnabled}
              disabled={!canEdit}
              onChange={(e) => setPphFinalEnabled(e.target.checked)}
              className="size-4 rounded text-terra accent-terra cursor-pointer"
            />
          </div>

          {/* Toggle Jadwal Akrual Otomatis */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span>Siapkan Draf Jurnal Akrual Tiap Akhir Bulan</span>
                <Badge variant="outline" className="text-[10px] bg-canvas">Review Gate</Badge>
              </div>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Sistem otomatis membuat entri draf akrual (Beban Pajak vs Utang PPh) yang harus disetujui pengguna sebelum posting.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoMonthlyAccrual}
              disabled={!canEdit}
              onChange={(e) => setAutoMonthlyAccrual(e.target.checked)}
              className="size-4 rounded text-terra accent-terra cursor-pointer"
            />
          </div>

          {/* Toggle PPN */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span>Pajak Pertambahan Nilai (PPN) — Pengusaha Kena Pajak</span>
              </div>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Aktifkan pencatatan PPN Masukan (1400) dan PPN Keluaran (2200) pada penerbitan faktur.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {ppnEnabled && (
                <select
                  value={ppnRatePercent}
                  disabled={!canEdit}
                  onChange={(e) => setPpnRatePercent(Number(e.target.value))}
                  className="h-8 px-2 text-xs rounded-lg border border-rule bg-canvas text-ink"
                >
                  <option value={11}>Tarif 11%</option>
                  <option value={12}>Tarif 12%</option>
                </select>
              )}
              <input
                type="checkbox"
                checked={ppnEnabled}
                disabled={!canEdit}
                onChange={(e) => setPpnEnabled(e.target.checked)}
                className="size-4 rounded text-terra accent-terra cursor-pointer"
              />
            </div>
          </div>

          {/* Toggle Withholding Tax */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span>PPh Pemotongan / Pemungutan (PPh 21, 23, 4 ayat 2)</span>
              </div>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Mencatat pemotongan pajak atas gaji karyawan, jasa rekanan, atau sewa gedung.
              </p>
            </div>
            <input
              type="checkbox"
              checked={withholdingTaxEnabled}
              disabled={!canEdit}
              onChange={(e) => setWithholdingTaxEnabled(e.target.checked)}
              className="size-4 rounded text-terra accent-terra cursor-pointer"
            />
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="h-9 px-4 text-xs font-semibold rounded-xl bg-terra text-white hover:bg-terra/90 flex items-center gap-1.5"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            <span>Simpan Pengaturan Pajak</span>
          </Button>
        </div>
      )}
    </div>
  );
}
