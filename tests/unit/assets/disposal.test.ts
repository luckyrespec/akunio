import { describe, it, expect } from "vitest";
import { calculateAssetDisposal } from "@/core/assets/disposal";

describe("Fixed Assets Disposal Engine", () => {
  const assetAccountId = "acc-asset-1510";
  const accumulatedDepAccountId = "acc-dep-1610";
  const depositAccountId = "acc-bank-1120";
  const gainLossAccountId = "acc-gainloss-7110";

  it("calculates disposal with a net gain correctly and balances 4-legged journal lines", () => {
    // Harga perolehan: 10.000.000 (1.000.000.000 sen)
    // Akumulasi depresiasi: 6.000.000 (600.000.000 sen)
    // Nilai buku saat pelepasan: 4.000.000 (400.000.000 sen)
    // Harga jual: 5.000.000 (500.000.000 sen) -> Laba 1.000.000 (100.000.000 sen)
    const result = calculateAssetDisposal({
      acquisitionCostMinor: 1000000000n,
      accumulatedDepreciationMinor: 600000000n,
      proceedsMinor: 500000000n,
      assetAccountId,
      accumulatedDepAccountId,
      depositAccountId,
      gainLossAccountId,
    });

    expect(result.bookValueAtDisposalMinor).toBe(400000000n);
    expect(result.gainLossMinor).toBe(100000000n);
    expect(result.isGain).toBe(true);

    // Verifikasi keseimbangan debet & kredit
    const totalDebit = result.journalLines.reduce((acc, l) => acc + l.debitMinor, 0n);
    const totalCredit = result.journalLines.reduce((acc, l) => acc + l.creditMinor, 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(1100000000n); // 500jt kas + 600jt akum = 1.000jt aset + 100jt laba
  });

  it("calculates disposal with a net loss correctly", () => {
    // Harga perolehan: 10.000.000 (1.000.000.000 sen)
    // Akumulasi: 6.000.000 (600.000.000 sen) -> Nilai buku: 4.000.000 (400.000.000 sen)
    // Harga jual: 3.000.000 (300.000.000 sen) -> Rugi 1.000.000 (-100.000.000 sen)
    const result = calculateAssetDisposal({
      acquisitionCostMinor: 1000000000n,
      accumulatedDepreciationMinor: 600000000n,
      proceedsMinor: 300000000n,
      assetAccountId,
      accumulatedDepAccountId,
      depositAccountId,
      gainLossAccountId,
    });

    expect(result.bookValueAtDisposalMinor).toBe(400000000n);
    expect(result.gainLossMinor).toBe(-100000000n);
    expect(result.isGain).toBe(false);

    const totalDebit = result.journalLines.reduce((acc, l) => acc + l.debitMinor, 0n);
    const totalCredit = result.journalLines.reduce((acc, l) => acc + l.creditMinor, 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalCredit).toBe(1000000000n);
  });

  it("handles scrap / write-off with Rp 0 proceeds", () => {
    // Nilai buku 2.000.000 (200.000.000 sen), dibuang/rusak tanpa nilai jual
    const result = calculateAssetDisposal({
      acquisitionCostMinor: 1000000000n,
      accumulatedDepreciationMinor: 800000000n,
      proceedsMinor: 0n,
      assetAccountId,
      accumulatedDepAccountId,
      gainLossAccountId,
    });

    expect(result.bookValueAtDisposalMinor).toBe(200000000n);
    expect(result.gainLossMinor).toBe(-200000000n);
    expect(result.isGain).toBe(false);

    const totalDebit = result.journalLines.reduce((acc, l) => acc + l.debitMinor, 0n);
    const totalCredit = result.journalLines.reduce((acc, l) => acc + l.creditMinor, 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(1000000000n); // 800jt akum + 200jt rugi = 1000jt aset
  });
});
