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
import { Reveal } from "@/components/motion";

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
    return { period, accRows, cashLines, ytdLines };
  });

  const metas = reportMetaMap(data.accRows);

  const cashMinor = aggregateFromLines(data.cashLines, metas)
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  const ytd = incomeStatement(aggregateFromLines(data.ytdLines, metas));

  return (
    <section>
      <Reveal>
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Dasbor</h1>
          <p className="hidden text-xs uppercase tracking-widest text-ink-soft sm:block">Ringkasan keuangan</p>
        </div>
      </Reveal>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Reveal delay={0.06}>
          <div className="matte-card rounded-xl border border-rule bg-paper">
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Periode Berjalan</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight">{data.period?.name ?? "—"}</p>
                <Badge variant="outline" className="mt-2 border-rule bg-canvas text-ink-soft">{data.period?.status ?? "-"}</Badge>
              </CardContent>
            </Card>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="matte-card rounded-xl border border-rule bg-paper">
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Saldo Kas &amp; Bank</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight tnum">{Money.fromMinor(cashMinor).formatIdr()}</p>
                <p className="mt-1 text-xs text-ink-soft">Kumulatif sampai hari ini</p>
              </CardContent>
            </Card>
          </div>
        </Reveal>
        <Reveal delay={0.14}>
          <div className="matte-card rounded-xl border border-rule bg-paper">
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Laba Tahun Ini</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight tnum">{Money.fromMinor(ytd.netIncomeMinor).formatIdr()}</p>
                <p className="mt-1 text-xs text-ink-soft">Januari sampai {year}</p>
              </CardContent>
            </Card>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.18}>
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-rule bg-canvas px-4 py-3.5 text-sm text-ink-soft">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-ink">✦</span>
          <span>Asisten AI dan deteksi temuan hadir pada milestone berikutnya (M2–M4).</span>
        </div>
      </Reveal>
    </section>
  );
}
