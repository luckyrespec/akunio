import { describe, it, expect } from "vitest";
import { resolveDraftAccounts, similarity } from "./map-accounts";

const accounts = [
  { id: "a1", code: "1110", name: "Kas" },
  { id: "a2", code: "5900", name: "Beban Lain-lain" },
  { id: "a3", code: "5300", name: "Beban Sewa" },
];

describe("similarity", () => {
  it("scores identical strings 1 and disjoint low", () => {
    expect(similarity("beban sewa", "beban sewa")).toBe(1);
    expect(similarity("kas", "xyz")).toBeLessThan(0.3);
  });
});

describe("resolveDraftAccounts", () => {
  it("maps exact codes without warnings", () => {
    const r = resolveDraftAccounts(
      { lines: [{ accountCode: "1110" }, { accountCode: "5900" }] }, accounts);
    expect(r.lines[0].accountId).toBe("a1");
    expect(r.lines[1].accountId).toBe("a2");
    expect(r.warnings).toEqual([]);
    expect(r.lines.every((l) => !l.unresolved)).toBe(true);
  });

  it("marks unknown codes as unresolved with a warning", () => {
    const r = resolveDraftAccounts(
      { lines: [{ accountCode: "53000" }, { accountCode: "1110" }] }, accounts);
    expect(r.lines[0].unresolved).toBe(true);
    expect(r.lines[0].accountId).toBeNull();
    expect(r.warnings.length).toBe(1);
  });

  it("resolves by name similarity when the model returns a name-ish code", () => {
    const r = resolveDraftAccounts(
      { lines: [{ accountCode: "Beban Sewa" }, { accountCode: "1110" }] }, accounts);
    expect(r.lines[0].accountId).toBe("a3");
    expect(r.warnings[0]).toContain("dipilih 5300");
  });
});
