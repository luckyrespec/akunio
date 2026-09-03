import { describe, it, expect } from "vitest";
import {
  coaForBusinessType,
  validateCoaDefs,
  inferAccountType,
  suggestAccountCode,
} from "@/core/accounts/coa-templates";
import { COA_TEMPLATE } from "@/core/accounts/coa-template";
import { BUSINESS_TYPES } from "@/core/accounts/business-types";

describe("coa templates", () => {
  it("every business type validates and preserves the base template", () => {
    for (const t of BUSINESS_TYPES) {
      const defs = coaForBusinessType(t);
      expect(defs.length).toBeGreaterThan(COA_TEMPLATE.length);
      expect(validateCoaDefs(defs)).toEqual([]);
      const codes = new Set(defs.map((d) => d.code));
      for (const base of COA_TEMPLATE) expect(codes.has(base.code)).toBe(true);
    }
  });

  it("kuliner template has bahan baku and delivery commission accounts", () => {
    const names = coaForBusinessType("KULINER").map((d) => d.name);
    expect(names).toContain("Persediaan Bahan Baku");
    expect(names).toContain("Beban Komisi Delivery");
  });

  it("infers account type from Indonesian names", () => {
    expect(inferAccountType("Beban Iklan")).toBe("BEBAN");
    expect(inferAccountType("Pendapatan Sewa")).toBe("PENDAPATAN");
    expect(inferAccountType("Kas Kecil")).toBe("ASET");
    expect(inferAccountType("Utang Supplier")).toBe("LIABILITAS");
    expect(inferAccountType("Modal Awal")).toBe("EKUITAS");
    expect(inferAccountType("Xyz Tak Jelas")).toBeNull();
  });

  it("suggests the smallest free code in the type range", () => {
    const defs = coaForBusinessType("JASA");
    const code = suggestAccountCode(defs, "BEBAN");
    expect(code).toMatch(/^5\d{3}$/);
    expect(defs.some((d) => d.code === code)).toBe(false);
  });
});
