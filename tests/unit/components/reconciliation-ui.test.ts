import { describe, it, expect } from "vitest";
import * as React from "react";
import { ReconciliationDashboard } from "@/components/reconciliation/reconciliation-dashboard";

describe("Reconciliation UI Components", () => {
  it("renders reconciliation dashboard component without crashing", () => {
    const el = React.createElement(ReconciliationDashboard, {
      sessions: [],
      bankAccounts: [],
    });
    expect(React.isValidElement(el)).toBe(true);
  });
});
