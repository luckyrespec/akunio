import { describe, it, expect } from "vitest";
import {
  decideCashSafety,
  dueWithinDays,
  momDelta,
  topExpenses,
  avgDailyExpense,
} from "@/core/dasbor/decisions";
import type { AccountAggregate } from "@/core/reports/aggregates";

function agg(
  code: string,
  name: string,
  type: "BEBAN" | "PENDAPATAN" | "ASET",
  debitMinor: bigint,
  creditMinor: bigint,
): AccountAggregate {
  return {
    meta: { id: code, code, name, type: type as never, normal: "D" as never },
    debitMinor,
    creditMinor,
  };
}

describe("decideCashSafety", () => {
  it("KRITIS bila kas tidak cukup untuk kewajiban 7 hari", () => {
    const r = decideCashSafety({ cashMinor: 1_000_000n, due7Minor: 2_000_000n, avgDailyExpenseMinor: 100_000n });
    expect(r.status).toBe("KRITIS");
  });
  it("AMAN bila runway >= 30 hari", () => {
    const r = decideCashSafety({ cashMinor: 10_000_000n, due7Minor: 1_000_000n, avgDailyExpenseMinor: 100_000n });
    expect(r.status).toBe("AMAN");
    expect(r.runwayDays).toBe(90);
  });
  it("WASPADA bila runway 7-30 hari", () => {
    const r = decideCashSafety({ cashMinor: 2_000_000n, due7Minor: 500_000n, avgDailyExpenseMinor: 100_000n });
    expect(r.status).toBe("WASPADA");
    expect(r.runwayDays).toBe(15);
  });
  it("tanpa pola beban tetap jawab AMAN/WASPADA, runway null", () => {
    const r = decideCashSafety({ cashMinor: 5_000_000n, due7Minor: 0n, avgDailyExpenseMinor: 0n });
    expect(r.runwayDays).toBeNull();
  });
});

describe("dueWithinDays", () => {
  it("menyertakan overdue + jatuh tempo <= 7 hari, mengecualikan yang jauh", () => {
    const items = [
      { dueDate: "2026-08-20", daysOverdue: 12 },
      { dueDate: "2026-09-05", daysOverdue: 0 },
      { dueDate: "2026-09-30", daysOverdue: 0 },
    ];
    const hit = dueWithinDays(items, "2026-09-01", 7);
    expect(hit).toHaveLength(2);
  });
});

describe("momDelta", () => {
  it("naik dengan pct benar, previous 0 -> pct null", () => {
    expect(momDelta(3_000_000n, 2_000_000n)).toMatchObject({ direction: "naik", pct: 50 });
    expect(momDelta(1_000_000n, 0n).pct).toBeNull();
    expect(momDelta(1_000_000n, 1_000_000n).direction).toBe("sama");
  });
});

describe("topExpenses + avgDailyExpense", () => {
  it("hanya BEBAN positif, urut desc, maks 3", () => {
    const aggs = [
      agg("5500", "Transport", "BEBAN", 500_000n, 0n),
      agg("5200", "Gaji", "BEBAN", 5_000_000n, 0n),
      agg("4100", "Pendapatan", "PENDAPATAN", 0n, 9_000_000n),
      agg("5900", "Lain", "BEBAN", 0n, 0n),
    ];
    const top = topExpenses(aggs, 3);
    expect(top.map((t) => t.code)).toEqual(["5200", "5500"]);
  });
  it("avg harian = total beban / tanggal", () => {
    const aggs = [agg("5200", "Gaji", "BEBAN", 3_000_000n, 0n)];
    expect(avgDailyExpense(aggs, 10)).toBe(300_000n);
    expect(avgDailyExpense(aggs, 0)).toBe(0n);
  });
});
