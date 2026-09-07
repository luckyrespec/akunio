"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Lock,
  ArrowRight,
  Receipt,
  RotateCcw,
  BarChart3,
  Scale,
  Send,
  Building2,
  Check,
} from "lucide-react";

interface Preset {
  id: string;
  title: string;
  category: string;
  prompt: string;
  vendor: string;
  date: string;
  rows: {
    code: string;
    account: string;
    debit: string | null;
    credit: string | null;
  }[];
  total: string;
  impact: {
    labaRugi: string;
    neraca: string;
    kas: string;
  };
}

const PRESETS: Preset[] = [
  {
    id: "atk",
    title: "Beli Kertas & Tinta",
    category: "Pengeluaran Operasional",
    prompt: "Akunio, baru saja beli kertas A4 2 rim dan tinta printer di Toko Berkah 350.000 tunai.",
    vendor: "Toko ATK Berkah",
    date: "14 Okt 2026",
    rows: [
      { code: "5101", account: "Beban Perlengkapan Kantor", debit: "Rp 315.315", credit: null },
      { code: "1150", account: "PPN Masukan (11%)", debit: "Rp 34.685", credit: null },
      { code: "1110", account: "Kas Toko (Tunai)", debit: null, credit: "Rp 350.000" },
    ],
    total: "Rp 350.000",
    impact: {
      labaRugi: "Beban bertambah Rp 315.315 (mengurangi laba kena pajak)",
      neraca: "Kas berkurang Rp 350.000",
      kas: "Arus kas operasi keluar Rp 350.000",
    },
  },
  {
    id: "pendapatan",
    title: "Terima Pembayaran Klien",
    category: "Penerimaan Kas",
    prompt: "Akunio, masuk transfer dari PT Maju Bersama 4.500.000 pelunasan invoice katering kemarin di BCA.",
    vendor: "PT Maju Bersama",
    date: "14 Okt 2026",
    rows: [
      { code: "1120", account: "Bank BCA Operasional", debit: "Rp 4.500.000", credit: null },
      { code: "4101", account: "Pendapatan Usaha Katering", debit: null, credit: "Rp 4.500.000" },
    ],
    total: "Rp 4.500.000",
    impact: {
      labaRugi: "Pendapatan bertambah Rp 4.500.000 (menaikkan laba)",
      neraca: "Saldo Bank BCA bertambah Rp 4.500.000",
      kas: "Arus kas masuk Rp 4.500.000",
    },
  },
  {
    id: "sewa",
    title: "Bayar Sewa Tempat",
    category: "Aset & Beban di Muka",
    prompt: "Akunio, catat sewa kios cabang baru untuk 6 bulan ke depan 12.000.000 transfer Mandiri.",
    vendor: "Pengelola Ruko Sentosa",
    date: "14 Okt 2026",
    rows: [
      { code: "1160", account: "Sewa Dibayar di Muka", debit: "Rp 12.000.000", credit: null },
      { code: "1121", account: "Bank Mandiri Operasional", debit: null, credit: "Rp 12.000.000" },
    ],
    total: "Rp 12.000.000",
    impact: {
      labaRugi: "Belum jadi beban bulan ini (diamortisasi bulanan rapi)",
      neraca: "Aset sewa bertambah, saldo bank berkurang seimbang",
      kas: "Arus kas keluar investasi tempat Rp 12.000.000",
    },
  },
];

