import { describe, it, expect } from "vitest";
import {
  calculateWeightedAverage,
  consumeFifoLayers,
  calculateStockDifference,
} from "@/core/inventory/valuation";
import type { FifoLayer } from "@/core/inventory/types";

describe("Inventory Valuation Engine", () => {
  describe("calculateWeightedAverage", () => {
    it("should accurately calculate moving average with BigInt minor amounts", () => {
      // Current: 10 units @ Rp 10.000 = Rp 100.000
      // Incoming: 10 units @ Rp 12.000 = Rp 120.000
      // Result: 20 units, Total Rp 220.000, Unit Rp 11.000
      const currentQty = 10;
      const currentTotalMinor = 100_000_00n; // 100.000,00 IDR
      const incomingQty = 10;
      const incomingUnitCostMinor = 12_000_00n;

      const result = calculateWeightedAverage(
        currentQty,
        currentTotalMinor,
        incomingQty,
        incomingUnitCostMinor,
      );

      expect(result.newQty).toBe(20);
      expect(result.newTotalCostMinor).toBe(220_000_00n);
      expect(result.newAverageCostMinor).toBe(11_000_00n);
    });

    it("handles zero starting stock correctly", () => {
      const result = calculateWeightedAverage(0, 0n, 5, 50_000_00n);
      expect(result.newQty).toBe(5);
      expect(result.newTotalCostMinor).toBe(250_000_00n);
      expect(result.newAverageCostMinor).toBe(50_000_00n);
    });
  });

  describe("consumeFifoLayers", () => {
    it("consumes oldest layer first and leaves remaining in newer layer", () => {
      const layers: FifoLayer[] = [
        {
          id: "layer-1",
          itemId: "item-1",
          date: "2026-01-01",
          initialQty: 10,
          remainingQty: 10,
          unitCostMinor: 10_000_00n,
          referenceType: "PURCHASE",
        },
        {
          id: "layer-2",
          itemId: "item-1",
          date: "2026-01-05",
          initialQty: 10,
          remainingQty: 10,
          unitCostMinor: 15_000_00n,
          referenceType: "PURCHASE",
        },
      ];

      // Deduct 15 units (10 from layer-1, 5 from layer-2)
      // Cost: (10 * 10.000) + (5 * 15.000) = 100.000 + 75.000 = 175.000
      const { consumedCostMinor, remainingLayers, consumedBreakdown } = consumeFifoLayers(layers, 15);

      expect(consumedCostMinor).toBe(175_000_00n);
      expect(consumedBreakdown).toHaveLength(2);
      expect(consumedBreakdown[0].qtyConsumed).toBe(10);
      expect(consumedBreakdown[1].qtyConsumed).toBe(5);

      expect(remainingLayers).toHaveLength(1);
      expect(remainingLayers[0].id).toBe("layer-2");
      expect(remainingLayers[0].remainingQty).toBe(5);
    });
  });

  describe("calculateStockDifference", () => {
    it("identifies deficit when physical count is lower than system", () => {
      const diff = calculateStockDifference(10, 8, 20_000_00n);
      expect(diff.differenceQty).toBe(-2);
      expect(diff.differenceValueMinor).toBe(-40_000_00n);
      expect(diff.isDeficit).toBe(true);
    });

    it("identifies surplus when physical count is higher than system", () => {
      const diff = calculateStockDifference(10, 13, 20_000_00n);
      expect(diff.differenceQty).toBe(3);
      expect(diff.differenceValueMinor).toBe(60_000_00n);
      expect(diff.isDeficit).toBe(false);
    });
  });
});
