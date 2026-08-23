import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { aggregateFromLines, signed, type LedgerLine, type ReportAccountMeta } from "./aggregates";
import {
  trialBalance, incomeStatement, balanceSheet,
  cashFlowIndirect, changesInEquity, UnbalancedSheetError,
} from "./statements";

const M = (id: string, code: string, name: string, type: ReportAccountMeta["type"], normal: "D" | "K"): ReportAccountMeta =>
  ({ id, code, name, type, normal });

const METAS: Map<string, ReportAccountMeta> = new Map([
  ["kas", M("kas", "1120", "Bank", "ASET", "D")],
  ["piutang", M("piutang", "1200", "Piutang Usaha", "ASET", "D")],
  ["peralatan", M("peralatan", "1500", "Peralatan", "ASET", "D")],
  ["utang", M("utang", "2100", "Utang Usaha", "LIABILITAS", "K")],
  ["modal", M("modal", "3100", "Modal Disetor", "EKUITAS", "K")],
  ["pendapatan", M("pendapatan", "4100", "Pendapatan Usaha", "PENDAPATAN", "K")],
  ["gaji", M("gaji", "5200", "Beban Gaji", "BEBAN", "D")],
]);

const L = (accountId: string, debitMinor: bigint, creditMinor: bigint): LedgerLine =>
  ({ accountId, debitMinor, creditMinor });

const JT = 1_000_000n;
const SCENARIO: LedgerLine[] = [
  L("kas", 10n * JT, 0n), L("modal", 0n, 10n * JT),          // setoran modal
  L("peralatan", 5n * JT, 0n), L("kas", 0n, 5n * JT),        // beli peralatan
  L("kas", 6n * JT, 0n), L("pendapatan", 0n, 6n * JT),       // pendapatan kas
  L("piutang", 2n * JT, 0n), L("pendapatan", 0n, 2n * JT),   // pendapatan kredit
  L("gaji", 3n * JT, 0n), L("kas", 0n, 3n * JT),             // beban gaji
];

function agg() {
  return aggregateFromLines(SCENARIO, METAS);
}

describe("golden fixture", () => {
  it("trial balance balances at 26jt per side", () => {
    const tb = trialBalance(agg());
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebitMinor).toBe(26n * JT);
    expect(tb.totalCreditMinor).toBe(26n * JT);
  });
  it("laba rugi: pendapatan 8jt, beban 3jt, laba bersih 5jt", () => {
    const isx = incomeStatement(agg());
    expect(isx.revenueTotalMinor).toBe(8n * JT);
    expect(isx.expenseTotalMinor).toBe(3n * JT);
    expect(isx.netIncomeMinor).toBe(5n * JT);
  });
  it("neraca seimbang 15jt aset", () => {
    const bs = balanceSheet(agg(), 5n * JT);
    expect(bs.totalAssetsMinor).toBe(15n * JT);
    expect(bs.totalLiabilitiesMinor).toBe(0n);
    expect(bs.baseEquityMinor).toBe(10n * JT);
    expect(bs.totalEquityAndLiabilitiesMinor).toBe(15n * JT);
    expect(bs.balanced).toBe(true);
  });
  it("neraca melempar bila tidak seimbang", () => {
    expect(() => balanceSheet(agg(), 99n * JT)).toThrow(UnbalancedSheetError);
  });
  it("arus kas indirect", () => {
    const cf = cashFlowIndirect({
      netIncomeMinor: 5n * JT,
      deltaPiutangMinor: 2n * JT,
      deltaPersediaanMinor: 0n,
      deltaUtangUsahaMinor: 0n,
      depreciationMinor: 0n,
      investingMinor: -(5n * JT),
      financingMinor: 10n * JT,
    });
    expect(cf.operatingMinor).toBe(3n * JT);      // 5 - 2
    expect(cf.netChangeMinor).toBe(8n * JT);      // 3 - 5 + 10 ties to real ΔKas +8jt
  });
  it("perubahan ekuitas", () => {
    const ce = changesInEquity({
      openingRetainedEarningsMinor: 0n,
      contributionsMinor: 10n * JT,
      drawingsMinor: 0n,
      netIncomeMinor: 5n * JT,
    });
    expect(ce.closingRetainedEarningsMinor).toBe(5n * JT);
    expect(ce.rows.map((r) => r.label)).toContain("Modal Disetor");
    expect(ce.rows.map((r) => r.label)).toContain("Laba Tahun Berjalan");
  });
});

describe("property: balanced batches keep books balanced", () => {
  const amountGen = fc.bigInt({ min: 1n, max: 100_000n });
  const metaArb = fc.constantFrom(...[...METAS.values()]);

  it("identity A − L − E == NI always holds", () => {
    fc.assert(fc.property(
      fc.array(fc.record({ a: metaArb, b: metaArb, amt: amountGen }), { minLength: 1, maxLength: 50 }),
      (pairs) => {
        const lines: LedgerLine[] = [];
        for (const p of pairs) {
          if (p.a.id === p.b.id || p.a.normal === p.b.normal) continue;
          const [dr, cr] = p.a.normal === "D" ? [p.a, p.b] : [p.b, p.a];
          lines.push(L(dr.id, p.amt, 0n), L(cr.id, 0n, p.amt));
        }
        if (lines.length === 0) return;
        const ags = aggregateFromLines(lines, METAS);
        const sumSigned = (pred: (m: ReportAccountMeta) => boolean) =>
          ags.filter((x) => pred(x.meta)).reduce((acc, x) => acc + signed(x.meta, x), 0n);
        const assets = sumSigned((m) => m.type === "ASET");
        const liab = sumSigned((m) => m.type === "LIABILITAS");
        const eq = sumSigned((m) => m.type === "EKUITAS");
        const rev = sumSigned((m) => m.type === "PENDAPATAN");
        const exp = sumSigned((m) => m.type === "BEBAN");
        expect(assets - liab - eq).toBe(rev - exp);
      },
    ), { numRuns: 200 });
  });
});
