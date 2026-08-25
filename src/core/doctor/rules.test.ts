import { describe, it, expect } from "vitest";
import { abnormalBalances, duplicates } from "./rules";
describe("abnormalBalances", () => {
  it("flags ASET with credit balance as HIGH", () => {
    const aggs = [{ meta: { code: "1110", type: "ASET", normal: "D" }, debitMinor: 0n, creditMinor: 500000n }] as never;
    expect(abnormalBalances(aggs)[0].severity).toBe("HIGH");
  });
});
describe("duplicates", () => {
  it("flags duplicate memo+lines", () => {
    const e = { memo: "x", lines: [{ accountCode: "1110" }] };
    expect(duplicates([e, e]).length).toBe(1);
  });
});
