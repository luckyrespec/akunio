import { describe, it, expect } from "vitest";
import { EVAL_CASES } from "@/server/ai/fixtures";
import { DraftEntrySchema } from "@/server/ai/schema";
import { Money } from "@/core/money/money";

// With AI_MOCK=1 the adapter returns fixtures keyed by kind, so this suite
// validates corpus integrity (10 balanced, schema-valid cases) rather than
// live model accuracy. Real-model scoring runs manually with GEMINI_API_KEY.
process.env.AI_MOCK = "1";

describe("eval corpus integrity", () => {
  it("has 10 balanced, schema-valid cases", () => {
    expect(EVAL_CASES.length).toBe(10);
    for (const c of EVAL_CASES) {
      const parsed = DraftEntrySchema.parse(c.expected);
      let debit = Money.zero(), credit = Money.zero();
      for (const l of parsed.lines) {
        debit = debit.add(Money.parseIdr(l.debitText || "0"));
        credit = credit.add(Money.parseIdr(l.creditText || "0"));
      }
      expect(debit.minor).toBe(credit.minor); // setiap kasus seimbang
    }
  });
});
