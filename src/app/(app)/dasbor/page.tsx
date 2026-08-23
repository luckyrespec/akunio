import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
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

export default async function DasborPage() {
  const ctx = await requireContext();

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const year = now.getFullYear();
  const yearStartISO = `${year}-01-01`;
  const yearEndISO = `${year}-12-31`;

  const data = await db.transaction(async (tx) => {
    const period = await findPeriodByDate(tx, ctx.orgId, todayISO);
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
      <h1 className="font-display text-2xl">Dasbor</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-ink-soft">Periode Berjalan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-xl">{data.period?.name ?? "—"}</p>
            <Badge variant="outline" className="mt-2">{data.period?.status ?? "-"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-ink-soft">Saldo Kas &amp; Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-xl tnum">{Money.fromMinor(cashMinor).formatIdr()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-ink-soft">Laba Tahun Ini</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-xl tnum">{Money.fromMinor(ytd.netIncomeMinor).formatIdr()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 rounded-lg border border-rule bg-paper p-6 text-sm text-ink-soft">
        Asisten AI dan deteksi temuan hadir pada milestone berikutnya (M2–M4).
      </div>
    </section>
  );
}
