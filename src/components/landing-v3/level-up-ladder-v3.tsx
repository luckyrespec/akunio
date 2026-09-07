"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LadderSlide {
  level: string;
  stepNumber: string;
  title: string;
  badge: string;
  headline: string;
  desc: string;
  metrics: { label: string; value: string }[];
  keyBenefit: string;
  imageSrc: string;
  imageAlt: string;
}

const SLIDES: LadderSlide[] = [
  {
    level: "Tahap 1: Bertahan",
    stepNumber: "01",
    title: "Tertib Catat Harian",
    badge: "Fondasi Usaha",
    headline: "Hentikan Bon Hilang di Laci dan Kantong Kresek",
    desc: "Transaksi harian sering terlewat jika mengandalkan ingatan. Dengan foto struk 5 detik via ponsel, seluruh kuitansi belanja pasar, bensin, dan nota kasir tersimpan rapi dalam arsip digital permanen.",
    metrics: [
      { label: "Nota Tercatat", value: "100%" },
      { label: "Waktu Input", value: "5 Detik" },
    ],
    keyBenefit: "Menghilangkan 100% kebocoran kas akibat kuitansi hilang",
    imageSrc: "/illustrations/v3/pain-chaos-cartoon-2.jpg",
    imageAlt: "Dari kepusingan nota kusut menjadi pencatatan teratur",
  },
  {
    level: "Tahap 2: Terkendali",
    stepNumber: "02",
    title: "Pemisahan Kas & Margin Riil",
    badge: "Kendali Penuh",
    headline: "Ketahui Persis Laba Bersih Setiap Hari Tanpa Menebak",
    desc: "Uang dapur pribadi terpisah mutlak dari modal putar usaha. Anda tahu pasti menu makanan, varian kopi, atau jenis kaos mana yang paling tebal marginnya dan mana yang membebani kas.",
    metrics: [
      { label: "Akurasi HPP", value: "99.8%" },
      { label: "Margin Terbaca", value: "Real-Time" },
    ],
    keyBenefit: "Keputusan penetapan harga & stok barang berbasis data kemarin",
    imageSrc: "/illustrations/v3/receipt-to-bank-ticket.png",
    imageAlt: "Buku besar seimbang dan pemisahan rekening kas yang rapi",
  },
  {
    level: "Tahap 3: Kredibel & Bankable",
    stepNumber: "03",
    title: "Siap Modal Bank & Investor",
    badge: "Kesiapan Modal",
    headline: "Plafon Pinjaman Bank Cair & Investor Percaya",
    desc: "Dokumen Laba Rugi, Neraca, dan Arus Kas berstandar resmi SAK EMKM siap dicetak kapan pun. Analis bank menyetujui fasilitas modal kerja, dan mitra pemodal yakin menanamkan dana karena pembukuan Anda teruji rapi dan transparan.",
    metrics: [
      { label: "Plafon Disetujui", value: "Rp 50jt - 500jt+" },
      { label: "Kesiapan Pajak", value: "100% Tertib" },
    ],
    keyBenefit: "Status usaha Kategori A: mudah disetujui bank, dipercaya mitra",
    imageSrc: "/illustrations/v3/bank-approval-cartoon.png",
    imageAlt: "Persetujuan pinjaman modal usaha dan kemitraan investor",
  },
  {
    level: "Tahap 4: Ekspansi",
    stepNumber: "04",
    title: "Buka Cabang Baru & Kemitraan",
    badge: "Skala Besar",
    headline: "Gandakan Omzet dengan Multi-Outlet & Kepercayaan Investor",
    desc: "Buka cabang kedua, ketiga, dan seterusnya dengan sistem pembukuan multi-cabang terintegrasi. Calon mitra franchise dan investor strategis percaya menanamkan modal karena laporan keuangan transparan dan anti-rekayasa.",
    metrics: [
      { label: "Multi-Outlet", value: "Hingga 5 Cabang" },
      { label: "Valuasi Usaha", value: "Meningkat 3x" },
    ],
    keyBenefit: "Bisnis berjalan autopilot dengan laporan konsolidasi eksekutif",
    imageSrc: "/illustrations/v3/expansion-branch-cartoon.png",
    imageAlt: "Grand opening cabang baru didukung pembukuan terpercaya",
  },
];

