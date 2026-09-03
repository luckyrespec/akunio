import { describe, it, expect } from "vitest";
import {
  calculateInvoiceTotals,
  determineInvoiceStatus,
  calculateItemTotal,
} from "@/core/invoicing/calculations";

describe("Invoice Calculations", () => {
  it("calculates single item total with discount and tax rate", () => {
    // 5 units @ Rp 10.000 (1_000_000n) = 5.000.000n
    // discount 500.000n -> 4.500.000n
    // tax 11% -> 495.000n
    // item total -> 4.995.000n
    const res = calculateItemTotal(5, 1000000n, 500000n, 11);
    expect(res.subtotalMinor).toBe(5000000n);
    expect(res.discountMinor).toBe(500000n);
    expect(res.netSubtotalMinor).toBe(4500000n);
    expect(res.taxMinor).toBe(495000n);
    expect(res.totalMinor).toBe(4995000n);
  });

  it("calculates invoice totals across multiple items", () => {
    const items = [
      {
        quantity: 2,
        unitPriceMinor: 10000000n, // Rp 100.000
        discountMinor: 1000000n,  // Rp 10.000
        taxRatePercent: 11,
      },
      {
        quantity: 1,
        unitPriceMinor: 5000000n,  // Rp 50.000
        discountMinor: 0n,
        taxRatePercent: 0,
      },
    ];
    // Item 1: net 190.000 (19_000_000n), tax 11% = 20.900 (2_090_000n)
    // Item 2: net 50.000 (5_000_000n), tax 0% = 0n
    // Global subtotal: 24_000_000n
    // Total tax: 2_090_000n
    // Total: 26_090_000n
    const result = calculateInvoiceTotals(items, 0n);
    expect(result.subtotalMinor).toBe(25000000n);
    expect(result.discountMinor).toBe(1000000n);
    expect(result.taxMinor).toBe(2090000n);
    expect(result.totalMinor).toBe(26090000n);
  });

  it("determines status correctly based on paid amount and due date", () => {
    const now = new Date("2026-09-10");
    // Fully paid
    expect(determineInvoiceStatus(10000n, 10000n, "2026-09-01", now)).toBe("PAID");
    // Partially paid and not yet due
    expect(determineInvoiceStatus(10000n, 4000n, "2026-09-15", now)).toBe("PARTIALLY_PAID");
    // Partially paid but overdue
    expect(determineInvoiceStatus(10000n, 4000n, "2026-09-05", now)).toBe("PARTIALLY_PAID");
    // Unpaid and not yet due
    expect(determineInvoiceStatus(10000n, 0n, "2026-09-15", now)).toBe("ISSUED");
    // Unpaid and overdue
    expect(determineInvoiceStatus(10000n, 0n, "2026-09-05", now)).toBe("OVERDUE");
  });
});
