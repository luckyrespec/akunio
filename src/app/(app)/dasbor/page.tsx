import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { todayISO } from "@/lib/date";
import { db } from "@/server/db";
import { accounts, organizations } from "@/server/db/schema/org";
import { findPeriodByDate } from "@/server/db/repos/periods.repo";
import { evaluatePeriodReadiness } from "@/server/db/repos/periods-closing.repo";
import { getYearEndPromptState } from "@/core/periods/year-end";
import { YearEndReminder } from "@/components/dasbor/year-end-reminder";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { postedLinesBetween, postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { Money } from "@/core/money/money";
import { listDrafts } from "@/server/db/repos/drafts.repo";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { getAgingReportRepo } from "@/server/db/repos/invoices.repo";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { AkunioBriefingCard } from "@/components/dasbor/akunio-briefing-card";
import { DecisionStrip } from "@/components/dasbor/decision-strip";
import { avgDailyExpense, decideCashSafety, dueWithinDays, momDelta, topExpenses } from "@/core/dasbor/decisions";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Inbox,
  Receipt,
  Wallet,
} from "lucide-react";
import { IconReview } from "@/components/icons";
import Link from "next/link";

const MONTH_FMT = new Intl.DateTimeFormat("id-ID", { month: "short" });

function monthWindow(year: number, monthIdx: number) {
  const start = `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const end = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default async function DasborPage() {
  const ctx = await requireContext();

  const now = new Date();
  const today = todayISO();
  const year = now.getFullYear();
  const yearStartISO = `${year}-01-01`;
  const yearEndISO = `${year}-12-31`;

  const data = await db.transaction(async (tx) => {
    const period = await findPeriodByDate(tx, ctx.orgId, today);
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const cashLines = await postedLinesThrough(tx, ctx.orgId, yearEndISO);
    const ytdLines = await postedLinesBetween(tx, ctx.orgId, yearStartISO, yearEndISO);
    let findings: Array<{ id: string; type: string; severity: string }> = [];
    try {
      const { listFindings } = await import("@/server/db/repos/findings.repo");
      findings = (await listFindings(tx, ctx.orgId, "open")) as never;
    } catch {}
    return { period, accRows, cashLines, ytdLines, findings };
  });

  const metas = reportMetaMap(data.accRows);

  const cashMinor = aggregateFromLines(data.cashLines, metas)
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  const ytd = incomeStatement(aggregateFromLines(data.ytdLines, metas));

  // Laba bersih 6 bulan terakhir (bulan berjalan + 5 sebelumnya), semua dari jurnal POSTED.
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(year, now.getMonth() - (5 - k), 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: MONTH_FMT.format(d) };
  });
  const monthlyNet: bigint[] = await Promise.all(
    months.map(async ({ y, m }) => {
      const { start, end } = monthWindow(y, m);
      const lines = await postedLinesBetween(db, ctx.orgId, start, end);
      return incomeStatement(aggregateFromLines(lines, metas)).netIncomeMinor;
    }),
  );

  const [drafts, recent, agingAR, agingAP] = await Promise.all([
    listDrafts(db, ctx.orgId),
    listEntriesWithLines(db, ctx.orgId, 5),
    getAgingReportRepo(db, ctx.orgId, "INVOICE"),
    getAgingReportRepo(db, ctx.orgId, "BILL"),
  ]);

  const pendingDrafts = drafts.filter((d) => d.status === "PENDING");
  const overdueAR = agingAR.itemized.filter((i) => i.daysOverdue > 0);
  const overdueAP = agingAP.itemized.filter((i) => i.daysOverdue > 0);
  const overdueARMinor = overdueAR.reduce((s, i) => s + i.outstandingMinor, 0n);
  const overdueAPMinor = overdueAP.reduce((s, i) => s + i.outstandingMinor, 0n);

  // Pengingat tutup tahun: hanya dihitung saat Desember kalender.
  let yearEnd: {
    year: number;
    periodName: string;
    showBanner: boolean;
    showModal: boolean;
    isReady: boolean;
    blockers: string[];
  } | null = null;
  if (now.getMonth() === 11) {
    const decPeriod = await findPeriodByDate(db, ctx.orgId, `${year}-12-15`);
    const [orgRow] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    const dismissed = ((orgRow?.settings ?? {}) as Record<string, unknown>).dismissedYearEnd;
    const st = getYearEndPromptState({
      todayISO: today,
      decPeriodStatus: (decPeriod?.status as "OPEN" | "CLOSED" | "LOCKED" | undefined) ?? null,
      dismissedPeriod: typeof dismissed === "string" ? dismissed : null,
    });
    if (st.showBanner || st.showModal) {
      const readiness = await evaluatePeriodReadiness(db, ctx.orgId, st.periodName);
      yearEnd = {
        year: st.year,
        periodName: st.periodName,
        showBanner: st.showBanner,
        showModal: st.showModal,
        isReady: readiness.isReady,
        blockers: Object.values(readiness.items)
          .filter((i) => !i.passed)
          .map((i) => i.title),
      };
    }
  }
  // --- Lapisan keputusan (semua dari repo/tool yang sudah ada, tanpa RAG) ---
  const curMonth = months[5];
  const { start: curStart, end: curEnd } = monthWindow(curMonth.y, curMonth.m);
  const curMonthLines = await postedLinesBetween(db, ctx.orgId, curStart, curEnd);
  const curAggs = aggregateFromLines(curMonthLines, metas);
  const topBeban = topExpenses(curAggs, 3);
  const avgDaily = avgDailyExpense(curAggs, now.getDate());

  const apDue7 = dueWithinDays(agingAP.itemized, today, 7);
  const apDue7Minor = apDue7.reduce((s, i) => s + i.outstandingMinor, 0n);
  const safety = decideCashSafety({ cashMinor, due7Minor: apDue7Minor, avgDailyExpenseMinor: avgDaily });

  const sortedOverdueAR = [...overdueAR].sort((a, b) =>
    a.outstandingMinor < b.outstandingMinor ? 1 : a.outstandingMinor > b.outstandingMinor ? -1 : 0,
  );
  const topAR = sortedOverdueAR[0];

  const curNet = monthlyNet[5] ?? 0n;
  const prevNet = monthlyNet[4] ?? 0n;
  const mom = momDelta(curNet, prevNet);
  const prevLabel = months[4]?.label ?? "bln lalu";

  const urgentSentence = pendingDrafts.length > 0
    ? `${pendingDrafts.length} draf menunggu review sebelum posting.`
    : data.findings.length > 0
      ? `${data.findings.length} temuan pembukuan terbuka perlu ditindaklanjuti.`
      : overdueAR.length > 0
        ? `${overdueAR.length} piutang jatuh tempo senilai ${Money.fromMinor(overdueARMinor).formatIdr()} — tagih ${topAR ? `${topAR.contactName} (${topAR.invoiceNumber})` : "sekarang"}.`
        : overdueAP.length > 0
          ? `${overdueAP.length} utang jatuh tempo senilai ${Money.fromMinor(overdueAPMinor).formatIdr()}.`
          : "Semua beres — tidak ada draf, temuan, atau tunggakan.";

  const briefingSentences = [
    apDue7.length > 0
      ? `Kas & bank ${Money.fromMinor(cashMinor).formatIdr()} — ${safety.status === "AMAN" ? "aman" : safety.status === "WASPADA" ? "waspada" : "kritis"} untuk kewajiban 7 hari ${Money.fromMinor(apDue7Minor).formatIdr()}.`
      : `Kas & bank ${Money.fromMinor(cashMinor).formatIdr()} — tanpa kewajiban 7 hari ke depan.`,
    urgentSentence,
    `Laba ${curMonth.label} ${Money.fromMinor(curNet).formatIdr()}, ${mom.direction === "sama" ? `stabil vs ${prevLabel}` : `${mom.direction} ${mom.pct !== null ? `${mom.pct > 0 ? "+" : ""}${mom.pct}% ` : ""}vs ${prevLabel}`}.`,
  ];
  const assistantSummary =
    `Dasbor ${year}: Kas ${Money.fromMinor(cashMinor).formatIdr()}, Laba YTD ${Money.fromMinor(ytd.netIncomeMinor).formatIdr()}, ` +
    `Laba ${curMonth.label} ${Money.fromMinor(curNet).formatIdr()} (${mom.direction}${mom.pct !== null ? ` ${mom.pct}%` : ""} vs ${prevLabel}), ` +
    `${pendingDrafts.length} draf, ${data.findings.length} temuan, ${overdueAR.length} piutang overdue, ${overdueAP.length} utang overdue.`;

  const daysLeft = data.period
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(`${data.period.endsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
        ),
      )
    : null;

  const maxAbs = monthlyNet.reduce((m, v) => {
    const a = v < 0n ? -v : v;
    return a > m ? a : m;
  }, 0n);
  const hasTrend = maxAbs > 0n;

  const tasks = [
    pendingDrafts.length > 0 && {
      icon: IconReview,
      tint: "bg-terra/10 text-terra",
      title: `${pendingDrafts.length} draf menunggu review`,
      desc: "Periksa akun sebelum posting ke buku besar.",
      href: "/jurnal?tab=draf",
      cta: "Tinjau",
    },
    data.findings.length > 0 && {
      icon: AlertCircle,
      tint: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      title: `${data.findings.length} temuan terbuka`,
      desc: "Anomali pembukuan perlu ditindaklanjuti.",
      href: "/temuan",
      cta: "Lihat",
    },
    overdueAR.length > 0 && {
      icon: Receipt,
      tint: "bg-debit/10 text-debit",
      title: `Piutang jatuh tempo ${Money.fromMinor(overdueARMinor).formatIdr()}`,
      desc: `${overdueAR.length} faktur lewat jatuh tempo.`,
      href: "/faktur",
      cta: "Tagih",
    },
    overdueAP.length > 0 && {
      icon: Wallet,
      tint: "bg-credit/10 text-credit",
      title: `Utang jatuh tempo ${Money.fromMinor(overdueAPMinor).formatIdr()}`,
      desc: `${overdueAP.length} tagihan lewat jatuh tempo.`,
      href: "/faktur",
      cta: "Bayar",
    },
  ].filter(Boolean) as Array<{
    icon: typeof FileText;
    tint: string;
    title: string;
    desc: string;
    href: string;
    cta: string;
  }>;

  return (
    <section className="space-y-8">
      <PageHeader
        title="Dasbor"
        eyebrow={`Ringkasan keuangan tahun berjalan (${year})`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/jurnal/baru" className="inline-flex items-center justify-center rounded-lg bg-terra px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-terra/90 transition-colors">
              + Tulis Jurnal
            </Link>
            <Link href="/asisten" className="inline-flex items-center justify-center rounded-lg border border-rule bg-paper px-3.5 py-2 text-xs font-medium text-ink shadow-xs hover:bg-canvas transition-colors">
              Buka Asisten
            </Link>
          </div>
        }
      />

      {yearEnd && (yearEnd.showBanner || yearEnd.showModal) && (
        <YearEndReminder
          year={yearEnd.year}
          periodName={yearEnd.periodName}
          showBanner={yearEnd.showBanner}
          showModal={yearEnd.showModal}
          isReady={yearEnd.isReady}
          blockers={yearEnd.blockers}
        />
      )}

      {/* Zona aksi: briefing AKUNIO memimpin, strip keputusan menyusul — rapat */}
      <div className="space-y-4">
      {/* AKUNIO briefing — selalu kelihatan, chat on-click via widget */}
      <Reveal>
        <AkunioBriefingCard sentences={briefingSentences} assistantSummary={assistantSummary} />
      </Reveal>

      {/* Strip 3 keputusan 10-detik */}
      <Reveal>
        <DecisionStrip
          cash={{
            status: safety.status,
            runwayDays: safety.runwayDays,
            note: safety.note,
            cashText: Money.fromMinor(cashMinor).formatIdr(),
            due7Text: Money.fromMinor(apDue7Minor).formatIdr(),
            due7Count: apDue7.length,
          }}
          collect={{
            topOverdueText: topAR ? Money.fromMinor(topAR.outstandingMinor).formatIdr() : "",
            overdueCount: overdueAR.length,
            topName: topAR ? `${topAR.contactName} · ${topAR.invoiceNumber}` : "",
            href: "/faktur",
          }}
          health={{
            direction: mom.direction,
            pct: mom.pct,
            curText: Money.fromMinor(curNet).formatIdr(),
            prevLabel,
          }}
        />
      </Reveal>
      </div>

      {/* Zona bukti: panel posisi & denyut — instrumen utama, bukan kartu metrik */}
      <Reveal>
        <div className="matte-card grid gap-6 rounded-2xl border border-rule bg-paper p-5 sm:p-7 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Saldo Kas &amp; Bank
            </p>
            <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink tnum md:text-5xl">
              {Money.fromMinor(cashMinor).formatIdr()}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Posisi kumulatif sampai hari ini</p>

            <div className="rule-double mt-5 flex items-baseline justify-between gap-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Laba bersih tahun berjalan
              </span>
              <span className="tnum truncate font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
                {Money.fromMinor(ytd.netIncomeMinor).formatIdr()}
              </span>
            </div>

            {topBeban.length > 0 && (
              <div className="mt-4" data-testid="dasbor-top-beban">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Top beban · {curMonth.label}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {topBeban.map((t) => (
                    <li key={t.code} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-ink">
                        <span className="mr-1.5 font-mono text-[11px] font-bold text-ink-soft">{t.code}</span>
                        {t.name}
                      </span>
                      <span className="tnum shrink-0 font-semibold text-ink">
                        {Money.fromMinor(t.totalMinor).formatIdr()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-terra" />
                Periode {data.period?.name ?? "—"}
                {daysLeft !== null && (
                  <span className="font-semibold text-ink">· {daysLeft} hari tersisa</span>
                )}
              </span>
              <Link href="/tutup-buku" className="inline-flex items-center gap-1 font-medium text-terra hover:underline">
                Tutup buku <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>

          <div className="min-w-0 lg:border-l lg:border-rule/70 lg:pl-10">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Laba bersih · 6 bulan
              </p>
              <span className="text-[11px] text-ink-soft">dari jurnal POSTED</span>
            </div>
            <div className="mt-3 flex h-40 items-stretch gap-2" role="img" aria-label={`Tren laba bersih enam bulan terakhir: ${months.map((m, i) => `${m.label} ${Money.fromMinor(monthlyNet[i]).formatIdr()}`).join(", ")}`}>
              <span className="sr-only">
                {months.map((m, i) => (
                  <span key={`${m.y}-${m.m}`}>
                    {m.label}: {Money.fromMinor(monthlyNet[i]).formatIdr()}.{" "}
                  </span>
                ))}
              </span>
              {months.map((m, i) => {
                const v = monthlyNet[i];
                const pct = hasTrend ? Number((v < 0n ? -v : v) * 100n / maxAbs) : 0;
                const positive = v >= 0n;
                return (
                  <div key={`${m.y}-${m.m}`} className="flex min-w-0 flex-1 flex-col items-center">
                    <div className="flex w-full flex-1 flex-col justify-end">
                      {hasTrend && positive && (
                        <div
                          title={`${m.label}: ${Money.fromMinor(v).formatIdr()}`}
                          className="w-full rounded-t-md bg-debit/80"
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      )}
                    </div>
                    <div className="h-px w-full bg-ink/25" />
                    <div className="flex w-full flex-1 flex-col justify-start">
                      {hasTrend && !positive && (
                        <div
                          title={`${m.label}: ${Money.fromMinor(v).formatIdr()}`}
                          className="w-full rounded-b-md bg-credit/80"
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      )}
                      {!hasTrend && <div className="mx-auto mt-1 size-1 rounded-full bg-rule" />}
                    </div>
                    <span className="mt-1.5 text-[11px] font-medium text-ink-soft">{m.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">
              {hasTrend
                ? "Hijau di atas garis berarti surplus bulan itu."
                : "Belum ada laba/rugi tercatat enam bulan terakhir."}
            </p>
          </div>
        </div>
      </Reveal>

      <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Perlu perhatian */}
        <StaggerItem>
          <div className="flex h-full flex-col rounded-2xl border border-rule bg-paper p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink">Perlu Perhatian</h2>
              {tasks.length > 0 && (
                <span className="rounded-full bg-terra/10 px-2 py-0.5 text-[11px] font-bold text-terra">
                  {tasks.length}
                </span>
              )}
            </div>
            {tasks.length > 0 ? (
              <ul className="mt-4 flex-1 space-y-1">
                {tasks.map((t) => (
                  <li key={t.title}>
                    <Link
                      href={t.href}
                      className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-canvas"
                    >
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${t.tint}`}>
                        <t.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-ink">{t.title}</span>
                        <span className="block truncate text-[11px] text-ink-soft">{t.desc}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-terra">
                        {t.cta}
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 flex flex-1 items-center gap-3 rounded-xl bg-canvas/60 px-4 py-5 text-xs text-ink-soft">
                <CheckCircle2 className="size-5 shrink-0 text-debit" />
                <span>Semua beres — tidak ada draf, temuan, atau tagihan jatuh tempo.</span>
              </div>
            )}
          </div>
        </StaggerItem>

        {/* Aktivitas terakhir */}
        <StaggerItem className="lg:col-span-2">
          <div className="flex h-full flex-col rounded-2xl border border-rule bg-paper p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink">Aktivitas Terakhir</h2>
              <Link href="/jurnal" className="inline-flex items-center gap-1 text-xs font-medium text-terra hover:underline">
                Semua jurnal <ArrowRight className="size-3" />
              </Link>
            </div>
            {recent.length > 0 ? (
              <ul className="mt-2 flex-1 divide-y divide-rule/60">
                {recent.map((r) => {
                  const total = r.lines.reduce((s, l) => s + l.debitMinor, 0n);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <span className="hidden font-mono text-[11px] font-bold text-ink-soft sm:inline">
                        {r.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">
                          {r.memo || r.number}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-soft">
                          {r.entryDate}
                          {r.reversalOfId ? " · pembalik" : ""}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-xs font-semibold text-ink">
                        {Money.fromMinor(total).formatIdr()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-4 flex flex-1 items-center gap-3 rounded-xl bg-canvas/60 px-4 py-5 text-xs text-ink-soft">
                <Inbox className="size-5 shrink-0 text-ink-soft/60" />
                <span>Belum ada transaksi tercatat. Tulis jurnal manual atau minta Asisten menyusun draf.</span>
              </div>
            )}
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
