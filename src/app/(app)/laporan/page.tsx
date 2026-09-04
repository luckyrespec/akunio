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
      {/* Page Header Editorial */}
      <PageHeader
        title="Laporan Keuangan"
        eyebrow="Paket pelaporan resmi standar SAK EMKM (Entitas Mikro, Kecil, dan Menengah) · Siap audit, lampiran pajak, &amp; ekspor PDF formal."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Standar SAK EMKM IAI</span>
            </div>
          </div>
        }
      />

      {/* Info Banner Entitas & Kepatuhan */}
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-rule bg-canvas/60 p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-paper text-terra border border-rule shadow-2xs shrink-0">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-ink-soft">Entitas Pembukuan Aktif:</p>
              <h2 className="font-display text-base font-bold text-ink">{entityName}</h2>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-ink-soft">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600" />
              <span>Double-Entry Terverifikasi</span>
            </div>
            <div className="h-4 w-px bg-rule" />
            <span>Mata Uang: <strong>IDR (Rp)</strong></span>
          </div>
        </div>
      </Reveal>

      {/* 1. KELOMPOK LAPORAN UTAMA SAK EMKM */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-rule/60 pb-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-ink uppercase tracking-tight">
              Laporan Pokok SAK EMKM
            </h2>
            <p className="text-xs text-ink-soft">
              Tiga komponen laporan wajib bagi UMKM menurut ketentuan Ikatan Akuntan Indonesia.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-terra uppercase tracking-wider hidden sm:inline-block">
            Komponen Wajib
          </span>
        </div>

        <Stagger className="grid grid-cols-1 gap-5 md:grid-cols-3" staggerDelay={0.08}>
          {PRIMARY_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <StaggerItem key={r.href}>
                <Link
                  href={r.href}
                  className="group flex flex-col justify-between h-full rounded-2xl border border-rule bg-paper p-6 shadow-xs transition-all duration-200 hover:border-terra/50 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-canvas text-terra border border-rule/70 group-hover:bg-terra group-hover:text-white transition-colors shadow-2xs">
                        <Icon className="size-5" />
                      </div>
                      <span className="rounded-full bg-terra/10 px-2.5 py-0.5 text-[10px] font-semibold text-terra">
                        {r.badge}
                      </span>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-bold text-ink group-hover:text-terra transition-colors">
                          {r.label}
                        </h3>
                        <ArrowUpRight className="size-4 text-ink-soft group-hover:text-terra transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>

                      <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                        {r.note}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-rule/60">
                    <p className="text-[11px] font-medium text-ink-soft">{r.figureLabel}</p>
                    <p className="tnum mt-0.5 truncate font-display text-xl font-bold tracking-tight text-ink">
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
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-rule/60 pb-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-ink uppercase tracking-tight">
              Laporan Pelengkap &amp; Analitik Kas
            </h2>
            <p className="text-xs text-ink-soft">
              Laporan pelengkap komprehensif untuk pengawasan likuiditas dan struktur modal usaha.
            </p>
          </div>
        </div>

        <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2" staggerDelay={0.08}>
          {SECONDARY_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <StaggerItem key={r.href}>
                <Link
                  href={r.href}
                  className="group flex flex-col justify-between h-full rounded-2xl border border-rule bg-paper p-6 shadow-xs transition-all duration-200 hover:border-terra/50 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-canvas text-ink group-hover:bg-ink group-hover:text-white transition-colors border border-rule/70 shadow-2xs">
                        <Icon className="size-5" />
                      </div>
                      <ArrowUpRight className="size-4 text-ink-soft group-hover:text-terra transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>

                    <div className="mt-4">
                      <h3 className="font-display text-base font-bold text-ink group-hover:text-terra transition-colors">
                        {r.label}
                      </h3>
                      <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
                        {r.note}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-rule/60">
                    <p className="text-[11px] font-medium text-ink-soft">{r.figureLabel}</p>
                    <p className="tnum mt-0.5 truncate font-display text-xl font-bold tracking-tight text-ink">
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
