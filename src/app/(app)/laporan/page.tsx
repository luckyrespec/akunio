import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts, organizations } from "@/server/db/schema/org";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { postedLinesBetween } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { buildSakEmkmBalanceSheet, buildSakEmkmIncomeStatement } from "@/core/reports/sak-emkm";
import { Money } from "@/core/money/money";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Layers,
  RefreshCw,
  FileText,
  ShieldCheck,
  Building2,
  CheckCircle2,
} from "lucide-react";

export default async function LaporanIndex() {
  const ctx = await requireContext();
  const year = new Date().getFullYear();

  let netIncome: bigint | null = null;
  let totalAssets: bigint | null = null;
  let cashPosition: bigint | null = null;
  let totalEquity: bigint | null = null;
  let isBalanced = true;
  let entityName = "Entitas Usaha Akunio";

  try {
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    const profile = await getProfile(db, ctx.orgId);
    if (profile?.businessName) entityName = profile.businessName;
    else if (org?.name) entityName = org.name;

    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const metas = reportMetaMap(accRows);
    const lines = await postedLinesBetween(db, ctx.orgId, `${year}-01-01`, `${year}-12-31`);
    const aggs = aggregateFromLines(lines, metas);

    const is = buildSakEmkmIncomeStatement(aggs);
    netIncome = is.netIncomeMinor;

    cashPosition = aggs
      .filter((a) => a.meta.isCash || a.meta.isBank)
      .reduce((s, a) => s + signed(a.meta, a), 0n);

    const bs = buildSakEmkmBalanceSheet(aggs, is.netIncomeMinor);
    totalAssets = bs.totalAssetsMinor;
    totalEquity = bs.totalEquityMinor;
    isBalanced = bs.isBalanced;
  } catch {
    // Fallback bila data/DB belum ada jurnal posted
  }

  // 3 Laporan Pokok SAK EMKM (Bab 3, 4, 14)
  const PRIMARY_REPORTS = [
    {
      href: "/laporan/neraca",
      label: "Laporan Posisi Keuangan",
      badge: "Bab 3 SAK EMKM",
      note: "Menyajikan klasifikasi aset lancar, aset tetap, liabilitas jangka pendek, dan ekuitas.",
      icon: BookOpen,
      figure: totalAssets !== null ? Money.fromMinor(totalAssets).formatIdr() : null,
      figureLabel: "Total Aset",
    },
    {
      href: "/laporan/laba-rugi",
      label: "Laporan Laba Rugi",
      badge: "Bab 4 SAK EMKM",
      note: "Menyajikan pendapatan operasional, beban pokok penjualan, beban usaha, dan laba bersih.",
      icon: BarChart3,
      figure: netIncome !== null ? Money.fromMinor(netIncome).formatIdr() : null,
      figureLabel: `Laba Bersih ${year}`,
    },
    {
      href: "/laporan/calk",
      label: "Catatan Atas Laporan Keuangan",
      badge: "Bab 14 SAK EMKM",
      note: "Memuat profil entitas, dasar penyusunan SAK EMKM, ikhtisar kebijakan akuntansi, dan rincian pos.",
      icon: FileText,
      figure: "Sesuai Standar",
      figureLabel: "Kepatuhan",
    },
  ];

  // 2 Laporan Pelengkap
  const SECONDARY_REPORTS = [
    {
      href: "/laporan/arus-kas",
      label: "Laporan Arus Kas",
      badge: "Arus Kas",
      note: "Rekonsiliasi mutasi penerimaan dan pengeluaran kas (Operasi, Investasi, Pendanaan).",
      icon: RefreshCw,
      figure: cashPosition !== null ? Money.fromMinor(cashPosition).formatIdr() : null,
      figureLabel: "Saldo Kas & Bank",
    },
    {
      href: "/laporan/perubahan-ekuitas",
      label: "Laporan Perubahan Ekuitas",
      badge: "Ekuitas",
      note: "Pergerakan modal disetor, penarikan prive pemilik, dan akumulasi saldo laba.",
      icon: Layers,
      figure: totalEquity !== null ? Money.fromMinor(totalEquity).formatIdr() : null,
      figureLabel: "Total Ekuitas",
    },
  ];

  return (
    <section className="space-y-8">
      {/* Page Header Ringkas & Bersih dengan Info Entitas & Kepatuhan Terintegrasi */}
      <PageHeader
        title="Pusat Laporan Keuangan"
        eyebrow={`Paket pelaporan resmi standar SAK EMKM ${year} · Siap audit, lampiran pajak, & ekspor PDF/Excel formal.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-rule bg-paper px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs">
              <Building2 className="size-3.5 text-terra" />
              <span>{entityName}</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-2xs dark:bg-emerald-950/40 dark:border-emerald-700/50 dark:text-emerald-200">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>SAK EMKM IAI</span>
            </div>
          </div>
        }
      />

      {/* 1. KELOMPOK LAPORAN UTAMA SAK EMKM */}
      <div className="space-y-5">
        <div className="flex items-end justify-between border-b-2 border-ink/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-terra" />
              <h2 className="font-display text-base sm:text-lg font-bold text-ink uppercase tracking-tight">
                Laporan Pokok SAK EMKM
              </h2>
            </div>
            <p className="text-xs font-medium text-ink-soft mt-0.5">
              Tiga komponen laporan wajib bagi UMKM menurut Bab 3, 4, dan 14 Standar Akuntansi Keuangan IAI.
            </p>
          </div>
          <span className="text-[11px] font-bold text-terra uppercase tracking-wider hidden sm:inline-block px-2.5 py-1 rounded-md bg-terra/10">
            Wajib SAK EMKM
          </span>
        </div>

        <Stagger className="grid grid-cols-1 gap-6 md:grid-cols-3" staggerDelay={0.08}>
          {PRIMARY_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <StaggerItem key={r.href}>
                <Link
                  href={r.href}
                  className="group flex flex-col justify-between h-full rounded-2xl border-2 border-rule bg-paper p-6 shadow-xs transition-all duration-200 hover:border-terra hover:shadow-md hover:-translate-y-1"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex size-12 items-center justify-center rounded-xl bg-canvas text-terra border border-rule group-hover:bg-terra group-hover:text-white transition-all shadow-2xs">
                        <Icon className="size-6" />
                      </div>
                      <span className="rounded-md border border-terra/20 bg-terra/10 px-2.5 py-1 text-[11px] font-bold text-terra uppercase tracking-wider">
                        {r.badge}
                      </span>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-lg font-bold text-ink group-hover:text-terra transition-colors leading-snug">
                          {r.label}
                        </h3>
                        <ArrowUpRight className="size-4.5 text-ink-soft group-hover:text-terra transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0" />
                      </div>

                      <p className="mt-2.5 text-xs text-ink-soft leading-relaxed">
                        {r.note}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-5 border-t border-rule/80">
                    <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">{r.figureLabel}</p>
                    <p className="tnum mt-1 truncate font-display text-2xl font-bold tracking-tight text-ink group-hover:text-terra transition-colors">
                      {r.figure || "—"}
                    </p>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>

      {/* 2. KELOMPOK LAPORAN PELENGKAP / ANALITIK */}
      <div className="space-y-5 pt-4">
        <div className="flex items-end justify-between border-b-2 border-ink/40 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-ink" />
              <h2 className="font-display text-base sm:text-lg font-bold text-ink uppercase tracking-tight">
                Laporan Pelengkap &amp; Analitik
              </h2>
            </div>
            <p className="text-xs font-medium text-ink-soft mt-0.5">
              Laporan pelengkap komprehensif untuk pengawasan likuiditas kas dan struktur ekuitas pemilik.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider hidden sm:inline-block">
            Pelengkap Manajemen
          </span>
        </div>

        <Stagger className="grid grid-cols-1 gap-6 sm:grid-cols-2" staggerDelay={0.08}>
          {SECONDARY_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <StaggerItem key={r.href}>
                <Link
                  href={r.href}
                  className="group flex flex-col justify-between h-full rounded-2xl border-2 border-rule bg-paper p-6 shadow-xs transition-all duration-200 hover:border-ink hover:shadow-md hover:-translate-y-1"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-canvas text-ink group-hover:bg-ink group-hover:text-paper transition-all border border-rule shadow-2xs">
                        <Icon className="size-5" />
                      </div>
                      <ArrowUpRight className="size-4.5 text-ink-soft group-hover:text-ink transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>

                    <div className="mt-5">
                      <h3 className="font-display text-lg font-bold text-ink group-hover:text-terra transition-colors leading-snug">
                        {r.label}
                      </h3>
                      <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                        {r.note}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-5 border-t border-rule/80">
                    <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">{r.figureLabel}</p>
                    <p className="tnum mt-1 truncate font-display text-2xl font-bold tracking-tight text-ink">
                      {r.figure || "—"}
                    </p>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
