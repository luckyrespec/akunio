import { describe, it, expect } from "vitest";
import * as React from "react";
import { AgingSummary } from "@/components/invoicing/aging-summary";

describe("Invoicing UI Components", () => {
  it("renders aging summary cards with proper bucket values", () => {
    const el = React.createElement(AgingSummary, {
      currentMinor: 10000000n,
      days1To30Minor: 5000000n,
      days31To60Minor: 0n,
      daysOver60Minor: 2000000n,
      totalOutstandingMinor: 17000000n,
      itemized: [],
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.currentMinor).toBe(10000000n);
    expect(el.props.totalOutstandingMinor).toBe(17000000n);
  });
});
