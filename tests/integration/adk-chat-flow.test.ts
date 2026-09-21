import { describe, it, expect } from "vitest";
import { maxMinorFromArgs, shouldRequireApproval } from "@/server/ai/controls/approval";
import { routeIntent } from "@/server/ai/agents/router";
import { DEFAULT_AI_PREFS } from "@/lib/ai-prefs";

// Fase-1 ADK chat flow: wiring murni tanpa network/DB.
// - Approval gate menentukan kapan SSE tool_approval_request dikirim.
// - Router menentukan sub-agent awal untuk InMemoryRunner.
// - Estimator menentukan kapan over-threshold menang atas allowAll.
// E2E browser SKIP di task ini (butuh branch + e2e env khusus).
describe("adk chat flow wiring", () => {
  it('shouldRequireApproval("post_journal", ...) true untuk mutating tanpa allowAll', () => {
    const args = {
      lines: [
        { accountCode: "6210", debitText: "100000", creditText: "" },
        { accountCode: "1110", debitText: "", creditText: "100000" },
      ],
    };
    expect(
      shouldRequireApproval("post_journal", args, DEFAULT_AI_PREFS, {
        hitlPolicy: "smart",
        allowAllForSession: false,
      }),
    ).toBe(true);
  });

  it('routeIntent: "catat bayar sewa" → bookkeeping, "kenapa laba turun" → analyst', () => {
    expect(routeIntent("catat bayar sewa")).toBe("bookkeeping");
    expect(routeIntent("kenapa laba turun")).toBe("analyst");
  });

  it('estimator port: maxMinorFromArgs("record_cash_entry", {amountText:"50000"}) → 5000000n', () => {
    expect(maxMinorFromArgs("record_cash_entry", { amountText: "50000" })).toBe(5000000n);
  });
});
