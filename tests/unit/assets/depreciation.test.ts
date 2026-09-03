import { describe, it, expect } from "vitest";
import {
  calculateDepreciationSchedule,
  type DepreciationScheduleItem,
} from "@/core/assets/depreciation";

describe("Fixed Assets Depreciation Engine", () => {
  it("calculates straight-line depreciation correctly with zero salvage value", () => {
    // Biaya perolehan 12.000.000 (1.200.000.000 sen), masa manfaat 12 bulan
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: 1200000000n,
      salvageValueMinor: 0n,
      usefulLifeMonths: 12,
      inServiceDate: "2026-01-15",
      method: "STRAIGHT_LINE",
    });

    expect(schedule).toHaveLength(12);
    expect(schedule[0].periodName).toBe("2026-01");
    expect(schedule[0].depreciationAmountMinor).toBe(100000000n); // 1.000.000 / bln
    expect(schedule[0].accumulatedDepreciationMinor).toBe(100000000n);
    expect(schedule[0].bookValueMinor).toBe(1100000000n);

    // Bulan terakhir
    const last = schedule[11];
    expect(last.periodName).toBe("2026-12");
    expect(last.accumulatedDepreciationMinor).toBe(1200000000n);
    expect(last.bookValueMinor).toBe(0n);
  });

  it("handles penny rounding on the final month accurately for uneven divisions", () => {
    // 10.000.000 (1.000.000.000 sen) dibagi 3 bulan -> 333.333.333 + 333.333.333 + 333.333.334
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: 1000000000n,
      salvageValueMinor: 0n,
      usefulLifeMonths: 3,
      inServiceDate: "2026-01-01",
      method: "STRAIGHT_LINE",
    });

    expect(schedule).toHaveLength(3);
    expect(schedule[0].depreciationAmountMinor).toBe(333333333n);
    expect(schedule[1].depreciationAmountMinor).toBe(333333333n);
    expect(schedule[2].depreciationAmountMinor).toBe(333333334n);
    expect(schedule[2].accumulatedDepreciationMinor).toBe(1000000000n);
    expect(schedule[2].bookValueMinor).toBe(0n);
  });

  it("respects salvage value in straight-line depreciation", () => {
    // 10.000.000 (1.000.000.000 sen), residu 1.000.000 (100.000.000 sen), 9 bulan
    // Basis susut = 900.000.000 sen / 9 = 100.000.000 sen / bln
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: 1000000000n,
      salvageValueMinor: 100000000n,
      usefulLifeMonths: 9,
      inServiceDate: "2026-01-01",
      method: "STRAIGHT_LINE",
    });

    expect(schedule).toHaveLength(9);
    expect(schedule[0].depreciationAmountMinor).toBe(100000000n);
    const last = schedule[8];
    expect(last.accumulatedDepreciationMinor).toBe(900000000n);
    expect(last.bookValueMinor).toBe(100000000n); // Sisa sama persis dengan salvage value
  });

  it("calculates declining balance depreciation and clamps at salvage value", () => {
    // 10.000.000 (1.000.000.000 sen), 4 tahun (48 bulan), declining rate 50% tahunan (50/12 % per bln)
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: 1000000000n,
      salvageValueMinor: 50000000n, // Residu 500.000 (50.000.000 sen)
      usefulLifeMonths: 48,
      inServiceDate: "2026-01-10",
      method: "DECLINING_BALANCE",
      decliningRatePercent: 50,
    });

    expect(schedule).toHaveLength(48);
    // Bulan pertama beban lebih besar dari straight line
    expect(schedule[0].depreciationAmountMinor).toBeGreaterThan(20833333n);

    // Pastikan nilai buku di bulan manapun tidak pernah di bawah salvage value
    for (const item of schedule) {
      expect(item.bookValueMinor).toBeGreaterThanOrEqual(50000000n);
    }
  });
});
