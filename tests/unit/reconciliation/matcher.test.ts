import { describe, it, expect } from "vitest";
import {
  matchBankTransactions,
  calculateReconciliationDifference,
  type StatementLineForMatching,
  type JournalLineForMatching,
} from "@/core/reconciliation/matcher";

describe("Reconciliation Matcher Engine", () => {
  it("matches exact transactions (Tier 1) within 3-day window", () => {
    const stmtLines: StatementLineForMatching[] = [
      {
        id: "stmt-1",
        date: "2026-08-10",
        type: "CR", // Bank credit = money in
        amountMinor: 100000000n, // Rp 1.000.000
        description: "TRANSFER PEMBAYARAN",
      },
    ];

    const jLines: JournalLineForMatching[] = [
      {
        id: "j-1",
        date: "2026-08-11",
        debitMinor: 100000000n, // Ledger debit = money in
        creditMinor: 0n,
        memo: "Pelunasan faktur",
      },
    ];

    const result = matchBankTransactions(stmtLines, jLines, [], []);
    expect(result.exactMatches).toHaveLength(1);
    expect(result.exactMatches[0].statementLineId).toBe("stmt-1");
    expect(result.exactMatches[0].journalLineId).toBe("j-1");
    expect(result.exactMatches[0].confidenceScore).toBe(100);
  });

  it("suggests AI matches (Tier 2) when description mentions invoice number", () => {
    const stmtLines: StatementLineForMatching[] = [
      {
        id: "stmt-2",
        date: "2026-08-25",
        type: "CR",
        amountMinor: 55000000n,
        description: "TRSF PELUNASAN INV-2026-0099 BAPAK BUDI",
      },
    ];

    const jLines: JournalLineForMatching[] = [
      {
        id: "j-2",
        date: "2026-08-10", // 15 days earlier
        debitMinor: 55000000n,
        creditMinor: 0n,
        memo: "Penjualan INV-2026-0099",
      },
    ];

    const result = matchBankTransactions(stmtLines, jLines, [{ id: "c1", name: "Bapak Budi" }], [
      { id: "inv-99", invoiceNumber: "INV-2026-0099", contactId: "c1" },
    ]);

    expect(result.aiSuggestions).toHaveLength(1);
    expect(result.aiSuggestions[0].confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.aiSuggestions[0].aiNotes).toContain("INV-2026-0099");
  });

  it("calculates difference correctly", () => {
    const res = calculateReconciliationDifference(1000000000n, 1000000000n);
    expect(res.differenceMinor).toBe(0n);
    expect(res.isBalanced).toBe(true);

    const diffRes = calculateReconciliationDifference(1000000000n, 950000000n);
    expect(diffRes.differenceMinor).toBe(50000000n);
    expect(diffRes.isBalanced).toBe(false);
  });
});
