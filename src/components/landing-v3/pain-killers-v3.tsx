"use client";

import { useState } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Building2,
  Users,
  ReceiptText,
  MousePointerClick,
} from "lucide-react";

export function PainKillersV3() {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const PAINS = [
    {
      num: "01",
      shortLabel: "Kas Campur Aduk",
      title: "Uang Toko dan Uang Pribadi Tercampur: Omzet Besar, Kas Selalu Kosong",
      problem:
        "Uang belanja toko, kasbon karyawan, dan belanja dapur pribadi ada di satu rekening yang sama. Omzet terlihat puluhan juta, tetapi saat waktunya kulakan stok barang baru, kas sudah habis tidak jelas ke mana larinya.",
      remedy:
        "Akunio memisahkan kas operasional dan penarikan pribadi secara otomatis. Setiap nota tercatat rapi, sehingga posisi kas toko yang sesungguhnya selalu terbaca jelas setiap hari tanpa menebak-nebak.",
      pillar: "Kendali Arus Kas",
      pillarDesc: "Mengetahui pasti sisa laba bersih harian untuk modal putar.",
    },
    {
      num: "02",
      shortLabel: "Nota & Excel Rusak",
      title: "Rumus Excel Rawan Rusak dan Nota Menumpuk di Laci Kasir",
      problem:
        "Pernah mencoba mencatat di spreadsheet, tetapi rumusnya bergeser jadi error dan datanya tertimpa staf. Akhirnya malas mencatat, kuitansi berbulan-bulan menumpuk di laci sampai tintanya pudar dan hilang.",
      remedy:
        "Cukup foto nota lewat ponsel atau ketik transaksi singkat. Akunio langsung membaca nama toko, tanggal, dan nominal, lalu menyiapkan draf jurnal seimbang dalam hitungan detik tanpa rumus rumit.",
      pillar: "Otomasi Bebas Repot",
      pillarDesc: "Hemat 2 jam kerja setiap malam dari urusan rekap manual.",
    },
    {
      num: "03",
      shortLabel: "Sulit Bank / Investor / Pajak",
      title: "Usaha Tertahan Saat Butuh Modal Bank, Mitra Investor, atau Pelaporan Pajak",
      problem:
        "Ketika peluang buka cabang baru datang, pihak bank meminta laporan keuangan 6 bulan terakhir. Saat ada rekan mau invest modal, mereka ragu karena pembukuan tidak baku. Giliran musim lapor pajak, panik menghitung omzet dari tumpukan bon.",
      remedy:
        "Laporan Laba Rugi, Neraca, dan Arus Kas standar SAK EMKM terbentuk otomatis dari setiap transaksi harian. Pembukuan tertib membuat usaha Anda siap kapan pun butuh ke bank, bermitra dengan investor, atau melapor pajak tanpa rasa cemas.",
      pillar: "Tiket Usaha Naik Kelas",
      pillarDesc: "Kredibel di hadapan analis kredit, calon investor, dan kantor pajak.",
    },
  ];

  return (
    <section id="masalah" className="py-20 bg-paper border-b border-rule scroll-mt-20">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight text-balance">
            Tiga Masalah yang Menahan Usaha Berkembang
          </h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl">
            Bukan kurang laris — uang yang tak tercatat jelas.
          </p>
        </div>

        {/* Highlight Visual with Cartoon Illustration */}
        <div className="mt-12 rounded-3xl border-2 border-rule bg-canvas/60 p-6 sm:p-8 lg:p-10 grid gap-8 lg:grid-cols-12 items-center shadow-xs">
          <div className="lg:col-span-6 relative aspect-16/10 rounded-2xl overflow-hidden border border-rule shadow-sm">
            <Image
              src="/illustrations/v3/pain-chaos-cartoon.png"
              alt="Ilustrasi kartun pemilik usaha stres dengan nota menumpuk dan spreadsheet rusak"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 600px"
            />
            <div className="absolute top-3 left-3 rounded-lg bg-paper/95 border border-destructive/40 px-3.5 py-1.5 shadow-xs text-xs font-bold text-destructive backdrop-blur-xs">
              Kendala Pencatatan Manual
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">
              <TrendingDown className="size-4" />
              <span>Penyebab Utama Usaha Tertahan &amp; Sulit Naik Kelas</span>
            </div>
            <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-ink leading-snug">
              &quot;Usaha Ramai Tiap Hari, Mengapa Masih Sulit Buka Cabang dan Menarik Modal?&quot;
            </h3>
            <p className="text-sm sm:text-base text-ink-soft leading-relaxed">
              Pihak bank, rekan investor, maupun kantor pajak tidak menilai toko dari sekadar ramainya pengunjung, melainkan dari keteraturan pembukuan. Tanpa catatan yang baku, usaha Anda sulit dinilai kemampuannya dan rawan salah ambil keputusan bisnis.
            </p>
            
            {/* 3 Pillars of Readiness Badges */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold text-ink">
              <div className="flex items-center gap-2 text-debit bg-debit/10 px-3 py-2 rounded-xl border border-debit/20">
                <Building2 className="size-4 shrink-0" />
                <span>Siap Analisis Bank &amp; KUR</span>
              </div>
              <div className="flex items-center gap-2 text-terra bg-terra/10 px-3 py-2 rounded-xl border border-terra/20">
                <Users className="size-4 shrink-0" />
                <span>Siap Investor &amp; Mitra</span>
              </div>
              <div className="flex items-center gap-2 text-ink bg-ink/5 px-3 py-2 rounded-xl border border-rule">
                <ReceiptText className="size-4 shrink-0" />
                <span>Tenang Hitung Pajak</span>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Click Instruction & Quick Filter Pills */}
        <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-ink-soft">
            <MousePointerClick className="size-4 text-terra animate-pulse" />
            <span>Klik kartu masalah di bawah untuk melihat perbandingan dan solusinya:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {PAINS.map((item, idx) => (
              <button
                key={item.num}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`min-h-[38px] px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  selectedIdx === idx
                    ? "bg-ink text-paper shadow-sm"
                    : "bg-canvas border border-rule text-ink-soft hover:text-ink hover:border-rule/80"
                }`}
              >
                <span className="font-mono text-[10px] opacity-75">{item.num}</span>
                <span>{item.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3 Detailed Interactive Pain Cards with Spring Elevation */}
        <div className="mt-6 grid gap-6 md:grid-cols-3 items-stretch">
          {PAINS.map((item, idx) => {
            const isSelected = selectedIdx === idx;
            return (
              <div
                key={item.num}
                onClick={() => setSelectedIdx(idx)}
                className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 ${
                  isSelected
                    ? "border-terra bg-paper shadow-xl ring-4 ring-terra/15 -translate-y-2.5 scale-[1.015]"
                    : "border-rule bg-canvas/40 hover:bg-canvas/70 shadow-xs hover:border-rule/80"
                }`}
              >
                {/* Background Large Number Watermark */}
                <span
                  aria-hidden
                  className={`font-display absolute -top-4 right-4 text-7xl font-black transition-opacity select-none pointer-events-none ${
                    isSelected ? "text-terra/15" : "text-ink/[0.05]"
                  }`}
                >
                  {item.num}
                </span>

                <div>
                  <div className="flex items-center justify-between border-b-2 border-rule pb-3">
                    <span className="font-mono text-sm font-black text-terra flex items-center gap-1.5">
                      MASALAH {item.num}
                    </span>
                    {isSelected ? (
                      <span className="rounded-md bg-terra text-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-2xs">
                        Sedang Ditinjau
                      </span>
                    ) : (
                      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
                        Kendala Nyata
                      </span>
                    )}
                  </div>

                  <h4 className="mt-4 text-lg font-bold text-ink tracking-tight leading-snug">
                    {item.title}
                  </h4>

                  {/* Problem Description */}
                  <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-ink/85 leading-relaxed">
                    <p className="font-bold text-destructive mb-1 flex items-center gap-1">
                      <ShieldAlert className="size-3.5" /> Kondisi di Lapangan:
                    </p>
                    {item.problem}
                  </div>
                </div>

                {/* Solution Box */}
                <div className="mt-5 pt-4 border-t border-rule space-y-3">
                  <div className="rounded-2xl border border-debit/30 bg-debit/10 p-4 text-xs text-ink/95 leading-relaxed">
                    <p className="font-bold text-debit mb-1 flex items-center gap-1">
                      <Sparkles className="size-3.5" /> Solusi Akunio:
                    </p>
                    {item.remedy}
                  </div>

                  {/* Pillar Highlight when active */}
                  <div
                    className={`grid transition-all duration-200 ${
                      isSelected
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="rounded-xl bg-canvas border border-rule p-3 text-[11px] text-ink-soft flex items-center justify-between gap-2">
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <CheckCircle2 className="size-3.5 text-debit" />
                          {item.pillar}
                        </span>
                        <span className="text-right text-[10px] text-ink-soft font-medium">
                          {item.pillarDesc}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