export function InteractiveSimulator() {
  const reduce = useReducedMotion();
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[0]);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [isPosted, setIsPosted] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const handleSelectPreset = (preset: Preset) => {
    setSelectedPreset(preset);
    setIsPosted(false);
    setActiveStep(1);
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 300);
  };

  const handlePost = () => {
    setIsPosted(true);
    setTimeout(() => {
      setActiveStep(3);
    }, 450);
  };

  const handleReset = () => {
    setIsPosted(false);
    setActiveStep(1);
  };

  return (
    <div className="matte-card overflow-hidden rounded-2xl border border-rule bg-paper shadow-md">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-canvas/60 px-4 py-3 sm:px-6">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
            Simulator Alur Kerja Nyata
          </span>
          <h3 className="font-display text-base font-semibold text-ink sm:text-lg">
            Coba Sendiri: Dari Bahasa Santai ke Buku Besar Rapi
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <RotateCcw className="size-3" />
            Reset Demo
          </button>
        </div>
      </div>

      {/* Preset selector pills */}
      <div className="border-b border-rule/70 px-4 py-3 sm:px-6">
        <p className="mb-2 text-xs font-medium text-ink-soft">
          Pilih contoh transaksi yang sering Anda hadapi:
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const isSelected = preset.id === selectedPreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "border-terra bg-terra text-paper shadow-xs"
                    : "border-rule bg-canvas/60 text-ink hover:border-rule hover:bg-canvas"
                }`}
              >
                {preset.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3 Steps Navigation Tab */}
      <div className="grid grid-cols-3 border-b border-rule text-center text-xs font-medium sm:text-sm">
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-3 transition-colors ${
            activeStep === 1
              ? "border-terra bg-paper text-terra font-semibold"
              : "border-transparent bg-canvas/30 text-ink-soft hover:text-ink"
          }`}
        >
          <MessageSquare className="size-4" />
          <span>1. Chat AI</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-3 transition-colors ${
            activeStep === 2
              ? "border-terra bg-paper text-terra font-semibold"
              : "border-transparent bg-canvas/30 text-ink-soft hover:text-ink"
          }`}
        >
          <Scale className="size-4" />
          <span>2. Draf Seimbang</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-3 transition-colors ${
            activeStep === 3
              ? "border-terra bg-paper text-terra font-semibold"
              : "border-transparent bg-canvas/30 text-ink-soft hover:text-ink"
          }`}
        >
          <BarChart3 className="size-4" />
          <span>3. Laporan Siap Pakai</span>
        </button>
      </div>

      {/* Simulator Body */}
      <div className="p-4 sm:p-6">
        {/* Step 1: Chat AI */}
        {activeStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">
                Anda
              </div>
              <div className="max-w-xl rounded-2xl rounded-tl-none border border-rule bg-canvas p-3.5 text-sm text-ink shadow-xs">
                <p className="leading-relaxed">
                  {isTyping ? "Sedang memuat..." : selectedPreset.prompt}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
                  <Receipt className="size-3 text-terra" />
                  <span>Lampiran nota terdeteksi · {selectedPreset.vendor}</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-terra text-xs font-semibold text-paper">
                AI
              </div>
              <div className="max-w-xl rounded-2xl rounded-tl-none border border-rule bg-paper p-3.5 text-sm text-ink shadow-xs">
                <p className="leading-relaxed font-medium text-ink">
                  Siap, sudah Akunio pahami! Transaksi dari <strong>{selectedPreset.vendor}</strong> sebesar <strong>{selectedPreset.total}</strong> telah disusun ke draf jurnal berpasangan seimbang.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-debit/10 px-2 py-1 font-medium text-debit">
                    ✓ Debit = Kredit Seimbang
                  </span>
                  <span className="rounded-md bg-canvas px-2 py-1 text-ink-soft">
                    Bagan Akun SAK EMKM
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule/80 bg-canvas/40 p-3">
              <span className="text-xs text-ink-soft">
                Tinjau draf jurnal Debit dan Kredit sebelum diposting permanen:
              </span>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-terra px-4 py-2 text-xs font-semibold text-paper shadow transition hover:bg-terra/90"
              >
                Lihat Draf Jurnal
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Auto Posting Seimbang */}
        {activeStep === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
              <div>
                <span className="tnum font-mono text-xs text-ink-soft">
                  {isPosted ? "JE-2026-0042 (TERKUNCI)" : "DRAF JURNAL UMUM"}
                </span>
                <p className="text-sm font-semibold text-ink">
                  {selectedPreset.vendor} · {selectedPreset.date}
                </p>
              </div>
              {isPosted ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-debit/40 bg-debit/10 px-3 py-1 text-xs font-semibold text-debit">
                  <Check className="size-3.5" />
                  Berhasil Diposting & Terkunci
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-canvas px-3 py-1 text-xs font-medium text-ink-soft">
                  <Lock className="size-3 text-terra" />
                  Menunggu Persetujuan Anda
                </span>
              )}
            </div>

            {/* Table of Debit/Credit */}
            <div className="overflow-hidden rounded-xl border border-rule">
              <div className="grid grid-cols-[80px_1fr_110px_110px] items-center gap-2 bg-canvas px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
                <span>Kode</span>
                <span>Nama Akun</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Kredit</span>
              </div>
              <div className="divide-y divide-rule/60 bg-paper">
                {selectedPreset.rows.map((row) => (
                  <div
                    key={row.code}
                    className="grid grid-cols-[80px_1fr_110px_110px] items-center gap-2 px-4 py-2.5 text-xs sm:text-sm"
                  >
                    <span className="font-mono text-xs text-ink-soft">{row.code}</span>
                    <span className="font-medium text-ink truncate">{row.account}</span>
                    <span className={`tnum text-right font-medium ${row.debit ? "text-debit" : "text-ink-soft"}`}>
                      {row.debit ?? "—"}
                    </span>
                    <span className={`tnum text-right font-medium ${row.credit ? "text-ink" : "text-ink-soft"}`}>
                      {row.credit ?? "—"}
                    </span>
                  </div>
                ))}

                {/* Total row */}
                <div className="grid grid-cols-[80px_1fr_110px_110px] items-center gap-2 bg-canvas/60 px-4 py-2.5 text-xs sm:text-sm font-semibold">
                  <span />
                  <span className="text-ink">Total Seimbang</span>
                  <span className="tnum text-right text-debit">{selectedPreset.total}</span>
                  <span className="tnum text-right text-ink">{selectedPreset.total}</span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <CheckCircle2 className="size-4 text-debit" />
                <span>Validasi debit = kredit 100% lolos. Tidak ada angka timpang.</span>
              </div>

              {!isPosted ? (
                <button
                  type="button"
                  onClick={handlePost}
                  className="inline-flex items-center gap-2 rounded-xl bg-terra px-5 py-2.5 text-xs font-semibold text-paper shadow transition hover:bg-terra/90 active:scale-98"
                >
                  <Check className="size-4" />
                  Setujui & Kunci Jurnal
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-terra bg-terra/10 px-4 py-2 text-xs font-semibold text-terra hover:bg-terra/20"
                >
                  Lihat Hasil di Laporan Keuangan
                  <ArrowRight className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Laporan Keuangan Siap Pakai */}
        {activeStep === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-debit/30 bg-debit/5 p-3.5 text-xs sm:text-sm text-ink">
              <div className="flex items-center gap-2 font-semibold text-debit">
                <CheckCircle2 className="size-4" />
                Transaksi berhasil diposting ke Buku Besar!
              </div>
              <p className="mt-1 text-ink-soft">
                Laporan keuangan Anda langsung terbarui saat detik ini juga tanpa perlu kalkulasi spreadsheet manual.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Laba Rugi Card */}
              <div className="rounded-xl border border-rule bg-canvas/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
                    Laporan Laba Rugi
                  </span>
                  <span className="rounded bg-paper px-2 py-0.5 text-[10px] font-medium text-ink">
                    Real-Time
                  </span>
                </div>
                <h4 className="mt-1 font-display text-base font-semibold text-ink">
                  Kinerja Periode Berjalan
                </h4>
                <div className="mt-3 space-y-1.5 border-t border-rule/60 pt-2.5 text-xs">
                  <p className="text-ink-soft">Dampak transaksi ini:</p>
                  <p className="font-medium text-ink">{selectedPreset.impact.labaRugi}</p>
                </div>
              </div>

              {/* Neraca Card */}
              <div className="rounded-xl border border-rule bg-canvas/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft">
                    Laporan Posisi Keuangan (Neraca)
                  </span>
                  <span className="rounded bg-paper px-2 py-0.5 text-[10px] font-medium text-ink">
                    SAK EMKM
                  </span>
                </div>
                <h4 className="mt-1 font-display text-base font-semibold text-ink">
                  Posisi Aset & Liabilitas
                </h4>
                <div className="mt-3 space-y-1.5 border-t border-rule/60 pt-2.5 text-xs">
                  <p className="text-ink-soft">Dampak transaksi ini:</p>
                  <p className="font-medium text-ink">{selectedPreset.impact.neraca}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-paper p-3">
              <span className="text-xs text-ink-soft">
                Semua laporan siap diekspor ke PDF untuk bank, investor, atau pelaporan SPT Pajak.
              </span>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-terra hover:underline"
              >
                Coba transaksi lain
                <RotateCcw className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
