import { describe, it, expect } from "vitest";
import {
  applyLedgerFilters,
  activeLedgerFilterCount,
  defaultLedgerFilter,
  type LedgerFilterState,
  type SerialLedgerRow,
} from "@/app/(app)/buku-besar/[id]/ledger-filter-sheet";

const ROWS: SerialLedgerRow[] = [
  { number: "JE-2026-0001", entryDate: "2026-09-01", memo: "Setoran modal awal", debitMinor: "10000000000", creditMinor: "0", balanceMinor: "10000000000" },
  { number: "JE-2026-0002", entryDate: "2026-09-03", memo: "Beli biji kopi", debitMinor: "0", creditMinor: "610000000", balanceMinor: "9390000000" },
  { number: "JE-2026-0003", entryDate: "2026-09-05", memo: "Beli susu dan gula", debitMinor: "0", creditMinor: "369600000", balanceMinor: "9020400000" },
];

const base: LedgerFilterState = defaultLedgerFilter();

describe("applyLedgerFilters", () => {
  it("default meloloskan semua", () => {
    expect(applyLedgerFilters(ROWS, base)).toHaveLength(3);
  });
  it("memo cocok nomor atau keterangan, tak peka huruf", () => {
    expect(applyLedgerFilters(ROWS, { ...base, memo: "KOPI" }).map((r) => r.number)).toEqual([
      "JE-2026-0002",
    ]);
    expect(applyLedgerFilters(ROWS, { ...base, memo: "je-2026-000" })).toHaveLength(3);
  });
  it("sisi debit saja / kredit saja", () => {
    expect(applyLedgerFilters(ROWS, { ...base, sisi: "debit" }).map((r) => r.number)).toEqual([
      "JE-2026-0001",
    ]);
    expect(applyLedgerFilters(ROWS, { ...base, sisi: "kredit" })).toHaveLength(2);
  });
  it("nominal min–maks pada nilai mutasi", () => {
    const res = applyLedgerFilters(ROWS, { ...base, minNominal: "100000000", maxNominal: "1000000000" });
    expect(res.map((r) => r.number)).toEqual(["JE-2026-0002", "JE-2026-0003"]);
  });
  it("kombinasi memo + sisi", () => {
    expect(
      applyLedgerFilters(ROWS, { ...base, memo: "beli", sisi: "debit" }),
    ).toHaveLength(0);
  });
});

describe("activeLedgerFilterCount", () => {
  it("default nol", () => {
    expect(activeLedgerFilterCount(base)).toBe(0);
  });
  it("periode, memo, sisi, nominal masing-masing satu grup", () => {
    expect(activeLedgerFilterCount({ ...base, preset: "bulan-ini" })).toBe(1);
    expect(activeLedgerFilterCount({ ...base, dari: "2026-09-01", sampai: "2026-09-30" })).toBe(1);
    expect(activeLedgerFilterCount({ ...base, memo: "kopi" })).toBe(1);
    expect(activeLedgerFilterCount({ ...base, sisi: "debit" })).toBe(1);
    expect(activeLedgerFilterCount({ ...base, minNominal: "1" })).toBe(1);
    expect(
      activeLedgerFilterCount({ ...base, memo: "x", sisi: "kredit", minNominal: "1", maxNominal: "2" }),
    ).toBe(3);
  });
});
