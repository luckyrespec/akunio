import { describe, it, expect } from "vitest";
import { issueToMessage } from "./messages";

describe("issueToMessage", () => {
  it("maps codes to Indonesian messages", () => {
    expect(issueToMessage({ code: "UNBALANCED" })).toContain("tidak seimbang");
    expect(issueToMessage({ code: "LINE_BOTH_SIDES", index: 1 })).toContain("Baris 2");
    expect(issueToMessage({ code: "PERIOD_NOT_OPEN", periodStatus: "LOCKED" })).toContain("terkunci");
    expect(issueToMessage({ code: "MYSTERY" })).toBe("Data jurnal tidak valid.");
  });
});
