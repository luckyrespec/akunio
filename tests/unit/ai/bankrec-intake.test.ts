import { describe, it, expect } from "vitest";
import { BANKREC_TOOL_NAMES } from "@/server/ai/agents/split";
import { MUTATING_TOOLS, SAFE_TOOLS, TOOL_REGISTRY } from "@/server/ai/nara-tools";
import { routeIntent } from "@/server/ai/agents/router";

const BANKREC_GOLDEN = [
  "ingest_bank_statement",
  "get_bank_transactions",
  "get_book_transactions",
  "find_unmatched",
  "auto_match_bank_reconciliation",
  "get_bank_reconciliation_status",
  "get_server_time",
];

describe("bankrec split", () => {
  it("BANKREC memuat 7 tool intake+match", () => {
    expect(BANKREC_TOOL_NAMES).toEqual(BANKREC_GOLDEN);
  });

  it("nol tool journal/posting/finalize di slot bankrec", () => {
    const leak = BANKREC_TOOL_NAMES.filter((n) => /journal|posting|finalize|post_/.test(n));
    expect(leak).toEqual([]);
    for (const n of BANKREC_TOOL_NAMES) {
      expect(TOOL_REGISTRY[n], n).toBeDefined();
    }
  });

  it("ingest_bank_statement terdaftar MUTATING, 3 intake lain SAFE", () => {
    expect(MUTATING_TOOLS.has("ingest_bank_statement")).toBe(true);
    for (const n of ["get_bank_transactions", "get_book_transactions", "find_unmatched"]) {
      expect(SAFE_TOOLS.has(n)).toBe(true);
    }
  });
});

describe("routeIntent bankrec", () => {
  it('"rekonsiliasi koran BCA" → bankrec', () => {
    expect(routeIntent("rekonsiliasi koran BCA")).toBe("bankrec");
  });
  it('"selisih bank bulan ini" → bankrec', () => {
    expect(routeIntent("selisih bank bulan ini")).toBe("bankrec");
  });
  it('regresi "kenapa laba turun" → analyst', () => {
    expect(routeIntent("kenapa laba turun")).toBe("analyst");
  });
  it('regresi "upload invoice PT ABC" → invoice', () => {
    expect(routeIntent("upload invoice PT ABC")).toBe("invoice");
  });
  it('regresi "catat bayar sewa" → bookkeeping', () => {
    expect(routeIntent("catat bayar sewa")).toBe("bookkeeping");
  });
});

describe("bankrec handlers butuh DB (dicover trajectory + e2e)", () => {
  it.skip("find_unmatched/get_bank_transactions/get_book_transactions live-query", () => {});
});
