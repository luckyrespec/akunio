import type { AccountAggregate } from "@/core/reports/aggregates";
import { signed } from "@/core/reports/aggregates";

export type CashSafetyStatus = "AMAN" | "WASPADA" | "KRITIS";

/** Keputusan 1: aman keluar uang 7 hari ke depan? */
export function decideCashSafety(input: {
  cashMinor: bigint;
  due7Minor: bigint;
  avgDailyExpenseMinor: bigint;
}): { status: CashSafetyStatus; runwayDays: number | null; note: string } {
  const { cashMinor, due7Minor, avgDailyExpenseMinor } = input;
  const afterDue = cashMinor - due7Minor;
  if (afterDue < 0n) {
    return { status: "KRITIS", runwayDays: 0, note: "Kas tidak cukup untuk kewajiban 7 hari ke depan." };
  }
  if (avgDailyExpenseMinor <= 0n) {
    return {
      status: afterDue > 0n ? "AMAN" : "WASPADA",
      runwayDays: null,
      note: "Belum ada pola beban harian — pantau manual.",
    };
  }
  const runwayDays = Number(afterDue / avgDailyExpenseMinor);
  if (runwayDays < 7) {
    return { status: "KRITIS", runwayDays, note: "Runway di bawah 7 hari setelah kewajiban." };
  }
  if (runwayDays < 30) {
    return { status: "WASPADA", runwayDays, note: "Cukup untuk kewajiban, tapi runway di bawah 30 hari." };
  }
  return { status: "AMAN", runwayDays, note: "Cukup untuk kewajiban + runway 30 hari." };
}

/** Filter itemized aging yang jatuh tempo dalam 7 hari ke depan (termasuk overdue). */
export function dueWithinDays<T extends { dueDate: string; daysOverdue: number }>(
  items: readonly T[],
  todayISO: string,
  days = 7,
): T[] {
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  const limit = today + days * 86_400_000;
  return items.filter((i) => {
    const due = Date.parse(`${i.dueDate}T00:00:00Z`);
    return Number.isFinite(due) && due <= limit;
  });
}

/** Keputusan 3: delta MoM dari dua net income. */
export function momDelta(currentMinor: bigint, previousMinor: bigint): {
  deltaMinor: bigint;
  pct: number | null;
  direction: "naik" | "turun" | "sama";
} {
  const deltaMinor = currentMinor - previousMinor;
  const direction = deltaMinor === 0n ? "sama" : deltaMinor > 0n ? "naik" : "turun";
  if (previousMinor === 0n) return { deltaMinor, pct: null, direction };
  const pct = Number((deltaMinor * 10_000n) / (previousMinor < 0n ? -previousMinor : previousMinor)) / 100;
  return { deltaMinor, pct, direction };
}

/** Top-N beban dari agregat (hanya akun BEBAN, saldo positif). */
export function topExpenses(
  aggs: readonly AccountAggregate[],
  n = 3,
): Array<{ code: string; name: string; totalMinor: bigint }> {
  return aggs
    .filter((a) => a.meta.type === "BEBAN")
    .map((a) => ({
      code: a.meta.code,
      name: a.meta.name,
      totalMinor: signed(a.meta, a),
    }))
    .filter((e) => e.totalMinor > 0n)
    .sort((x, y) => (y.totalMinor < x.totalMinor ? -1 : y.totalMinor > x.totalMinor ? 1 : 0))
    .slice(0, n);
}

/** Rata-rata beban harian dari agregat sebulan: total beban / hari berjalan. */
export function avgDailyExpense(
  aggs: readonly AccountAggregate[],
  dayOfMonth: number,
): bigint {
  if (dayOfMonth <= 0) return 0n;
  const total = aggs
    .filter((a) => a.meta.type === "BEBAN")
    .reduce((s, a) => s + signed(a.meta, a), 0n);
  if (total <= 0n) return 0n;
  return total / BigInt(dayOfMonth);
}
