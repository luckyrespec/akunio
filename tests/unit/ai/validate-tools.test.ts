import { describe, it, expect } from "vitest";
import { executeNaraTool, SAFE_TOOLS } from "@/server/ai/nara-tools";

describe("validate tools", () => {
  it("calculate_tax 11% dari 10jt = 1100000 (string, bukan BigInt mentah)", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "calculate_tax", { baseText: "10000000", ratePercent: 11 });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.success).toBe(true);
    expect(JSON.stringify(r.data)).not.toContain('n"');
    expect((r.data as { taxMinor: string }).taxMinor).toBe("110000000");
  });

  it("validate_journal_entry menolak debit!=kredit", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "validate_journal_entry", {
      lines: [
        { accountCode: "6210", debitText: "10000", creditText: "" },
        { accountCode: "1110", debitText: "", creditText: "9000" },
      ],
    });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.success).toBe(false);
  });

  it.skip("check_period perlu ledger_test, dicover integration Task 6/7", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "check_period", { dateISO: "2026-09-01" });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.success).toBe(true);
  });

  it("calculate_variance prior 0 → percentBps n/a", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "calculate_variance", {
      currentText: "10000",
      priorText: "0",
    });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.success).toBe(true);
    expect((r.data as { percentBps: string }).percentBps).toBe("n/a");
  });

  it.skip("detect_duplicate_invoice perlu ledger_test, dicover integration Task 6/7", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "detect_duplicate_invoice", {
      invoiceNumber: "INV-2026-0001",
    });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.success).toBe(true);
  });

  it("lima tool validasi terdaftar sebagai SAFE", () => {
    for (const name of [
      "calculate_tax",
      "validate_journal_entry",
      "check_period",
      "detect_duplicate_invoice",
      "calculate_variance",
    ]) {
      expect(SAFE_TOOLS.has(name), name).toBe(true);
    }
  });
});
