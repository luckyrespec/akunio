import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { Reveal } from "@/components/motion";

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
      <Reveal>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Laporan Keuangan</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Disusun mengikuti IFRS untuk SME. Setiap laporan dapat dicetak ke PDF.
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <ul className="matte-card mt-6 divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
          {REPORTS.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="flex items-baseline justify-between px-5 py-4 transition-colors hover:bg-canvas">
                <span className="font-medium">{r.label}</span>
                <span className="text-xs text-ink-soft">{r.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
