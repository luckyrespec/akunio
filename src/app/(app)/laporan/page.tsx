import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { GlowCard } from "@/components/aceternity/glow-card";

const REPORTS = [
  { href: "/laporan/laba-rugi", label: "Laporan Laba Rugi", note: "Kinerja periode berjalan" },
  { href: "/laporan/neraca", label: "Neraca", note: "Posisi keuangan kumulatif" },
  { href: "/laporan/arus-kas", label: "Laporan Arus Kas", note: "Metode tidak langsung" },
  { href: "/laporan/perubahan-ekuitas", label: "Perubahan Ekuitas", note: "Modal dan laba ditahan" },
];

export default async function LaporanIndex() {
  await requireContext();
  return (
    <section className="max-w-2xl">
      <PageHeader title="Laporan Keuangan" eyebrow="IFRS untuk SME" />
      <p className="mt-2 text-sm text-ink-soft">
        Disusun mengikuti IFRS untuk SME. Setiap laporan dapat dicetak ke PDF.
      </p>
      <Reveal delay={0.08}>
        <GlowCard className="mt-6">
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl">
            {REPORTS.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="flex items-baseline justify-between px-5 py-4 transition-colors hover:bg-canvas">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-xs text-ink-soft">{r.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </GlowCard>
      </Reveal>
    </section>
  );
}
