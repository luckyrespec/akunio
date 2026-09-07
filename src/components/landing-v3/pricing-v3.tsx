"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PricingV3() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [stamped, setStamped] = useState(false);

  // Play the stamp flourish once when the section scrolls into view.
  // Without JS the badge renders statically (content stays visible).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setStamped(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStamped(true);
          obs.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const PLANS = [
    {
      name: "Rintisan (Gratis)",
      price: "Rp 0",
      period: "selamanya",
      desc: "Untuk pemilik usaha yang baru memulai pembukuan rapi dan ingin menghentikan nota tercecer.",
      features: [
        "Hingga 50 transaksi draf foto/chat per bulan",
        "Jurnal Double-Entry otomatis seimbang",
        "Laporan Laba Rugi & Neraca dasar",
        "Ekspor laporan sederhana",
        "Tanpa perlu kartu kredit",
      ],
      popular: false,
      cta: "Mulai Gratis Sekarang",
      href: "/daftar",
    },
    {
      name: "Usaha Naik Kelas",
      price: "Rp 49.000",
      period: "per bulan",
      desc: "Paket lengkap untuk usaha aktif yang bersiap naik kelas, menarik modal, dan ekspansi cabang.",
      features: [
        "Transaksi nota & kuitansi tanpa batas",
        "Paket Dokumen Standar Lengkap (Laba Rugi, Neraca, Arus Kas, CALK)",
        "Format cetak resmi SAK EMKM siap untuk bank, investor, dan pajak",
        "Rekonsiliasi mutasi rekening bank otomatis",
        "Jejak audit permanen & anti-rekayasa",
        "Dukungan multi-pengguna (Pemilik + Kasir)",
      ],
      popular: true,
      cta: "Pilih Paket Naik Kelas",
      href: "/daftar",
    },
    {
      name: "Multi-Cabang & Mitra",
      price: "Rp 149.000",
      period: "per bulan",
      desc: "Dirancang untuk usaha yang sudah memiliki beberapa gerai dan menarik investasi kemitraan.",
      features: [
        "Semua fitur Paket Usaha Naik Kelas",
        "Manajemen hingga 5 cabang / outlet usaha",
        "Laporan konsolidasi antar-cabang",
        "Akses akun khusus untuk analis bank / investor",
        "Bimbingan set-up bagan akun awal khusus usaha Anda",
      ],
      popular: false,
      cta: "Hubungi Tim Bisnis",
      href: "/daftar",
    },
  ];

  return (
    <section ref={sectionRef} id="harga" className="py-20 bg-canvas border-b border-rule">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">

        <div className="max-w-3xl text-center mx-auto">
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight text-balance">
            Lebih Murah dari Makan Siang
          </h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl mx-auto">
            Mulai gratis. Upgrade saat usaha siap mengajukan modal.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mt-12 grid gap-8 md:grid-cols-3 items-stretch max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`group rounded-3xl border-2 p-6 sm:p-8 flex flex-col justify-between transition-all duration-200 relative ${
                plan.popular
                  ? "border-terra bg-ink text-paper shadow-md ring-4 ring-terra/15 -translate-y-2 hover:-translate-y-3"
                  : "border-rule bg-paper/90 shadow-xs hover:border-rule/80 hover:-translate-y-1"
              }`}
            >
              {plan.popular && (
                <div
                  aria-hidden
                  className={`absolute -top-5 left-1/2 -translate-x-1/2 rounded-lg border-2 border-dashed border-terra/70 bg-paper px-4 py-1 text-[11px] font-black uppercase tracking-wider text-terra shadow-sm ${
                    stamped ? "stamp-in" : "opacity-0"
                  }`}
                >
                  Paling Direkomendasikan
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h3 className={`font-bold text-xl ${plan.popular ? "text-paper" : "text-ink"}`}>{plan.name}</h3>
                  {plan.price === "Rp 0" && (
                    <span className="rounded-md bg-canvas border border-rule px-2 py-0.5 text-[10px] font-mono font-bold text-ink-soft">
                      SELAMANYA
                    </span>
                  )}
                </div>
                <p className={`mt-2 text-xs leading-relaxed ${plan.popular ? "text-paper/70" : "text-ink-soft"}`}>{plan.desc}</p>

                <div className={`mt-6 flex items-baseline gap-1 border-b-2 pb-5 ${plan.popular ? "border-paper/20" : "border-rule"}`}>
                  <span className={`font-mono font-black tnum ${
                    plan.popular
                      ? "text-5xl sm:text-6xl text-paper"
                      : "text-3xl sm:text-4xl text-ink"
                  }`}>
                    {plan.price}
                  </span>
                  <span className={`text-xs font-semibold ${plan.popular ? "text-paper/60" : "text-ink-soft"}`}>/{plan.period}</span>
                </div>

                <ul className="mt-6 space-y-3.5 text-xs">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className={`size-4 shrink-0 mt-0.5 font-bold ${plan.popular ? "text-terra" : "text-debit"}`} />
                      <span className={`leading-snug font-medium ${plan.popular ? "text-paper" : "text-ink"}`}>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`mt-8 pt-5 border-t ${plan.popular ? "border-paper/15" : "border-rule"}`}>
                <Button
                  asChild
                  className={`w-full font-extrabold h-12 text-xs shadow-sm ${
                    plan.popular
                      ? "bg-terra hover:bg-terra/90 text-white shadow-md"
                      : "bg-ink hover:bg-ink/85 text-paper"
                  }`}
                >
                  <Link href={plan.href} className="group/cta flex items-center justify-center gap-2">
                    <span>{plan.cta}</span>
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                  </Link>
                </Button>
                <p className={`mt-2.5 text-center text-[11px] font-medium ${plan.popular ? "text-paper/60" : "text-ink-soft"}`}>
                  {plan.price === "Rp 0" ? "Tanpa batas waktu trial · Tanpa kartu kredit" : "Bisa batalkan langganan kapan saja tanpa denda"}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
