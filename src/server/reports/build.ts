import { and, desc, eq, gte, lte } from "drizzle-orm";
import { fiscalPeriods } from "@/server/db/schema/org";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import type { Queryable } from "@/server/db/repos/queryable";
import { toMinor } from "@/server/db/repos/journals.repo";
import type { LedgerLine } from "@/core/reports/aggregates";

async function postedLines(
  q: Queryable, orgId: string,
  range?: { from?: string; through?: string },
): Promise<LedgerLine[]> {
  const conds = [
    eq(journalEntries.orgId, orgId),
    eq(journalEntries.status, "POSTED"),
  ];
  if (range?.from) conds.push(gte(journalEntries.entryDate, range.from));
  if (range?.through) conds.push(lte(journalEntries.entryDate, range.through));

  const rows = await q
    .select({
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conds));

  return rows.map((r) => ({
    accountId: r.accountId,
    debitMinor: toMinor(r.debit),
    creditMinor: toMinor(r.credit),
  }));
}

export const postedLinesBetween = (
  q: Queryable, orgId: string, startISO: string, endISO: string,
) => postedLines(q, orgId, { from: startISO, through: endISO });

export const postedLinesThrough = (
  q: Queryable, orgId: string, dateISO: string,
) => postedLines(q, orgId, { through: dateISO });

export async function loadPeriodOrDefault(
  q: Queryable, orgId: string, name?: string,
): Promise<typeof fiscalPeriods.$inferSelect> {
  if (name) {
    const [p] = await q.select().from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, name))).limit(1);
    if (!p) throw new Error("PERIODE_TIDAK_DITEMUKAN");
    return p;
  }

  // Cari periode yang aktif berdasarkan tanggal hari ini (format YYYY-MM-DD)
  const today = new Date().toISOString().slice(0, 10);
  const [current] = await q.select().from(fiscalPeriods)
    .where(and(
      eq(fiscalPeriods.orgId, orgId),
      lte(fiscalPeriods.startsOn, today),
      gte(fiscalPeriods.endsOn, today),
    ))
    .limit(1);
  if (current) return current;

  // Fallback: cari periode dengan transaksi terakhir jika hari ini tidak masuk rentang periode
  const [latestEntry] = await q.select({ date: journalEntries.entryDate })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.status, "POSTED")))
    .orderBy(desc(journalEntries.entryDate))
    .limit(1);
  if (latestEntry?.date) {
    const [entryPeriod] = await q.select().from(fiscalPeriods)
      .where(and(
        eq(fiscalPeriods.orgId, orgId),
        lte(fiscalPeriods.startsOn, latestEntry.date),
        gte(fiscalPeriods.endsOn, latestEntry.date),
      ))
      .limit(1);
    if (entryPeriod) return entryPeriod;
  }

  // Fallback terakhir: periode paling baru
  const [latest] = await q.select().from(fiscalPeriods)
    .where(eq(fiscalPeriods.orgId, orgId)).orderBy(desc(fiscalPeriods.name)).limit(1);
  if (!latest) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  return latest;
}
