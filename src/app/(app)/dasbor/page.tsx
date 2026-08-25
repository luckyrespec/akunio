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
import { AnimatedNumber, Reveal, Stagger, staggerItem } from "@/components/motion";
import { motion } from "motion/react";
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
    <section>
      <PageHeader title="Dasbor" eyebrow="Ringkasan keuangan" />

      <Stagger className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-6">
        <motion.div variants={staggerItem} className="md:col-span-2">
          <GlowCard>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Periode Berjalan</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight">{data.period?.name ?? "—"}</p>
                <Badge variant="outline" className="mt-2 border-rule bg-canvas text-ink-soft">{data.period?.status ?? "-"}</Badge>
              </CardContent>
            </Card>
          </GlowCard>
        </motion.div>
        <motion.div variants={staggerItem} className="md:col-span-2">
          <GlowCard>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Saldo Kas &amp; Bank</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight tnum">
                  <AnimatedNumber
                    value={Number(cashMinor)}
                    format={(v) => Money.fromMinor(BigInt(Math.round(v))).formatIdr()}
                  />
                </p>
                <p className="mt-1 text-xs text-ink-soft">Kumulatif sampai hari ini</p>
              </CardContent>
            </Card>
          </GlowCard>
        </motion.div>
        <motion.div variants={staggerItem} className="md:col-span-2">
          <GlowCard>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Laba Tahun Ini</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight tnum">
                  <AnimatedNumber
                    value={Number(ytd.netIncomeMinor)}
                    format={(v) => Money.fromMinor(BigInt(Math.round(v))).formatIdr()}
                  />
                </p>
                <p className="mt-1 text-xs text-ink-soft">Januari sampai {year}</p>
              </CardContent>
            </Card>
          </GlowCard>
        </motion.div>
      </Stagger>

      <Reveal delay={0.18}>
        {data.findings.length > 0 ? (
          <div className="matte-card rounded-xl border border-rule bg-paper p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-soft">Temuan terbaru</p>
              <Link href="/temuan" className="text-xs text-terra underline">Lihat semua</Link>
            </div>
            <div className="mt-3 space-y-2">
              {data.findings.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm">
                  <span>{f.type}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${f.severity==="HIGH" ? "bg-terra/10 text-terra" : f.severity==="MEDIUM" ? "bg-amber-50 text-amber-700" : "text-ink-soft"}`}>{f.severity}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-rule bg-canvas px-4 py-3.5 text-sm text-ink-soft">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-ink">✓</span>
            <span>Tidak ada temuan — pembukuan rapi.</span>
          </div>
        )}
      </Reveal>
    </section>
  );
}
