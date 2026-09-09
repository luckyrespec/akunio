import { describe, expect, it } from "vitest";
import { calculateAmortizationSchedule } from "./amortization";

describe("calculateAmortizationSchedule", () => {
  it("12 x 1jt untuk 12jt mulai Jan 2026", () => {
    const s = calculateAmortizationSchedule({ totalMinor: 1200000000n, startDate: "2026-01-15", months: 12 });
    expect(s).toHaveLength(12);
    expect(s[0]).toMatchObject({ periodName: "2026-01", amortDate: "2026-01-31", amountMinor: 100000000n });
    expect(s[11]).toMatchObject({ periodName: "2026-12", amortDate: "2026-12-31" });
    expect(s.reduce((a, x) => a + x.amountMinor, 0n)).toBe(1200000000n);
    expect(s[11].remainingMinor).toBe(0n);
  });
  it("sisa pembulatan jatuh di bulan terakhir", () => {
    const s = calculateAmortizationSchedule({ totalMinor: 10000000n, startDate: "2026-02-01", months: 3 });
    expect(s.map((x) => x.amountMinor)).toEqual([3333333n, 3333333n, 3333334n]);
    expect(s.reduce((a, x) => a + x.amountMinor, 0n)).toBe(10000000n);
  });
  it("months di luar 1-60 ditolak", () => {
    expect(() => calculateAmortizationSchedule({ totalMinor: 100n, startDate: "2026-01-01", months: 0 })).toThrow();
    expect(() => calculateAmortizationSchedule({ totalMinor: 100n, startDate: "2026-01-01", months: 61 })).toThrow();
  });
  it("total nol atau negatif ditolak", () => {
    expect(() => calculateAmortizationSchedule({ totalMinor: 0n, startDate: "2026-01-01", months: 12 })).toThrow();
  });
});
