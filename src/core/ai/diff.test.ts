import { describe, it, expect } from "vitest";
import { diffDraftVsEdited } from "./diff";

const L = (accountCode: string, debitText: string, creditText: string) =>
  ({ accountCode, debitText, creditText });

describe("diffDraftVsEdited", () => {
  it("detects same/changed/added/removed", () => {
    const original = { lines: [L("5900", "500.000", ""), L("1110", "", "500.000")] };
    const edited = [L("5900", "600.000", ""), L("1110", "", "600.000"), L("1400", "66.000", "")];
    const d = diffDraftVsEdited(original, edited);
    expect(d.changed).toBe(2);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(0);
    expect(d.rows[2].state).toBe("ADDED");
  });

  it("marks removed lines", () => {
    const d = diffDraftVsEdited(
      { lines: [L("5900", "1", ""), L("1110", "", "1")] },
      [L("5900", "1", "")],
    );
    expect(d.removed).toBe(1);
    expect(d.rows.find((r) => r.state === "REMOVED")?.accountCode).toBe("1110");
  });
});
