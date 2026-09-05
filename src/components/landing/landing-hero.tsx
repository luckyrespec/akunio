"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Camera, CheckCircle2, FileCheck2, RotateCcw } from "lucide-react";
import { HeroStage } from "./landing-art";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const PROOF = [
  { icon: Camera, iconClass: "text-terra", title: "Foto jadi jurnal", desc: "AI memetakan nota ke akun yang benar" },
  { icon: RotateCcw, iconClass: "text-terra", title: "Salah? Bisa dikoreksi", desc: "Via jurnal pembalik yang tertaut" },
  { icon: CheckCircle2, iconClass: "text-debit", title: "Tutup buku setahun", desc: "12 periode terkunci rapi" },
  { icon: FileCheck2, iconClass: "text-debit", title: "Siap ke bank", desc: "4 laporan standar real-time" },
];

export function LandingHero() {
  const reduce = useReducedMotion();
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay, ease: EASE },
        };

  return (
    <section className="relative overflow-hidden pt-16">
      <div className="mx-auto grid w-full max-w-[1600px] items-center gap-10 px-4 pt-10 pb-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:px-8 lg:pt-16 lg:pb-16">
        <div>
          <motion.h1
            {...enter(0.02)}
            className="font-display max-w-[16ch] text-4xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Pembukuan beres sebelum sempat menumpuk.
          </motion.h1>
          <motion.p {...enter(0.1)} className="mt-5 max-w-[52ch] text-base leading-relaxed text-ink-soft sm:text-lg">
            Foto nota atau ketik pengeluaran — Akunio menyusun draf jurnal yang seimbang, Anda setujui, sistem
            mengunci. Laporan standar siap kapan pun Anda butuh.
          </motion.p>
          <motion.div {...enter(0.18)} id="hero-cta" className="mt-7 flex scroll-mt-24 flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/daftar"
              className="focus-ring group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-paper shadow-xs transition-all hover:bg-ink/80 active:translate-y-px"
            >
              Mulai pembukuan Anda
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#cara-kerja"
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-rule bg-paper px-6 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
            >
              <Camera className="size-4" />
              Lihat cara kerja
            </Link>
          </motion.div>
          <motion.dl {...enter(0.26)} className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule lg:grid-cols-4">
            {PROOF.map((p) => (
              <div key={p.title} className="bg-paper px-4 py-3.5">
                <dt className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <p.icon className={`size-3.5 ${p.iconClass}`} strokeWidth={2.5} />
                  {p.title}
                </dt>
                <dd className="mt-1 text-xs leading-snug text-ink-soft">{p.desc}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        <motion.div {...(reduce ? {} : { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.5, delay: 0.12, ease: EASE } })}>
          <HeroStage />
        </motion.div>
      </div>
    </section>
  );
}
