import { describe, it, expect } from "vitest";
import {
  buildDuplicateCorrection,
  buildAbnormalCorrection,
  buildMissingReceiptCorrection,
  buildOddDateCorrection,
  buildRatioSummary,
} from "@/server/doctor/builders";

describe("correction builders", () => {
  it("duplicate mirrors lines and links reversal", () => {
    const f = buildDuplicateCorrection({
      id: "e1", memo: "Beli ATK",
      lines: [
        { accountCode: "5100", debitMinor: 15000000n, creditMinor: 0n },
        { accountCode: "1110", debitMinor: 0n, creditMinor: 15000000n },
      ],
    });
    expect(f.reversalOfId).toBe("e1");
    const d = f.lines.reduce((s, l) => s + l.debitMinor, 0n);
    const c = f.lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(d).toBe(c);
    expect(d).toBe(15000000n);
    expect(f.lines[0]).toMatchObject({ accountCode: "5100", debitMinor: 0n, creditMinor: 15000000n });
  });

  it("abnormal reclasses the exact abnormal amount", () => {
    const f = buildAbnormalCorrection("1110", 2500000n, "D");
    const d = f.lines.reduce((s, l) => s + l.debitMinor, 0n);
    expect(d).toBe(2500000n);
    expect(f.lines.some((l) => l.accountCode === "1110")).toBe(true);
  });

  it("missing receipt parks the exact amount in the suspense account", () => {
    const f = buildMissingReceiptCorrection(100000000n, "1600");
    const d = f.lines.reduce((s, l) => s + l.debitMinor, 0n);
    const c = f.lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(d).toBe(c);
    expect(d).toBe(100000000n);
    expect(f.lines.some((l) => l.accountCode === "1600")).toBe(true);
    expect(f.strategy).toBe("RECLASS");
    expect(f.reversalOfId).toBeNull();
  });

  it("missing receipt throws without a suspense code", () => {
    expect(() => buildMissingReceiptCorrection(100000000n, "")).toThrow("AKUN_PENAMPUNG_TIDAK_ADA");
    expect(() => buildMissingReceiptCorrection(100000000n, "   ")).toThrow("AKUN_PENAMPUNG_TIDAK_ADA");
  });

  it("odd date produces a cutoff frame with a period-move memo", () => {
    const f = buildOddDateCorrection(
      { id: "e9", number: "JE-2026-0042", entryDate: "2026-08-31" },
      { startsOn: "2026-09-01", endsOn: "2026-09-30" },
    );
    expect(f.strategy).toBe("CUTOFF");
    expect(f.lines).toHaveLength(0);
    expect(f.reversalOfId).toBeNull();
    expect(f.memo).toContain("JE-2026-0042");
    expect(f.memo).toContain("2026-09-01");
  });

  it("ratio anomaly produces a summary-only frame", () => {
    const f = buildRatioSummary({ curTotMinor: 5000000000n, avgMinor: 1000000000n, topCodes: ["5100", "1110"] });
    expect(f.strategy).toBe("SUMMARY_ONLY");
    expect(f.lines).toHaveLength(0);
    expect(f.reversalOfId).toBeNull();
  });
});
