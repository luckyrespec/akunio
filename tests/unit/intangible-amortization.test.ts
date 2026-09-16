import { describe, expect, it } from "vitest";
import { calculateAmortizationSchedule } from "@/core/assets/amortization";

describe("calculateAmortizationSchedule", () => {
  it("12000000/12 bulan mulai Jan 2026: 1000000/bulan, sisa pembulatan di bulan terakhir", () => {
    const s = calculateAmortizationSchedule({
      acquisitionCostMinor: 12_000_001_00n,
      usefulLifeMonths: 12,
      inServiceDate: "2026-01-15",
    });
    expect(s).toHaveLength(12);
    expect(s[0].periodName).toBe("2026-01");
    expect(s[0].amortizationDate).toBe("2026-01-31");
    expect(s[11].periodName).toBe("2026-12");
    const total = s.reduce((a, l) => a + l.amortizationAmountMinor, 0n);
    expect(total).toBe(12_000_001_00n);
    expect(s[11].bookValueMinor).toBe(0n);
  });

  it("menolak masa manfaat <= 0", () => {
    expect(() =>
      calculateAmortizationSchedule({
        acquisitionCostMinor: 100n,
        usefulLifeMonths: 0,
        inServiceDate: "2026-01-01",
      }),
    ).toThrow("Masa manfaat");
  });
});
