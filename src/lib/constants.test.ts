import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  DEFAULT_SEARCH_VIEW_LIMIT,
  filterAccountOptions,
  normalizeAccount,
} from "./constants";

describe("Selector Constants & Helpers", () => {
  it("has default values: 500ms debounce and 5 view limit", () => {
    expect(DEFAULT_SEARCH_DEBOUNCE_MS).toBe(500);
    expect(DEFAULT_SEARCH_VIEW_LIMIT).toBe(5);
  });

  describe("normalizeAccount", () => {
    it("handles explicit code and name", () => {
      const acc = normalizeAccount({ id: "1", code: "1110", name: "Kas" });
      expect(acc).toEqual({
        id: "1",
        code: "1110",
        name: "Kas",
        label: "1110 · Kas",
      });
    });

    it("parses combined label format '1110 · Kas di Bank'", () => {
      const acc = normalizeAccount({ id: "2", label: "1110 · Kas di Bank" });
      expect(acc).toEqual({
        id: "2",
        code: "1110",
        name: "Kas di Bank",
        label: "1110 · Kas di Bank",
      });
    });
  });

  describe("filterAccountOptions", () => {
    const accounts = [
      { id: "1", code: "1110", name: "Kas Kecil" },
      { id: "2", code: "1120", name: "Bank BCA" },
      { id: "3", code: "1130", name: "Bank Mandiri" },
      { id: "4", code: "1210", name: "Piutang Usaha" },
      { id: "5", code: "1310", name: "Persediaan Barang" },
      { id: "6", code: "2110", name: "Utang Usaha" },
      { id: "7", code: "5110", name: "Beban Sewa" },
    ];

    it("limits empty query results to default limit (5)", () => {
      const res = filterAccountOptions(accounts, "");
      expect(res.items.length).toBe(5);
      expect(res.totalMatches).toBe(7);
      expect(res.hasMore).toBe(true);
    });

    it("matches by account number / code prefix", () => {
      const res = filterAccountOptions(accounts, "112");
      expect(res.totalMatches).toBe(1);
      expect(res.items[0]?.code).toBe("1120");
    });

    it("matches by account name (case-insensitive)", () => {
      const res = filterAccountOptions(accounts, "bank");
      expect(res.totalMatches).toBe(2);
      expect(res.items.map((i) => i.code)).toEqual(["1120", "1130"]);
    });

    it("matches single item correctly (e.g. Sewa / 5110)", () => {
      const res = filterAccountOptions(accounts, "sewa");
      expect(res.totalMatches).toBe(1);
      expect(res.items[0]?.code).toBe("5110");
    });

    it("slices matching results to limit", () => {
      const res = filterAccountOptions(accounts, "1", 3);
      expect(res.items.length).toBe(3);
      expect(res.totalMatches).toBe(7);
      expect(res.hasMore).toBe(true);
    });
  });
});
