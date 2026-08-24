import { describe, it, expect } from "vitest";
import { todayISO } from "./date";

describe("todayISO (Asia/Jakarta)", () => {
  it("returns the WIB calendar date, not UTC", () => {
    // 2026-08-23 00:30 WIB == 2026-08-22 17:30 UTC — must yield the 23rd.
    const real = Date;
    class MockDate extends Date {
      constructor(v?: number | string | Date) { super(v ?? Date.UTC(2026, 7, 22, 17, 30)); }
      static override now() { return Date.UTC(2026, 7, 22, 17, 30); }
    }
    globalThis.Date = MockDate as unknown as typeof Date;
    expect(todayISO()).toBe("2026-08-23");
    globalThis.Date = real;
  });

  it("returns a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
