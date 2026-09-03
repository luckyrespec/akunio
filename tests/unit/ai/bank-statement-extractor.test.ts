import { describe, it, expect } from "vitest";
import {
  BankStatementExtractSchema,
  parseExtractedStatementData,
} from "@/server/ai/bank-statement-extractor";

describe("Bank Statement Extractor", () => {
  it("validates and normalizes extracted json response correctly", () => {
    const raw = {
      bankName: "Bank Central Asia (BCA)",
      accountNumber: "1234567890",
      statementPeriod: {
        from: "2026-08-01",
        to: "2026-08-31",
      },
      openingBalance: 10000000,
      closingBalance: 15000000,
      transactions: [
        {
          date: "2026-08-05",
          description: "TRSF E-BANKING CR DARI PT MAJU",
          type: "CR",
          amount: 5000000,
          referenceNumber: "TRF-001",
        },
        {
          date: "2026-08-31",
          description: "BIAYA ADM BULANAN",
          type: "DB",
          amount: 15000,
        },
      ],
    };

    const parsed = parseExtractedStatementData(raw);
    expect(parsed.bankName).toBe("Bank Central Asia (BCA)");
    expect(parsed.closingBalanceMinor).toBe(1500000000n);
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0].amountMinor).toBe(500000000n);
    expect(parsed.transactions[0].type).toBe("CR");
    expect(parsed.transactions[1].amountMinor).toBe(1500000n);
    expect(parsed.transactions[1].type).toBe("DB");
  });
});
