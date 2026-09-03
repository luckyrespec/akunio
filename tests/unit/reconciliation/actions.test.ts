import { describe, it, expect } from "vitest";

describe("Reconciliation Actions Validation", () => {
  it("exports all required server action functions", async () => {
    const actions = await import("@/server/actions/reconciliation.actions");
    expect(actions.startReconciliationSessionAction).toBeDefined();
    expect(actions.runAutoMatchAction).toBeDefined();
    expect(actions.confirmMatchAction).toBeDefined();
    expect(actions.unlinkMatchAction).toBeDefined();
    expect(actions.createQuickAdjustmentAction).toBeDefined();
    expect(actions.finalizeReconciliationAction).toBeDefined();
  });
});
