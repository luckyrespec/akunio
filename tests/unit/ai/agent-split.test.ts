import { describe, it, expect } from "vitest";
import { BOOKKEEPING_TOOL_NAMES, ANALYST_TOOL_NAMES } from "@/server/ai/agents/split";
import { MUTATING_TOOLS, TOOL_REGISTRY } from "@/server/ai/nara-tools";

describe("agent split", () => {
  it("analyst read-only: tidak ada mutating tool", () => {
    const leak = ANALYST_TOOL_NAMES.filter((n) => MUTATING_TOOLS.has(n));
    expect(leak).toEqual([]);
  });

  it("bookkeeping memuat journal+invoice+cash inti", () => {
    for (const n of ["post_journal", "create_journal_draft", "reverse_journal", "create_invoice", "record_cash_entry"]) {
      expect(BOOKKEEPING_TOOL_NAMES).toContain(n);
    }
  });

  it("semua nama ada di registry", () => {
    for (const n of [...BOOKKEEPING_TOOL_NAMES, ...ANALYST_TOOL_NAMES]) {
      expect(TOOL_REGISTRY[n], n).toBeDefined();
    }
  });
});
