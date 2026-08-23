import { and, asc, eq, gte, lte } from "drizzle-orm";
import { fiscalPeriods } from "../schema/org";
import type { Queryable } from "./queryable";

export type Period = typeof fiscalPeriods.$inferSelect;

export async function findPeriodByDate(
  q: Queryable, orgId: string, dateISO: string,
): Promise<Period | null> {
  const rows = await q
    .select()
    .from(fiscalPeriods)
    .where(and(
      eq(fiscalPeriods.orgId, orgId),
      lte(fiscalPeriods.startsOn, dateISO),
      gte(fiscalPeriods.endsOn, dateISO),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPeriods(q: Queryable, orgId: string): Promise<Period[]> {
  return q.select().from(fiscalPeriods).where(eq(fiscalPeriods.orgId, orgId)).orderBy(asc(fiscalPeriods.name));
}

export async function setPeriodStatus(
  q: Queryable, orgId: string, periodId: string,
  status: "OPEN" | "CLOSED" | "LOCKED",
): Promise<Period> {
  const [row] = await q.update(fiscalPeriods)
    .set({ status })
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.id, periodId)))
    .returning();
  if (!row) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  return row;
}
