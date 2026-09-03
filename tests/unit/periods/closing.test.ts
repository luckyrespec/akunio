import { describe, it, expect } from "vitest";
import { evaluatePreClosingChecklist } from "@/core/periods/closing-checklist";
import { generateYearEndClosingLines } from "@/core/periods/closing-journal";

describe("Period Closing Engines", () => {
  describe("Pre-closing Checklist Evaluator", () => {
    it("evaluates clean state as ready to close", () => {
      const result = evaluatePreClosingChecklist({
        unreconciledBankSessionsCount: 0,
        pendingDraftsCount: 0,
        unpostedDepreciationAssetsCount: 0,
        unpostedInvoicesCount: 0,
        trialBalanceDiffMinor: 0n,
      });

      expect(result.isReady).toBe(true);
      expect(result.items.bankReconciliation.passed).toBe(true);
      expect(result.items.pendingDrafts.passed).toBe(true);
      expect(result.items.depreciationPosted.passed).toBe(true);
      expect(result.items.unpostedInvoices.passed).toBe(true);
      expect(result.items.trialBalance.passed).toBe(true);
    });

    it("flags blockers when checklist criteria are not met", () => {
      const result = evaluatePreClosingChecklist({
        unreconciledBankSessionsCount: 1,
        pendingDraftsCount: 2,
        unpostedDepreciationAssetsCount: 3,
        unpostedInvoicesCount: 0,
        trialBalanceDiffMinor: 50000n, // Ada selisih Rp 500
      });

      expect(result.isReady).toBe(false);
      expect(result.items.bankReconciliation.passed).toBe(false);
      expect(result.items.pendingDrafts.passed).toBe(false);
      expect(result.items.depreciationPosted.passed).toBe(false);
      expect(result.items.unpostedInvoices.passed).toBe(true);
      expect(result.items.trialBalance.passed).toBe(false);
    });
  });

  describe("Year-End Closing Journal Generator", () => {
    const incomeSummaryAccountId = "acc-3999-ikhtisar";
    const retainedEarningsAccountId = "acc-3200-laba-ditahan";

    it("generates balanced closing lines zeroing out revenues and expenses into retained earnings (Net Profit)", () => {
      // Pendapatan: 50.000.000 (5.000.000.000 sen)
      // Beban: 30.000.000 (3.000.000.000 sen)
      // Laba Bersih = 20.000.000 (2.000.000.000 sen) -> Kredit Laba Ditahan
      const lines = generateYearEndClosingLines({
        revenueBalances: [
          { accountId: "acc-4110", balanceCreditMinor: 4000000000n },
          { accountId: "acc-4210", balanceCreditMinor: 1000000000n },
        ],
        expenseBalances: [
          { accountId: "acc-5110", balanceDebitMinor: 2000000000n },
          { accountId: "acc-6110", balanceDebitMinor: 1000000000n },
        ],
        incomeSummaryAccountId,
        retainedEarningsAccountId,
      });

      // 1. Debet Pendapatan
      const revDebitTotal = lines
        .filter((l) => l.accountId.startsWith("acc-4"))
        .reduce((sum, l) => sum + l.debitMinor, 0n);
      expect(revDebitTotal).toBe(5000000000n);

      // 2. Kredit Beban
      const expCreditTotal = lines
        .filter((l) => l.accountId.startsWith("acc-5") || l.accountId.startsWith("acc-6"))
        .reduce((sum, l) => sum + l.creditMinor, 0n);
      expect(expCreditTotal).toBe(3000000000n);

      // 3. Kredit Laba Ditahan
      const reCredit = lines.find((l) => l.accountId === retainedEarningsAccountId);
      expect(reCredit?.creditMinor).toBe(2000000000n);

      // 4. Keseimbangan total
      const totalDebit = lines.reduce((sum, l) => sum + l.debitMinor, 0n);
      const totalCredit = lines.reduce((sum, l) => sum + l.creditMinor, 0n);
      expect(totalDebit).toBe(totalCredit);
    });

    it("handles Net Loss correctly by debiting retained earnings", () => {
      // Pendapatan: 10jt, Beban: 15jt -> Rugi 5jt (Debit Laba Ditahan)
      const lines = generateYearEndClosingLines({
        revenueBalances: [
          { accountId: "acc-4110", balanceCreditMinor: 1000000000n },
        ],
        expenseBalances: [
          { accountId: "acc-5110", balanceDebitMinor: 1500000000n },
        ],
        incomeSummaryAccountId,
        retainedEarningsAccountId,
      });

      const reDebit = lines.find((l) => l.accountId === retainedEarningsAccountId);
      expect(reDebit?.debitMinor).toBe(500000000n);

      const totalDebit = lines.reduce((sum, l) => sum + l.debitMinor, 0n);
      const totalCredit = lines.reduce((sum, l) => sum + l.creditMinor, 0n);
      expect(totalDebit).toBe(totalCredit);
    });
  });
});
