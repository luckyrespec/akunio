import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { GlowCard } from "@/components/aceternity/glow-card";

import { ArrowUpRight, BarChart3, BookOpen, Layers, RefreshCw } from "lucide-react";

const REPORTS = [
  { href: "/laporan/laba-rugi", label: "Laporan Laba Rugi", note: "Kinerja pendapatan dan beban periode berjalan", icon: BarChart3 },
  { href: "/laporan/neraca", label: "Neraca Keuangan", note: "Posisi aset, liabilitas, dan ekuitas kumulatif", icon: BookOpen },
  { href: "/laporan/arus-kas", label: "Laporan Arus Kas", note: "Arus kas operasi, investasi, dan pendanaan", icon: RefreshCw },
  { href: "/laporan/perubahan-ekuitas", label: "Laporan Perubahan Ekuitas", note: "Rekonsiliasi modal dan laba ditahan", icon: Layers },
];

export default async function LaporanIndex() {
  await requireContext();
  return (
    <section className="space-y-6">
      <PageHeader
        title="Laporan Keuangan"
        eyebrow="Disusun sesuai standar IFRS untuk SME · Siap dicetak atau diekspor ke PDF"
      />

      <Reveal delay={0.08}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.href}
                href={r.href}
                className="group flex flex-col justify-between rounded-2xl border border-rule bg-paper p-6 shadow-xs transition-all hover:border-terra/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-canvas text-terra group-hover:bg-terra group-hover:text-white transition-colors">
                    <Icon className="size-5" />
                  </div>
                  <ArrowUpRight className="size-4 text-ink-soft group-hover:text-terra transition-colors" />
                </div>
                <div className="mt-5">
                  <h3 className="font-display text-base font-semibold text-ink group-hover:text-terra transition-colors">
                    {r.label}
                  </h3>
                  <p className="mt-1 text-xs text-ink-soft leading-relaxed">{r.note}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
