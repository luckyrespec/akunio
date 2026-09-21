import { describe, it, expect } from "vitest";
import { validateJournalLines } from "@/server/ai/controls/validation";

const LEAF_ACCOUNTS = [
  { code: "6210", parentCode: null, archivedAt: null },
  { code: "1110", parentCode: null, archivedAt: null },
];

const OPEN_CTX = { accounts: LEAF_ACCOUNTS, periodStatus: "OPEN", periodName: "Sep 2026" };

describe("validateJournalLines", () => {
  it("lines seimbang dan valid → ok", () => {
    const r = validateJournalLines(
      [
        { accountCode: "6210", debitText: "10000", creditText: "" },
        { accountCode: "1110", debitText: "", creditText: "10000" },
      ],
      OPEN_CTX,
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("debit != kredit → errors non-empty", () => {
    const r = validateJournalLines(
      [
        { accountCode: "6210", debitText: "10000", creditText: "" },
        { accountCode: "1110", debitText: "", creditText: "9000" },
      ],
      OPEN_CTX,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("akun GROUP ditolak", () => {
    const r = validateJournalLines(
      [
        { accountCode: "4100", debitText: "", creditText: "10000" },
        { accountCode: "1110", debitText: "10000", creditText: "" },
      ],
      {
        accounts: [
          { code: "4100", parentCode: null, archivedAt: null },
          { code: "4110", parentCode: "4100", archivedAt: null },
          { code: "1110", parentCode: null, archivedAt: null },
        ],
        periodStatus: "OPEN",
        periodName: "Sep 2026",
      },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("GROUP"))).toBe(true);
  });

  it("periode CLOSED ditolak dengan nama periode", () => {
    const r = validateJournalLines(
      [
        { accountCode: "6210", debitText: "10000", creditText: "" },
        { accountCode: "1110", debitText: "", creditText: "10000" },
      ],
      { accounts: LEAF_ACCOUNTS, periodStatus: "CLOSED", periodName: "Sep 2026" },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("Sep 2026"))).toBe(true);
  });
});
