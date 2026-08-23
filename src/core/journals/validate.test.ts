import { describe, it, expect } from "vitest";
import { validateEntry, journalNumber, makeReversal, checkPostingAccounts } from "./validate";
import type { JournalEntryInput } from "./types";

const balanced = (): JournalEntryInput => ({
  dateISO: "2026-01-15",
  memo: "Bayar sewa",
  lines: [
    { accountId: "5300", debitMinor: 5_000_000n, creditMinor: 0n },
    { accountId: "1120", debitMinor: 0n, creditMinor: 5_000_000n },
  ],
});

describe("validateEntry", () => {
  it("accepts a balanced entry in an open period", () => {
    expect(validateEntry(balanced(), "OPEN")).toEqual([]);
  });
  it("rejects unbalanced", () => {
    const e = balanced();
    e.lines[0].debitMinor = 5_000_001n;
    expect(validateEntry(e, "OPEN")).toEqual([
      { code: "UNBALANCED", debitMinor: 5_000_001n, creditMinor: 5_000_000n },
    ]);
  });
  it("rejects single-line and empty-line entries", () => {
    const one = { dateISO: "2026-01-15", memo: "x", lines: [balanced().lines[0]] };
    expect(validateEntry(one, "OPEN")).toEqual([{ code: "MIN_LINES" }]);
    const empty = balanced();
    empty.lines.push({ accountId: "1110", debitMinor: 0n, creditMinor: 0n });
    expect(validateEntry(empty, "OPEN")).toEqual([{ code: "LINE_EMPTY", index: 2 }]);
  });
  it("rejects both-sides line and negatives", () => {
    const e = balanced();
    e.lines[0] = { accountId: "5300", debitMinor: -1n, creditMinor: 2n };
    const issues = validateEntry(e, "OPEN");
    expect(issues).toContainEqual({ code: "NEGATIVE_AMOUNT", index: 0 });
    expect(issues).toContainEqual({ code: "LINE_BOTH_SIDES", index: 0 });
  });
  it("rejects bad dates and closed periods", () => {
    expect(validateEntry({ ...balanced(), dateISO: "2026-13-40" }, "OPEN")).toEqual([{ code: "BAD_DATE" }]);
    expect(validateEntry(balanced(), "CLOSED")).toEqual([{ code: "PERIOD_NOT_OPEN", periodStatus: "CLOSED" }]);
  });
});

describe("checkPostingAccounts", () => {
  const meta = (over: Partial<{ archivedAt: Date | null; hasChildren: boolean }> = {}) =>
    ({ archivedAt: null, hasChildren: false, ...over });
  it("flags unknown, archived, group accounts", () => {
    const byId = new Map([
      ["ok", meta()],
      ["dead", meta({ archivedAt: new Date() })],
      ["grp", meta({ hasChildren: true })],
    ]);
    const lines = [
      { accountId: "nope", debitMinor: 1n, creditMinor: 0n },
      { accountId: "dead", debitMinor: 0n, creditMinor: 1n },
      { accountId: "grp", debitMinor: 1n, creditMinor: 1n }, // both-sides checked elsewhere; still group-flagged
    ];
    expect(checkPostingAccounts(lines as never, byId)).toEqual([
      { code: "UNKNOWN_ACCOUNT", index: 0 },
      { code: "ARCHIVED_ACCOUNT", index: 1 },
      { code: "GROUP_ACCOUNT", index: 2 },
    ]);
  });
});

describe("numbering & reversal", () => {
  it("formats JE numbers padded to 4", () => {
    expect(journalNumber("2026-01", 3)).toBe("JE-2026-0003");
    expect(journalNumber("2026-12", 1234)).toBe("JE-2026-1234");
  });
  it("builds a linked reversal swapping sides", () => {
    const posted = { number: "JE-2026-0007", lines: balanced().lines };
    const rev = makeReversal(posted, "2026-02-01");
    expect(rev.memo).toBe("Balikan JE-2026-0007");
    expect(rev.lines[0]).toEqual({ accountId: "1120", debitMinor: 5_000_000n, creditMinor: 0n });
    expect(rev.lines[1]).toEqual({ accountId: "5300", debitMinor: 0n, creditMinor: 5_000_000n });
  });
});
