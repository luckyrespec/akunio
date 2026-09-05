import { describe, it, expect } from "vitest";
import {
  calculatePphFinal,
  ANNUAL_INDIVIDUAL_THRESHOLD_MINOR,
  type CalculatePphFinalInput,
} from "@/core/tax/pph-final";

describe("PPh Final UMKM Calculation (PP 55/2022)", () => {
  const toMinor = (rp: number) => BigInt(rp) * 100n;

  it("verifies the annual individual threshold constant is Rp 500.000.000", () => {
    expect(ANNUAL_INDIVIDUAL_THRESHOLD_MINOR).toBe(toMinor(500_000_000));
  });

  describe("Wajib Pajak Orang Pribadi (INDIVIDUAL) with Rp 500jt exemption", () => {
    it("returns zero tax when revenue is within threshold", () => {
      const res1 = calculatePphFinal({
        monthlyRevenueMinor: toMinor(100_000_000),
        cumulativePriorRevenueMinor: 0n,
        taxpayerType: "INDIVIDUAL",
      });
      expect(res1.taxableRevenueMinor).toBe(0n);
      expect(res1.exemptRevenueMinor).toBe(toMinor(100_000_000));
      expect(res1.taxDueMinor).toBe(0n);
      expect(res1.cumulativeNewRevenueMinor).toBe(toMinor(100_000_000));
      expect(res1.isExemptLimitReached).toBe(false);

      const res2 = calculatePphFinal({
        monthlyRevenueMinor: toMinor(300_000_000),
        cumulativePriorRevenueMinor: toMinor(100_000_000),
        taxpayerType: "INDIVIDUAL",
      });
      expect(res2.taxableRevenueMinor).toBe(0n);
      expect(res2.exemptRevenueMinor).toBe(toMinor(300_000_000));
      expect(res2.taxDueMinor).toBe(0n);
      expect(res2.cumulativeNewRevenueMinor).toBe(toMinor(400_000_000));
      expect(res2.isExemptLimitReached).toBe(false);
    });

    it("calculates 0.5% only on the portion exceeding Rp 500jt during transition month", () => {
      const res = calculatePphFinal({
        monthlyRevenueMinor: toMinor(200_000_000),
        cumulativePriorRevenueMinor: toMinor(400_000_000),
        taxpayerType: "INDIVIDUAL",
      });
      expect(res.exemptRevenueMinor).toBe(toMinor(100_000_000));
      expect(res.taxableRevenueMinor).toBe(toMinor(100_000_000));
      expect(res.cumulativeNewRevenueMinor).toBe(toMinor(600_000_000));
      expect(res.taxDueMinor).toBe(toMinor(500_000));
      expect(res.isExemptLimitReached).toBe(true);
    });

    it("taxes 0.5% on the entire revenue once Rp 500jt limit is already breached", () => {
      const res = calculatePphFinal({
        monthlyRevenueMinor: toMinor(150_000_000),
        cumulativePriorRevenueMinor: toMinor(600_000_000),
        taxpayerType: "INDIVIDUAL",
      });
      expect(res.exemptRevenueMinor).toBe(0n);
      expect(res.taxableRevenueMinor).toBe(toMinor(150_000_000));
      expect(res.cumulativeNewRevenueMinor).toBe(toMinor(750_000_000));
      expect(res.taxDueMinor).toBe(toMinor(750_000));
      expect(res.isExemptLimitReached).toBe(true);
    });

    it("handles exact boundary when reaching exactly Rp 500jt", () => {
      const res1 = calculatePphFinal({
        monthlyRevenueMinor: toMinor(50_000_000),
        cumulativePriorRevenueMinor: toMinor(450_000_000),
        taxpayerType: "INDIVIDUAL",
      });
      expect(res1.taxableRevenueMinor).toBe(0n);
      expect(res1.exemptRevenueMinor).toBe(toMinor(50_000_000));
      expect(res1.taxDueMinor).toBe(0n);
      expect(res1.cumulativeNewRevenueMinor).toBe(toMinor(500_000_000));
      expect(res1.isExemptLimitReached).toBe(true);

      const res2 = calculatePphFinal({
        monthlyRevenueMinor: toMinor(10_000_000),
        cumulativePriorRevenueMinor: toMinor(500_000_000),
        taxpayerType: "INDIVIDUAL",
      });
      expect(res2.taxableRevenueMinor).toBe(toMinor(10_000_000));
      expect(res2.taxDueMinor).toBe(toMinor(50_000));
    });
  });

  describe("Wajib Pajak Badan (CORPORATE) without 500jt exemption", () => {
    it("taxes 0.5% from the first rupiah regardless of cumulative revenue", () => {
      const res = calculatePphFinal({
        monthlyRevenueMinor: toMinor(100_000_000),
        cumulativePriorRevenueMinor: 0n,
        taxpayerType: "CORPORATE",
      });
      expect(res.exemptRevenueMinor).toBe(0n);
      expect(res.taxableRevenueMinor).toBe(toMinor(100_000_000));
      expect(res.taxDueMinor).toBe(toMinor(500_000));
      expect(res.cumulativeNewRevenueMinor).toBe(toMinor(100_000_000));
      expect(res.isExemptLimitReached).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("handles zero monthly revenue cleanly", () => {
      const res = calculatePphFinal({
        monthlyRevenueMinor: 0n,
        cumulativePriorRevenueMinor: toMinor(200_000_000),
        taxpayerType: "INDIVIDUAL",
      });
      expect(res.taxableRevenueMinor).toBe(0n);
      expect(res.taxDueMinor).toBe(0n);
      expect(res.cumulativeNewRevenueMinor).toBe(toMinor(200_000_000));
    });

    it("treats negative revenue as zero taxable", () => {
      const res = calculatePphFinal({
        monthlyRevenueMinor: -1000n,
        cumulativePriorRevenueMinor: 0n,
        taxpayerType: "INDIVIDUAL",
      });
      expect(res.taxableRevenueMinor).toBe(0n);
      expect(res.taxDueMinor).toBe(0n);
    });
  });
});
