import { describe, it, expect } from "vitest";
import { invoiceMatchesQuery, parseNominalMinor } from "@/server/search/match";

describe("parseNominalMinor", () => {
  it("mem-parse format Indonesia dan Rp", () => {
    expect(parseNominalMinor("10.000.000")).toBe(1_000_000_000n);
    expect(parseNominalMinor("Rp 250.000")).toBe(25_000_000n);
    expect(parseNominalMinor("250000")).toBe(25_000_000n);
    expect(parseNominalMinor("1,500,000")).toBe(150_000_000n);
  });

  it("menolak bukan nominal murni", () => {
    expect(parseNominalMinor("JE-2026-0001")).toBeNull(); // ada huruf → bukan nominal
    expect(parseNominalMinor("kas")).toBeNull();
    expect(parseNominalMinor("100")).toBeNull(); // terlalu pendek, hindari noise
    expect(parseNominalMinor("10 juta")).toBeNull();
    expect(parseNominalMinor("0")).toBeNull();
  });
});

describe("invoiceMatchesQuery", () => {
  const inv = {
    invoiceNumber: "INV-2026-0007",
    contactName: "Toko Berkah",
    notes: "Termin kedua proyek renovasi",
    totalMinor: 5_000_000_00n,
  };
  it("cocok nomor/kontak/keterangan", () => {
    expect(invoiceMatchesQuery(inv, "0007", null)).toBe(true);
    expect(invoiceMatchesQuery(inv, "berkah", null)).toBe(true);
    expect(invoiceMatchesQuery(inv, "renovasi", null)).toBe(true);
    expect(invoiceMatchesQuery(inv, "tidak ada", null)).toBe(false);
  });
  it("cocok nominal", () => {
    expect(invoiceMatchesQuery(inv, "5000000", 500_000_000n)).toBe(true);
    expect(invoiceMatchesQuery(inv, "999", 999_00n)).toBe(false);
  });
});
