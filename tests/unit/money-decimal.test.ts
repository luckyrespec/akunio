import { describe, it, expect } from "vitest";
import { parseDecimalToMinor } from "@/core/money/money";

describe("parseDecimalToMinor", () => {
  it("1.005 ditolak (tak bisa diwakili 2 desimal)", () => {
    expect(parseDecimalToMinor("1.005")).toBeNull();
  });
  it("100.5 tepat 10050n", () => {
    expect(parseDecimalToMinor("100.5")).toBe(10_050n);
  });
  it("menolak minus, kosong, dan non-angka", () => {
    expect(parseDecimalToMinor("-5")).toBeNull();
    expect(parseDecimalToMinor("")).toBeNull();
    expect(parseDecimalToMinor("abc")).toBeNull();
  });
  it("menerima number bulat dari AI", () => {
    expect(parseDecimalToMinor(75000)).toBe(7_500_000n);
  });
});
