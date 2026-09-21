import { describe, it, expect } from "vitest";
import { maxMinorFromArgs, shouldRequireApproval } from "@/server/ai/controls/approval";
import { DEFAULT_AI_PREFS } from "@/lib/ai-prefs";

const LINES = (d: string) => ({ lines: [{ accountCode: "6210", debitText: d, creditText: "" }, { accountCode: "1110", debitText: "", creditText: d }] });

describe("approval threshold", () => {
  it("tiga format nominal Indonesia terparse ke minor yang sama", () => {
    const a = maxMinorFromArgs("post_journal", LINES("Rp11.100.000"));
    const b = maxMinorFromArgs("post_journal", LINES("11.100.000"));
    const c = maxMinorFromArgs("post_journal", LINES("11100000"));
    expect(a).toBe(1110000000n);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("mutating tanpa allowAll selalu minta approval (smart)", () => {
    expect(shouldRequireApproval("post_journal", LINES("1000"), DEFAULT_AI_PREFS, { hitlPolicy: "smart", allowAllForSession: false })).toBe(true);
  });

  it("over-threshold menang atas allowAllForSession", () => {
    const prefs = { ...DEFAULT_AI_PREFS, approvalThresholdMinor: "100000" };
    expect(shouldRequireApproval("post_journal", LINES("1000000"), prefs, { hitlPolicy: "autonomous", allowAllForSession: true })).toBe(true);
  });

  it("safe tool tidak minta approval", () => {
    expect(shouldRequireApproval("get_report", { type: "neraca" }, DEFAULT_AI_PREFS, { hitlPolicy: "smart", allowAllForSession: false })).toBe(false);
  });
});
