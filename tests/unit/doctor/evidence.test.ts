import { describe, it, expect } from "vitest";
import { resolveEvidenceAmounts } from "@/core/doctor/evidence";

describe("resolveEvidenceAmounts", () => {
  it("reads amountMinor + entryId + code", () => {
    expect(resolveEvidenceAmounts({ amountMinor: "10000000", entryId: "e1", code: "1110" }))
      .toEqual({ amountMinor: 10000000n, entryIds: ["e1"], codes: ["1110"] });
  });
  it("accepts amount/curTot aliases", () => {
    expect(resolveEvidenceAmounts({ curTot: "5000" }).amountMinor).toBe(5000n);
  });
  it("throws on null, non-object, and non-numeric amount", () => {
    expect(() => resolveEvidenceAmounts(null)).toThrow("EVIDENCE_TIDAK_VALID");
    expect(() => resolveEvidenceAmounts("x")).toThrow("EVIDENCE_TIDAK_VALID");
    expect(() => resolveEvidenceAmounts({ amountMinor: "abc" })).toThrow("EVIDENCE_TIDAK_VALID");
  });
});
