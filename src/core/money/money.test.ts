import { describe, it, expect } from "vitest";
import { Money, MoneyError } from "./money";

describe("Money", () => {
  it("parses plain rupiah", () => {
    expect(Money.parseIdr("1250000").minor).toBe(125000000n);
  });
  it("parses grouped rupiah with Rp prefix", () => {
    expect(Money.parseIdr("Rp 1.250.000").minor).toBe(125000000n);
  });
  it("parses sen with comma", () => {
    expect(Money.parseIdr("1250000,5").minor).toBe(125000050n);
    expect(Money.parseIdr("0,99").minor).toBe(99n);
  });
  it("rejects garbage and >2 decimals", () => {
    expect(() => Money.parseIdr("abc")).toThrow(MoneyError);
    expect(() => Money.parseIdr("1,234")).toThrow(MoneyError);
  });
  it("formats IDR", () => {
    expect(Money.fromMinor(125000000n).formatIdr()).toBe("Rp1.250.000");
    expect(Money.fromMinor(50n).formatIdr()).toBe("Rp0,50");
    expect(Money.fromMinor(-200000n).formatIdr()).toBe("-Rp2.000");
  });
  it("adds, subtracts, compares", () => {
    const a = Money.parseIdr("1000"), b = Money.parseIdr("250");
    expect(a.sub(b).formatIdr()).toBe("Rp750");
    expect(a.add(b.negate()).cmp(a)).toBe(-1);
    expect(b.scaleBy(4).formatIdr()).toBe("Rp1.000");
  });
});
