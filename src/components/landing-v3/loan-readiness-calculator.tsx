"use client";

import { useState } from "react";
import { ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoanReadinessCalculator() {
  const [revenue, setRevenue] = useState<number>(35000000); // 35 Juta
  const [yearsActive, setYearsActive] = useState<number>(2); // 2 Tahun
  const [hasStandardLedger, setHasStandardLedger] = useState<boolean>(true);

  const estimatedMargin = 0.22;
  const estimatedMonthlyNetProfit = revenue * estimatedMargin;

  const standardPlafon = Math.round((estimatedMonthlyNetProfit * 4.2 * (yearsActive >= 2 ? 1.2 : 0.9)) / 5000000) * 5000000;
  const manualPlafon = Math.round((revenue * 0.3) / 5000000) * 5000000;

  const currentPlafon = hasStandardLedger ? Math.max(standardPlafon, 25000000) : Math.min(manualPlafon, 20000000);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <section id="kalkulator" className="py-20 bg-canvas border-b border-rule">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight text-balance">
            Hitung Potensi Lompatan Usaha Anda
          </h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl">
            Bandingkan potensi plafon modal: catatan manual vs pembukuan standar.
          </p>
        </div>

        {/* Calculator Grid */}
        <div className="mt-10 grid gap-8 lg:grid-cols-12 items-stretch">
          
          {/* Controls Input Left (7 Cols) */}
          <div className="lg:col-span-7 rounded-3xl border-2 border-rule bg-paper p-6 sm:p-8 space-y-7 shadow-xs">
            
            {/* Control 1: Omzet Bulanan */}
            <div>
              <div className="flex justify-between items-center text-sm font-bold text-ink">
                <span>Rata-rata Omzet Bulanan Usaha Anda:</span>
                <span className="font-mono text-terra text-base font-black">{formatRupiah(revenue)}</span>
              </div>
              <input
                type="range"
                aria-label="Rata-rata Omzet Bulanan Usaha"
                min={10000000}
                max={250000000}
                step={5000000}
                value={revenue}
                onChange={(e) => setRevenue(Number(e.target.value))}
                className="w-full mt-3 accent-terra cursor-pointer h-2 bg-canvas rounded-lg"
              />
              <div className="flex justify-between text-[11px] font-mono text-ink-soft mt-1.5">
                <span>Rp 10 Juta</span>
                <span>Rp 100 Juta</span>
                <span>Rp 250 Juta+</span>
              </div>
            </div>

            {/* Control 2: Usia Usaha */}
            <div>
              <div className="flex justify-between items-center text-sm font-bold text-ink">
                <span>Lama Usaha Berjalan:</span>
                <span className="font-mono text-ink text-sm font-black">{yearsActive} Tahun</span>
              </div>
              <input
                type="range"
                aria-label="Lama Usaha Berjalan dalam Tahun"
                min={1}
                max={10}
                step={1}
                value={yearsActive}
                onChange={(e) => setYearsActive(Number(e.target.value))}
                className="w-full mt-3 accent-terra cursor-pointer h-2 bg-canvas rounded-lg"
              />
              <div className="flex justify-between text-[11px] font-mono text-ink-soft mt-1.5">
                <span>1 Tahun</span>
                <span>5 Tahun</span>
                <span>10 Tahun+</span>
              </div>
            </div>

            {/* Control 3: Status Pembukuan Toggle */}
            <div>
              <p className="text-sm font-bold text-ink mb-3">Status Pencatatan Keuangan Saat Ini:</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHasStandardLedger(false)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    !hasStandardLedger
                      ? "border-destructive bg-destructive/10 ring-2 ring-destructive/40 shadow-xs"
                      : "border-rule bg-canvas/40 hover:bg-canvas text-ink-soft"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`size-4.5 ${!hasStandardLedger ? "text-destructive" : "text-ink-soft"}`} />
                    <span className="text-xs font-extrabold text-ink">Manual / Excel Biasa</span>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
                    Nota kertas campur di laci, neraca tidak baku, rawan selisih saldo.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setHasStandardLedger(true)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    hasStandardLedger
                      ? "border-debit bg-debit/10 ring-2 ring-debit/40 shadow-xs"
                      : "border-rule bg-canvas/40 hover:bg-canvas text-ink-soft"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`size-4.5 ${hasStandardLedger ? "text-debit" : "text-ink-soft"}`} />
                    <span className="text-xs font-extrabold text-ink">Standar SAK EMKM (Akunio)</span>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
                    Debit-kredit seimbang 100%, catatan rapi dan sah, siap untuk bank, investor, dan pajak.
                  </p>
                </button>
              </div>
            </div>

          </div>

          {/* Results Output Right (5 Cols) */}
          <div
            className={`lg:col-span-5 rounded-3xl border-2 p-6 sm:p-8 flex flex-col justify-between shadow-md transition-all ${
              hasStandardLedger
                ? "border-debit/50 bg-paper ring-2 ring-debit/20"
                : "border-destructive/40 bg-paper ring-2 ring-destructive/20"
            }`}
          >
            <div>
              <div className="flex items-center justify-between border-b border-rule pb-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Estimasi Plafon Pinjaman Bank
                </span>
                <span
                  className={`rounded-md px-3 py-1 text-[11px] font-mono font-bold uppercase tracking-wider ${
                    hasStandardLedger
                      ? "bg-debit text-white shadow-2xs"
                      : "bg-destructive text-white shadow-2xs"
                  }`}
                >
                  {hasStandardLedger ? "POTENSI CAIR TINGGI" : "RISIKO PENOLAKAN TINGGI"}
                </span>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Estimasi Plafon Modal Kerja / KUR:
                  </p>
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                    hasStandardLedger ? "bg-debit/15 text-debit" : "bg-destructive/15 text-destructive"
                  }`}>
                    {hasStandardLedger ? "Kategori Bank: A" : "Kategori Bank: D"}
                  </span>
                </div>

                <p
                  className={`font-mono text-4xl sm:text-5xl font-black mt-2 tnum leading-none tracking-tight ${
                    hasStandardLedger ? "text-debit" : "text-destructive"
                  }`}
                >
                  {formatRupiah(currentPlafon)}
                </p>

                <p className="mt-3 text-xs sm:text-sm text-ink leading-relaxed">
                  {hasStandardLedger ? (
                    <span>
                      Dengan pembukuan resmi Akunio, bank memiliki keyakinan penuh terhadap rasio perputaran kas toko Anda. Peluang disetujui mencapai <strong>92%</strong>.
                    </span>
                  ) : (
                    <span>
                      Tanpa laporan keuangan terverifikasi, bank biasanya menolak permohonan atau hanya memberikan limit kartu kredit mikro dengan bunga tinggi.
                    </span>
                  )}
                </p>
              </div>

              {/* Side-by-side gap card with Banking Metrics */}
              <div className="mt-6 rounded-2xl border border-rule bg-canvas/60 p-4 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-ink-soft">Suku Bunga Pinjaman:</span>
                  <span className="font-bold text-ink">
                    {hasStandardLedger ? "KUR 6% / Komersial Rendah" : "Bunga Konsumtif Tinggi (12-24%)"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-soft">Waktu Analisis Berkas:</span>
                  <span className="font-bold text-ink">
                    {hasStandardLedger ? "3 - 5 Hari Kerja" : "2 - 4 Minggu (Sering Ditolak)"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-soft">Debt Service Coverage (DSCR):</span>
                  <span className="font-mono font-bold text-ink">
                    {hasStandardLedger ? "2.4x (Sangat Sehat)" : "0.6x (Rawan Macet)"}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-rule/80 pt-2.5 font-bold">
                  <span className="text-ink">Tambahan Peluang Modal:</span>
                  <span className="font-mono text-debit text-sm">
                    +{formatRupiah(Math.max(0, standardPlafon - manualPlafon))}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-rule">
              <Button asChild className="w-full bg-terra hover:brightness-110 text-white font-extrabold h-12 text-sm shadow-md">
                <a href="/daftar" className="flex items-center justify-center gap-2">
                  <span>Mulai Pembukuan Standar Bank Sekarang</span>
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