export function LevelUpLadderV3() {
  const [currentIdx, setCurrentIdx] = useState<number>(2); // Default to Bankable (most high-converting)

  const activeSlide = SLIDES[currentIdx];

  const nextSlide = () => {
    setCurrentIdx((prev) => (prev + 1) % SLIDES.length);
  };

  const prevSlide = () => {
    setCurrentIdx((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  // Auto-advance slides, disabled when the user prefers reduced motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="naik-kelas" className="py-20 bg-canvas border-b border-rule scroll-mt-20">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight">
              UMKM Naik Kelas:{' '}<br className="hidden md:block" />Dari Toko Rintisan ke Usaha Kredibel
            </h2>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl">
              Dari pencatatan berantakan menjadi pembukuan berkelas — hingga dilirik investor.
            </p>
          </div>

          {/* Clean Controls: Only < and > buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={prevSlide}
              className="size-10 rounded-xl border border-rule bg-paper text-ink flex items-center justify-center hover:bg-canvas transition-colors shadow-2xs focus-ring"
              aria-label="Slide Sebelumnya"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              className="size-10 rounded-xl border border-rule bg-paper text-ink flex items-center justify-center hover:bg-canvas transition-colors shadow-2xs focus-ring"
              aria-label="Slide Selanjutnya"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        {/* 4 Steps Navigation Bar */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
          {SLIDES.map((s, idx) => {
            const isActive = currentIdx === idx;
            return (
              <button
                key={s.level}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={`focus-ring rounded-2xl border p-4 text-left transition-all duration-200 relative ${
                  isActive
                    ? "border-debit bg-paper shadow-md ring-2 ring-debit/20 -translate-y-1"
                    : "border-rule bg-paper/60 hover:bg-paper hover:shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-rule/70">
                  <span className="font-mono text-xs font-bold text-ink-soft">
                    {s.stepNumber}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      isActive
                        ? "bg-debit text-white"
                        : "bg-canvas text-ink-soft border border-rule"
                    }`}
                  >
                    {s.badge}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold text-ink truncate">{s.title}</p>
                <p className="text-[11px] text-ink-soft truncate">{s.level}</p>
                {isActive && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-3 bg-paper rotate-45 border-r border-b border-debit hidden md:block" />
                )}
              </button>
            );
          })}
        </div>

        {/* Featured Slideshow Card */}
        <div className="mt-6 rounded-3xl border border-rule bg-paper p-6 sm:p-10 shadow-sm relative overflow-hidden">
          
          <div className="grid gap-8 lg:grid-cols-12 items-center">
            
            {/* Left Content Column */}
            <div className="lg:col-span-6 space-y-5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-debit/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-debit font-mono">
                  {activeSlide.level}
                </span>
                <span className="text-xs text-ink-soft font-semibold">
                  Langkah {activeSlide.stepNumber} dari 04
                </span>
              </div>

              <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-ink leading-snug text-balance">
                {activeSlide.headline}
              </h3>

              <p className="text-sm sm:text-base text-ink-soft leading-relaxed">
                {activeSlide.desc}
              </p>

              {/* Real Metric Highlights */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {activeSlide.metrics.map((m) => (
                  <div key={m.label} className="rounded-xl border border-rule bg-canvas/50 p-3.5">
                    <p className="font-mono text-xl sm:text-2xl font-black text-ink tnum">
                      {m.value}
                    </p>
                    <p className="text-xs text-ink-soft mt-0.5 font-medium">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Key Outcome Badge */}
              <div className="rounded-xl border border-debit/20 bg-debit/5 p-3.5 flex items-center gap-2.5 text-xs text-ink font-semibold">
                <CheckCircle2 className="size-4 text-debit shrink-0" />
                <span>{activeSlide.keyBenefit}</span>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button asChild className="bg-terra hover:brightness-110 text-white font-bold text-xs h-10 px-6">
                  <a href="/daftar">Mulai dari Level Ini</a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={nextSlide}
                  className="text-xs text-ink hover:bg-canvas"
                >
                  Lihat Tahap Berikutnya →
                </Button>
              </div>
            </div>

            {/* Right Visual Cartoon Column */}
            <div className="lg:col-span-6 relative aspect-16/10 rounded-2xl overflow-hidden border border-rule shadow-md bg-canvas">
              <Image
                src={activeSlide.imageSrc}
                alt={activeSlide.imageAlt}
                fill
                className="object-cover transition-all duration-300"
                sizes="(max-width: 1024px) 100vw, 650px"
              />
              <div className="absolute top-3 left-3 rounded-lg bg-paper/95 border border-rule px-3 py-1 shadow-xs text-xs font-bold text-ink backdrop-blur-xs">
                {activeSlide.title}
              </div>
            </div>

          </div>

          {/* Bottom Dot Progress */}
          <div className="mt-8 pt-6 border-t border-rule/80 flex items-center justify-center">
            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentIdx(i)}
                  className={`h-2 rounded-full transition-all ${
                    currentIdx === i ? "w-8 bg-debit" : "w-2 bg-rule hover:bg-ink-soft"
                  }`}
                  aria-label={`Pindah ke Slide ${i + 1}`}
                />
              ))}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
