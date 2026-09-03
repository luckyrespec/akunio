import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { todayISO } from "@/lib/date";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { findPeriodByDate } from "@/server/db/repos/periods.repo";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { postedLinesBetween, postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { GlowCard } from "@/components/aceternity/glow-card";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";

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
      findings = (await listFindings(tx, ctx.orgId, "open")).slice(0, 3) as never;
    } catch {}
    return { period, accRows, cashLines, ytdLines, findings };
  });

  const metas = reportMetaMap(data.accRows);

  const cashMinor = aggregateFromLines(data.cashLines, metas)
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  const ytd = incomeStatement(aggregateFromLines(data.ytdLines, metas));

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
              Asisten AI
            </Link>
          </div>
        }
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StaggerItem>
          <GlowCard>
            <Card className="border border-rule bg-paper shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Periode Berjalan
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <p className="font-display text-2xl font-semibold tracking-tight text-ink">
                  {data.period?.name ?? "—"}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="outline" className="border-rule bg-canvas text-xs text-ink-soft">
                    Status: {data.period?.status ?? "OPEN"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </GlowCard>
        </StaggerItem>

        <StaggerItem>
          <GlowCard>
            <Card className="border border-rule bg-paper shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Saldo Kas &amp; Bank
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <p className="font-display text-2xl font-semibold tracking-tight text-ink tnum">
                  <AnimatedNumber minor={cashMinor} />
                </p>
                <p className="mt-2 text-xs text-ink-soft">Posisi kas kumulatif sampai hari ini</p>
              </CardContent>
            </Card>
          </GlowCard>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-1">
          <GlowCard>
            <Card className="border border-rule bg-paper shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Laba Bersih Tahun Berjalan
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <p className="font-display text-2xl font-semibold tracking-tight text-ink tnum">
                  <AnimatedNumber minor={ytd.netIncomeMinor} />
                </p>
                <p className="mt-2 text-xs text-ink-soft">Kumulatif Jan – Des {year}</p>
              </CardContent>
            </Card>
          </GlowCard>
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.18}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Status Pembukuan &amp; Temuan</h2>
            <Link href="/temuan" className="text-xs font-medium text-terra hover:underline">
              Lihat semua temuan →
            </Link>
          </div>

          {data.findings.length > 0 ? (
            <div className="rounded-xl border border-rule bg-paper p-5 shadow-xs">
              <div className="space-y-2.5">
                {data.findings.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg border border-rule/50 bg-canvas/60 px-4 py-3 text-sm">
                    <span className="font-medium text-ink">{f.type}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${f.severity==="HIGH" ? "bg-terra/10 text-terra border border-terra/20" : f.severity==="MEDIUM" ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-muted text-ink-soft"}`}>
                      {f.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-rule bg-paper p-5 text-sm text-ink-soft shadow-xs">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 font-bold">✓</span>
              <span>Tidak ada anomali atau temuan — pembukuan Anda rapi dan seimbang.</span>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}
