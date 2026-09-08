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

export async function createPeriod(
  q: Queryable,
  orgId: string,
  data: { name: string; startsOn: string; endsOn: string; status?: "OPEN" | "CLOSED" | "LOCKED" },
): Promise<Period> {
  const [row] = await q
    .insert(fiscalPeriods)
    .values({
      orgId,
      name: data.name,
      startsOn: data.startsOn,
      endsOn: data.endsOn,
      status: data.status ?? "OPEN",
    })
    .returning();
  return row;
}

export async function updatePeriod(
  q: Queryable,
  orgId: string,
  periodId: string,
  data: { name?: string; startsOn?: string; endsOn?: string; status?: "OPEN" | "CLOSED" | "LOCKED" },
): Promise<Period> {
  const [row] = await q
    .update(fiscalPeriods)
    .set(data)
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.id, periodId)))
    .returning();
  if (!row) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  return row;
}

export async function deletePeriod(
  q: Queryable,
  orgId: string,
  periodId: string,
): Promise<Period> {
  const [row] = await q
    .delete(fiscalPeriods)
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.id, periodId)))
    .returning();
  if (!row) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  return row;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Buat 12 bulan kalender (Januari–Desember) untuk tahun tertentu.
 * Idempoten: bulan yang sudah ada dilewati. Untuk tahun lampau maupun depan.
 */
export async function ensureFiscalYearPeriods(
  q: Queryable,
  orgId: string,
  year: number,
): Promise<{ year: number; created: number }> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("TAHUN_TIDAK_VALID: gunakan tahun 2000–2100");
  }
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const name = `${year}-${pad2(m)}`;
    return {
      orgId,
      name,
      startsOn: `${name}-01`,
      endsOn: `${name}-${pad2(lastDay)}`,
      status: "OPEN" as const,
    };
  });
  let created = 0;
  for (const r of rows) {
    const inserted = await q
      .insert(fiscalPeriods)
      .values(r)
      .onConflictDoNothing({ target: [fiscalPeriods.orgId, fiscalPeriods.name] })
      .returning({ id: fiscalPeriods.id });
    created += inserted.length;
  }
  return { year, created };
}
