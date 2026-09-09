import { describe, it, expect } from "vitest";
import { aggregateFromLines, type LedgerLine, type ReportAccountMeta } from "./aggregates";
import { buildSakEmkmBalanceSheet, buildSakEmkmIncomeStatement } from "./sak-emkm";

const M = (id: string, code: string, name: string, type: ReportAccountMeta["type"], normal: "D" | "K"): ReportAccountMeta =>
  ({ id, code, name, type, normal });

const METAS: Map<string, ReportAccountMeta> = new Map([
  ["kas", M("kas", "1110", "Kas", "ASET", "D")],
  ["bank", M("bank", "1120", "Bank", "ASET", "D")],
  ["piutang", M("piutang", "1200", "Piutang Usaha", "ASET", "D")],
  ["persediaan", M("persediaan", "1300", "Persediaan Barang", "ASET", "D")],
  ["dimuka", M("dimuka", "1600", "Sewa Dibayar di Muka", "ASET", "D")],
  ["peralatan", M("peralatan", "1500", "Peralatan Usaha", "ASET", "D")],
  ["utang", M("utang", "2100", "Utang Usaha", "LIABILITAS", "K")],
  ["utang_bank", M("utang_bank", "2400", "Utang Bank Jangka Panjang", "LIABILITAS", "K")],
  ["modal", M("modal", "3100", "Modal Disetor", "EKUITAS", "K")],
  ["pendapatan", M("pendapatan", "4100", "Penjualan Barang Dagang", "PENDAPATAN", "K")],
  ["pendapatan_bunga", M("pendapatan_bunga", "4200", "Pendapatan Bunga Bank", "PENDAPATAN", "K")],
  ["hpp", M("hpp", "5100", "Beban Pokok Penjualan", "BEBAN", "D")],
  ["gaji", M("gaji", "5200", "Beban Gaji Karyawan", "BEBAN", "D")],
  ["pajak", M("pajak", "5700", "Beban PPh Final UMKM", "BEBAN", "D")],
]);

const L = (accountId: string, debitMinor: bigint, creditMinor: bigint): LedgerLine =>
  ({ accountId, debitMinor, creditMinor });

const JT = 1_000_000n;

describe("SAK EMKM Financial Statements Aggregations", () => {
  it("structures income statement with multi-level gross, operating, and net income", () => {
    const lines: LedgerLine[] = [
      L("kas", 100n * JT, 0n), L("pendapatan", 0n, 100n * JT), // Omset 100jt
      L("hpp", 60n * JT, 0n), L("persediaan", 0n, 60n * JT), // HPP 60jt -> Laba Kotor 40jt
      L("gaji", 15n * JT, 0n), L("kas", 0n, 15n * JT), // Beban Operasional 15jt -> Laba Operasi 25jt
      L("kas", 2n * JT, 0n), L("pendapatan_bunga", 0n, 2n * JT), // Pendapatan Lain 2jt
      L("pajak", 500_000n, 0n), L("kas", 0n, 500_000n), // Beban Pajak 0.5jt
    ];

    const aggs = aggregateFromLines(lines, METAS);
    const is = buildSakEmkmIncomeStatement(aggs);

    expect(is.totalRevenueMinor).toBe(100n * JT);
    expect(is.totalCogsMinor).toBe(60n * JT);
    expect(is.grossProfitMinor).toBe(40n * JT);
    expect(is.totalOperatingExpenseMinor).toBe(15n * JT);
    expect(is.operatingIncomeMinor).toBe(25n * JT);
    expect(is.totalOtherRevenueMinor).toBe(2n * JT);
    expect(is.totalTaxExpenseMinor).toBe(500_000n);
    expect(is.netIncomeMinor).toBe(26_500_000n); // 25jt + 2jt - 0.5jt
  });

  it("structures balance sheet into current and fixed assets, and checks balance", () => {
    const lines: LedgerLine[] = [
      L("kas", 30n * JT, 0n), L("modal", 0n, 30n * JT), // Modal 30jt
      L("peralatan", 20n * JT, 0n), L("utang_bank", 0n, 20n * JT), // Utang bank 20jt, Peralatan 20jt
      L("piutang", 10n * JT, 0n), L("pendapatan", 0n, 10n * JT), // Piutang 10jt, Pendapatan 10jt
    ];

    const aggs = aggregateFromLines(lines, METAS);
    const is = buildSakEmkmIncomeStatement(aggs);
    const bs = buildSakEmkmBalanceSheet(aggs, is.netIncomeMinor);

    expect(bs.totalCurrentAssetsMinor).toBe(40n * JT); // Kas 30jt + Piutang 10jt
    expect(bs.totalFixedAssetsMinor).toBe(20n * JT); // Peralatan 20jt
    expect(bs.totalAssetsMinor).toBe(60n * JT);

    expect(bs.totalShortTermLiabilitiesMinor).toBe(0n);
    expect(bs.totalLongTermLiabilitiesMinor).toBe(20n * JT); // Utang Bank 20jt
    expect(bs.totalLiabilitiesMinor).toBe(20n * JT);

    expect(bs.totalEquityMinor).toBe(40n * JT); // Modal 30jt + Laba Berjalan 10jt
    expect(bs.totalLiabilitiesAndEquityMinor).toBe(60n * JT);
    expect(bs.isBalanced).toBe(true);
  });

  it("menggolongkan 1600 sewa dibayar di muka sebagai aset lancar", () => {
    const lines: LedgerLine[] = [
      L("kas", 18n * JT, 0n), L("modal", 0n, 18n * JT),
      L("dimuka", 12n * JT, 0n), L("kas", 0n, 12n * JT), // Bayar sewa 12jt di muka
    ];
    const aggs = aggregateFromLines(lines, METAS);
    const is = buildSakEmkmIncomeStatement(aggs);
    const bs = buildSakEmkmBalanceSheet(aggs, is.netIncomeMinor);
    expect(bs.currentAssetRows.map((r) => r.code)).toContain("1600");
    expect(bs.fixedAssetRows.map((r) => r.code)).not.toContain("1600");
    expect(bs.totalCurrentAssetsMinor).toBe(18n * JT); // Kas 6jt + Dimuka 12jt
  });
});
