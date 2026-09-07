"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroVideoScrub() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const heroSectionRef = useRef<HTMLDivElement | null>(null);
  const phase0Ref = useRef<HTMLDivElement | null>(null);
  const phase1Ref = useRef<HTMLDivElement | null>(null);
  const phase2Ref = useRef<HTMLDivElement | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const heroSection = heroSectionRef.current;
    if (!video || !heroSection) return;

    // Progressive streaming: the video element fetches and plays
    // incrementally. The poster image stays until first frame is ready.
    video.src = "/assets/hero.mp4";
    video.load();

    const handleCanPlay = () => setVideoLoaded(true);
    video.addEventListener("canplay", handleCanPlay);

    let targetProgress = 0;
    let currentProgress = 0;
    let animFrameId: number;

    const calcOpacity = (
      progress: number,
      enterStart: number,
      enterEnd: number,
      exitStart: number,
      exitEnd: number
    ) => {
      if (progress < enterStart || progress > exitEnd) return 0;
      if (progress < enterEnd) return (progress - enterStart) / (enterEnd - enterStart);
      if (progress > exitStart) return Math.max(0, 1 - (progress - exitStart) / (exitEnd - exitStart));
      return 1.0;
    };

    const updateScroll = () => {
      const rect = heroSection.getBoundingClientRect();
      const max = rect.height - window.innerHeight;
      if (max > 0) {
        targetProgress = Math.max(0, Math.min(1, -rect.top / max));
      }
    };

    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);
    updateScroll();

    const scrubLoop = () => {
      currentProgress += (targetProgress - currentProgress) * 0.15;

      if (video && video.duration && !video.seeking) {
        const targetTime = currentProgress * video.duration;
        if (Math.abs(video.currentTime - targetTime) > 0.015) {
          video.currentTime = targetTime;
        }
      }

      const op0 = calcOpacity(targetProgress, 0.0, 0.05, 0.22, 0.3);
      const op1 = calcOpacity(targetProgress, 0.3, 0.38, 0.58, 0.65);
      const op2 = calcOpacity(targetProgress, 0.65, 0.74, 0.95, 1.0);

      if (phase0Ref.current) {
        phase0Ref.current.style.opacity = op0.toFixed(3);
        phase0Ref.current.style.transform = `translateY(${-targetProgress * 40}px)`;
        phase0Ref.current.style.pointerEvents = op0 > 0.3 ? "auto" : "none";
      }
      if (phase1Ref.current) {
        phase1Ref.current.style.opacity = op1.toFixed(3);
        phase1Ref.current.style.transform = `translateY(${(0.48 - targetProgress) * 35}px)`;
        phase1Ref.current.style.pointerEvents = op1 > 0.3 ? "auto" : "none";
      }
      if (phase2Ref.current) {
        phase2Ref.current.style.opacity = op2.toFixed(3);
        phase2Ref.current.style.transform = `translateY(${(0.82 - targetProgress) * 35}px)`;
        phase2Ref.current.style.pointerEvents = op2 > 0.3 ? "auto" : "none";
      }

      animFrameId = requestAnimationFrame(scrubLoop);
    };

    animFrameId = requestAnimationFrame(scrubLoop);

    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
      video.removeEventListener("canplay", handleCanPlay);
      cancelAnimationFrame(animFrameId);
    };
  }, []);

  return (
    <div id="hero-section" ref={heroSectionRef} className="relative h-[380vh] w-full bg-canvas">
      {/* Sticky Fullscreen Stage */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center">

        {/* Background Visual: Video Scrub or Poster Image */}
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <div
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
              videoLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
            style={{ backgroundImage: "url('/illustrations/v3/hero-level-up-cartoon.png')" }}
          />

          <video
            ref={videoRef}
            id="hero-video"
            playsInline
            muted
            preload="auto"
            loop
            poster="/illustrations/v3/hero-level-up-cartoon.png"
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          />

          {/* Paper Matte Scrim for Legible Ink Text */}
          <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/25 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-canvas/60 pointer-events-none" />
        </div>

        {/* Phase 0 Typography (0% - 25% Scroll) */}
        <div
          ref={phase0Ref}
          className="absolute left-4 right-4 sm:left-6 md:left-16 lg:left-24 max-w-2xl text-ink pointer-events-none transition-transform will-change-transform"
        >
          <h1 className="font-display text-3xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-ink leading-[1.08] text-balance">
            Nota Menumpuk di Laci. Laba Menebak-nebak.
          </h1>
          <p className="mt-4 sm:mt-5 text-sm sm:text-lg lg:text-xl text-ink-soft leading-relaxed max-w-xl font-normal">
            Omzet puluhan juta berputar setiap hari, tapi uang kas menguap tanpa jejak. Giliran butuh pinjaman bank, mitra mau suntik modal, atau perhitungan pajak tahunan, data berantakan dan membuat bingung.
          </p>
          <div className="mt-6 sm:mt-7 flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1">
              <ChevronDown className="size-4 text-terra" />
              Scroll ke bawah untuk melihat solusinya
            </span>
          </div>
        </div>

        {/* Phase 1 Typography (30% - 60% Scroll) */}
        <div
          ref={phase1Ref}
          className="absolute left-4 right-4 sm:left-6 md:left-16 lg:left-24 max-w-2xl text-ink pointer-events-none opacity-0 transition-transform will-change-transform"
        >
          <h2 className="font-display text-3xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-ink leading-[1.08] text-balance">
            Cukup Foto Nota. Akunio Susun Jurnal Seimbang.
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-lg lg:text-xl text-ink-soft leading-relaxed max-w-xl">
            Tinggalkan rumus Excel rusak. Cukup foto kuitansi bahan baku, bensin, atau faktur suplier, Akunio memetakan debit dan kredit secara otomatis. Selisih serupiah pun ditolak sistem sebelum bisa diposting.
          </p>
          <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-3 text-xs font-bold text-ink">
            <span className="flex items-center gap-1.5 rounded-md border border-rule bg-paper px-2.5 py-1">
              <CheckCircle2 className="size-4 text-debit" /> Standar SAK EMKM Resmi
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-rule bg-paper px-2.5 py-1">
              <CheckCircle2 className="size-4 text-debit" /> 5 Detik per Transaksi
            </span>
          </div>
        </div>

        {/* Phase 2 Typography (65% - 95% Scroll) */}
        <div
          ref={phase2Ref}
          className="absolute left-4 right-4 sm:left-6 md:left-16 lg:left-24 max-w-2xl text-ink pointer-events-none opacity-0 transition-transform will-change-transform"
        >
          <h2 className="font-display text-3xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-ink leading-[1.08] text-balance">
            Pembukuan Tertib. Siap Bank, Investor &amp; Pajak.
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-lg lg:text-xl text-ink-soft leading-relaxed max-w-xl font-normal">
            Laba Rugi, Neraca, dan Arus Kas tersusun rapi otomatis setiap transaksi diposting. Anda memegang kendali penuh atas laba riil: siap pengajuan pinjaman bank, transparan ke mitra investor, dan tenang saat perhitungan pajak.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-3 pointer-events-auto">
            <Button
              asChild
              size="lg"
              className="bg-terra hover:bg-terra/90 text-white font-bold px-6 sm:px-8 h-12 shadow-sm text-sm sm:text-base"
            >
              <Link href="/daftar" className="flex items-center gap-2">
                <span>Mulai Pembukuan Anda</span>
                <ArrowRight className="size-5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-rule bg-paper text-ink hover:bg-canvas font-semibold h-12 px-5 sm:px-6 text-sm sm:text-base"
            >
              <a href="#simulasi">Coba Simulasi Nota</a>
            </Button>
          </div>
          <p className="mt-4 text-xs font-medium text-ink-soft">
            Gratis memulai · Tanpa kartu kredit · Transaksi pertama dalam 2 menit
          </p>
        </div>

      </div>
    </div>
  );
}
